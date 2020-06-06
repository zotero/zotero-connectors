/*
    ***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
					 George Mason University, Fairfax, Virginia, USA
					 http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	
	You should have received a copy of the GNU General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

(async function() {
let tabs = {};

// TODO: Garbage collect
function getTab(tabId) {
	if (tabs[tabId]) return tabs[tabId];
	return tabs[tabId] = {id: tabId};
}
	
Zotero.Connector_Browser = new function() {
	var _selectCallbacksForTabIDs = {};
	var _incompatibleVersionMessageShown;
	var _zoteroButton;
	
	this.getTab = getTab;
	this.closeTab = function(tab) {
		Zotero.Messaging.sendMessage('Swift.closeTab', [tab.id]);
	}
	
	this.getExtensionVersion = async function() {
		return Zotero.Messaging.sendMessage("Swift.getVersion");
	}
	
	/**
	 * Called when a new page has been loaded to clear previous translators
	 */
	this.onPageLoad = function(title, url, tab) {
		tab.title = title;
		tab.url = url;
		tab.instanceID = 0;
		if (Zotero.Proxies.transparent) {
			Zotero.Proxies.onPageLoadSafari(tab);
		}

		if (tab.translators) {
			tab.isPDFFrame = false;
			tab.translators = null;
		}
		_updateButtonStatus(tab);
	};
	
	this.onTabFocus = _updateButtonStatus;
	
	/**
	 * If there's a frame with a PDF mimeType this gets invoked
	 * @param frameURL
	 * @param tabId
	 */
	this.onPDFFrame = function(frameURL, instanceID, tab) {
		if (tab.translators && tab.translators.length) {
			return;
		}
		tab.isPDFFrame = true;
		tab.instanceID = instanceID;
		_updateButtonStatus(tab);
	}
	
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab) {
		tab.contentType = contentType;
		if (!translators.length) {
			return _updateButtonStatus(tab);
		}
		
		let existingTranslators = tab.translators;
		// If translators already exist for tab we need to figure out if the new translators
		// are more important/higher priority
		if (existingTranslators && existingTranslators.length) {
			let existingTranslatorsHaveHigherPriority = existingTranslators[0].priority < translators[0].priority;
			if (existingTranslatorsHaveHigherPriority) return;
			
			let priorityEqual = translators[0].priority == existingTranslators[0].priority;
			let newTranslatorsAreFromTopFrame = instanceID == 0;
			if (priorityEqual && !newTranslatorsAreFromTopFrame) return;
		}
		
		tab.translators = translators;
		tab.instanceID = instanceID;
		tab.isPDFFrame = false;

		_updateButtonStatus(tab);
	}
	
	/**
	 * Called when Zotero button is pressed
	 */
	this.onPerformCommand = function(tab) {
		if (_isDisabledForURL(tab.url)) return;
		if (tab.translators && tab.translators.length) {
			Zotero.Connector_Browser.saveWithTranslator(tab,
				tab.translators[0].translatorID, {fallbackOnFailure: true});
		} else {
			var withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
				Zotero.Prefs.get('automaticSnapshots');
			Zotero.Connector_Browser.saveAsWebpage(tab, { snapshot: withSnapshot });
		}
	}
		
		
	/**
	 * Called when Zotero goes online or offline
	 */
	this.onStateChange = function() {
		if (Zotero.Connector.isOnline) {
			Zotero.Prefs.set('firstSaveToServer', true);
		}
	};
	
	// Received after global page init and restart
	this.onTabData = function(data, tab) {
		Object.assign(tab, data);
		_updateButtonStatus(tab);
	};

	this.saveWithTranslator = function(tab, translatorID, options) {
		return Zotero.Messaging.sendMessage(
			"translate",
			[
				tab.instanceID,
                translatorID,
				options
			],
			tab
		);
	}

	this.saveAsWebpage = function(tab, options) {
		let title = tab.title.split('/');
		title = title[title.length-1];
		return Zotero.Messaging.sendMessage(
			"saveAsWebpage",
			[
				tab.instanceID || 0,
				[
					title,
					options
				]
			],
			tab
		);
	}

	// To say that we have some indirection here would be an understatement
	// but we want to maintain as compatible an API with browserExt as possible
	this.openWindow = function(url, options={}) {
		let args = [url];
		if (typeof options.onClose == 'function') {
			args.push(options.onClose);
		}
		Zotero.Messaging.sendMessage('Swift.openWindow', args);
	};
	
	this.openTab = function(url) {
		Zotero.Messaging.sendMessage('Swift.openTab', [url]);
	};
	
	this.bringToFront = async function() {
		// Unlikely to do anything
		Zotero.Messaging.sendMessage('Swift.activate');
	};

	this.openPreferences = function(paneID="") {
		Zotero.Connector_Browser.openTab(`${safari.extension.baseURI}safari/` + `preferences/preferences.html#${paneID}`);
	};

	this.openConfigEditor = function() {
		Zotero.Connector_Browser.openTab(`${safari.extension.baseURI}safari/` + "preferences/config.html");
	};
	
	this.isIncognito = function(tab) {
		return false;
	}
	
	/**
	 * Display an old-school firefox notification by injecting HTML directly into DOM.
	 * This has a side-effect of navigation (user-initiated or JS-redirect-based)
	 * removing the notification so we keep on re-injecting it into DOM.
	 *
	 * The timeout argument specifies how long the notification has to be displayed for
	 * without navigation, before it is considered "seen" and further navigation on the tab
	 * will not make it re-appear.
	 *
	 * @param {String} text
	 * @param {String[]} buttons - labels for buttons
	 * @param {Number} [seenTimeout=5000]
	 * @param {Tab} [tab=currentTab]
	 * @returns {Promise{Number}} button pressed idx or undefined if timed-out and navigated away from
	 */
	this.notify = async function(text, buttons, seenTimeout=5000, tab) {
		await Zotero.Promise.delay(1000);
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		var response = await Zotero.Messaging.sendMessage('notify', [text, buttons, null, 'complete'], tab);
		if (response != undefined || timedOut) return response;

		// Tab url changed or tab got removed, hence the undefined response
		// Wait a sec to not run a busy-waiting loop
		await Zotero.Promise.delay(1000);
		return this.notify(text, buttons, seenTimeout, tab);
	}
	
	this.onContextMenuItem = function(args, tab) {
		const [translatorID] = args;
		switch (translatorID) {
			case "prefs":
				Zotero.Connector_Browser.openPreferences();
				break;
			case "withSnapshot":
			case "withoutSnapshot":
				Zotero.Connector_Browser.saveAsWebpage(tab, {
					snapshot: translatorID == "withSnapshot"
				});
				break;
			default:
				Zotero.Connector_Browser.saveWithTranslator(tab, translatorID, {fallbackOnFailure: false});
		}
	};

	function _isDisabledForURL(url) {
		return !url || url.includes('file://') || url.startsWith(`${safari.extension.baseURI}safari/`);
	}

	/**
	 * Update status and tooltip of Zotero button
	 * 
	 * Called on changing tabs, translator update or when Zotero goes online/offline
	 */
	async function _updateButtonStatus(tab) {
		var translators = tab.translators;
		var isPDF = tab.contentType == 'application/pdf' || tab.isPDFFrame;
		let image, tooltip;
		if (_isDisabledForURL(tab.url)) {
			[image, tooltip] = await _showZoteroStatus(tab);
			Zotero.Messaging.sendMessage("Swift.updateButton", [image, tooltip, []], tab);
			return;
		}
		
		let contextItemList = [];
		const finalItems = [
			["withSnapshot", "Save to Zotero (Web Page with Snapshot)"],
			["withoutSnapshot", "Save to Zotero (Web Page without Snapshot)"]
		];

		if (translators && translators.length) {
			for (let translator of translators) {
				contextItemList.push([translator.translatorID, _getTranslatorLabel(translator)])
			}
			[image, tooltip] = _showTranslatorIcon(translators[0], tab);
		} else if (isPDF) {
			contextItemList.push(["pdf", "Save to Zotero (PDF)"]);
			[image, tooltip] = _showPDFIcon(tab);
		} else {
			[image, tooltip] = _showWebpageIcon(tab);
		}
		Zotero.Messaging.sendMessage("Swift.updateButton", [image, tooltip, contextItemList.concat(finalItems)], tab)
	}

	async function _showZoteroStatus() {
		let isOnline = await Zotero.Connector.checkIsOnline();
		let image, tooltip;
		if (isOnline) {
			image = "images/toolbar/zotero-new-z-16px.png";
			tooltip = "Zotero is Online";
		} else {
			image = "images/toolbar/zotero-z-16px-offline.png";
			tooltip = "Zotero is Offline";
		}
		return [image, tooltip]
	}

	function _showTranslatorIcon(translator) {
		let image = "images/toolbar/treesource-collection.png";
		if (translator.itemType !== "multiple") {
			image = Zotero.ItemTypes.getImageSrc(translator.itemType).replace('images/', 'images/toolbar/')
				.replace(`${safari.extension.baseURI}safari/`, '');
			
		}
		let tooltip = _getTranslatorLabel(translator);
		return [image, tooltip]
	}

	function _showWebpageIcon() {
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		let image = Zotero.ItemTypes.getImageSrc("webpage-gray").replace('images/', 'images/toolbar/')
			.replace(`${safari.extension.baseURI}safari/`, '');
		let tooltip = `"Save to Zotero (Web Page with${withSnapshot ? "" : "out"} Snapshot)"`;
		return [image, tooltip];
	}

	function _showPDFIcon() {
		let image = "images/toolbar/pdf.png";
		let tooltip = "Save to Zotero (PDF)";
		return [image, tooltip]
	}

	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		if(translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}

		return "Save to Zotero (" + translatorName + ")";
	}
	
};

let globalInitialized = false;
Zotero.Messaging.addMessageListener("buttonClick", Zotero.Connector_Browser.onPerformCommand);
Zotero.Messaging.addMessageListener("onContextMenuItem", Zotero.Connector_Browser.onContextMenuItem);
Zotero.Messaging.addMessageListener('ping', () => globalInitialized);

await Zotero.initGlobal();
// Setting `${safari.extension.baseURI}safari/` for consistent access of resources in
// injected and global pages
globalInitialized = true;
Zotero.Messaging.sendMessage('Swift.globalAvailable');

})();
