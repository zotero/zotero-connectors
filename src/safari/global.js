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

Zotero.Connector_Browser = new function() {
	var _selectCallbacksForTabIDs = {};
	var _incompatibleVersionMessageShown;
	var _zoteroButton;
	
	this.activeTab = null;

	/**
	 * Called when a new page has been loaded to clear previous translators
	 */
	this.onPageLoad = function(tab) {
		_updateButtonStatus();
		if (Zotero.Proxies.transparent) {
			Zotero.Proxies.onPageLoadSafari(tab);
		}
	};
	
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
		if (!translators.length) return;
		tab.contentType = contentType;
		
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

		_updateButtonStatus();
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, tab) {
		var deferred = Zotero.Promise.defer();
		var newTab = safari.application.openBrowserWindow().activeTab;
		newTab.url = safari.extension.baseURI+"itemSelector/itemSelector.html#"+encodeURIComponent(JSON.stringify([tab.id, items]));
		_selectCallbacksForTabIDs[tab.id] = deferred.resolve;
		return deferred.promise;
	}
	
	/**
	 * Called when select items dialog is closed to pass data back to injected script
	 */
	this.onSelectDone = function(data) {
		_selectCallbacksForTabIDs[data[0]](data[1]);
		delete _selectCallbacksForTabIDs[data[0]];
	}
	
	/**
	 * Called when Zotero button is pressed
	 */
	this.onPerformCommand = function(event) {
		var command = event.command;
		var tab = safari.application.activeBrowserWindow.activeTab;
		if (command === "zotero-button") {
			if(tab.translators && tab.translators.length) {
				Zotero.Connector_Browser.saveWithTranslator(tab, 0);
			} else {
				var withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
					Zotero.Prefs.get('automaticSnapshots');
				Zotero.Connector_Browser.saveAsWebpage(tab, withSnapshot);
			}
		} else if (command === "zotero-preferences") {
			Zotero.Connector_Browser.openTab(safari.extension.baseURI+"preferences/preferences.html");
		}
	}
	
	/**
	 * Called to determine if current page can be scraped
	 */
	this.onValidateCommand = function(event) {
		if(event.command === "zotero-button") {
			Zotero.Connector_Browser.activeTab = safari.application.activeBrowserWindow.activeTab;
			_zoteroButton = event.target;
			_updateButtonStatus();
		}
	}
		
	/**
	 * Called when Zotero goes online or offline
	 */
	this.onStateChange = function() {
		if (Zotero.Connector.isOnline) {
			Zotero.Prefs.set('firstSaveToServer', true);
		}
		else {
			Zotero.debug("Standalone went offline, invalidating standalone translators");
			for (let browserWindow of safari.application.browserWindows) {
				for (let tab of browserWindow.tabs) {
					if (tab.translators && tab.translators.length) {
						tab.translators = tab.translators.filter(
							(t) => t.runMode !== Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE);
					}
				}
			}
			_updateButtonStatus();
		}
	};
	
	/**
	 * Called if Zotero version is determined to be incompatible with Standalone
	 */
	this.onIncompatibleStandaloneVersion = function(zoteroVersion, standaloneVersion) {
		if(_incompatibleVersionMessageShown) return;
		alert('Zotero Connector for Safari '+zoteroVersion+' is incompatible with the running '+
			'version of Zotero Standalone'+(standaloneVersion ? " ("+standaloneVersion+")" : "")+
			'. Zotero Connector will continue to operate, but functionality that relies upon '+
			'Zotero Standalone may be unavaliable.\n\n'+
			'Please ensure that you have installed the latest version of these components. See '+
			'https://www.zotero.org/support/standalone for more details.');
		_incompatibleVersionMessageShown = true;
	}

	this.saveWithTranslator = function(tab, i) {
		return Zotero.Messaging.sendMessage("translate", [tab.instanceID, tab.translators[i].translatorID], tab);
	}

	this.saveAsWebpage = function(tab, withSnapshot) {
		let title = tab.title.split('/');
		title = title[title.length-1];
		return Zotero.Messaging.sendMessage("saveAsWebpage", [tab.instanceID || 0, [title, withSnapshot]], tab);
	}

	this.openTab = function(url) {
		safari.application.activeBrowserWindow.openTab().url = url;
	};

	this.openPreferences = function(paneID) {
		Zotero.Connector_Browser.openTab(safari.extension.baseURI + `preferences/preferences.html#${paneID}`);
	};

	this.openConfigEditor = function() {
		Zotero.Connector_Browser.openTab(safari.extension.baseURI + "preferences/config.html");
	};
	
	
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
	this.notify = async function(text, buttons, seenTimeout=5000, tab=null) {
		await Zotero.Promise.delay(1000);
		// Get current tab if not provided
		if (!tab) {
			tab = safari.application.activeBrowserWindow.activeTab;
		}
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		var response = await Zotero.Messaging.sendMessage('notify', [text, buttons, null, 'complete'], tab);
		if (response != undefined || timedOut) return response;

		// Tab url changed or tab got removed, hence the undefined response
		// Wait a sec to not run a busy-waiting loop
		await Zotero.Promise.delay(1000);
		return this.notify(text, buttons, seenTimeout, tab);
	}
		

	function _isDisabledForURL(url, excludeTests=false) {
		return !url || url.includes('file://') || (url.includes('-extension://') && (!excludeTests || !url.includes('/test/data/')));
	}

	/**
	 * Update status and tooltip of Zotero button
	 * 
	 * Called on changing tabs or when Zotero goes offline
	 */
	function _updateButtonStatus() {
		if (!_zoteroButton) return;
		
		var tab = safari.application.activeBrowserWindow.activeTab;
		if (_isDisabledForURL(tab.url, true)) {
			_showZoteroStatus();
			return;
		}
		_zoteroButton.disabled = false;
		var translators = tab.translators;
		var isPDF = tab.contentType == 'application/pdf';

		if (translators && translators.length) {
			_showTranslatorIcon(translators[0]);
		} else if (isPDF || tab.isPDFFrame) {
			Zotero.Connector_Browser._showPDFIcon();
		} else {
			_showWebpageIcon();
		}
	}
	
	function _showZoteroStatus() {
		_zoteroButton.disabled = true;
		Zotero.Connector.checkIsOnline().then(function(isOnline) {
			if (isOnline) {
				_zoteroButton.image = safari.extension.baseURI+"images/toolbar/zotero-new-z-16px.png";
				_zoteroButton.toolTip = "Zotero is Online";
			} else {
				_zoteroButton.image = safari.extension.baseURI+"images/toolbar/zotero-z-16px-offline.png";
				_zoteroButton.toolTip = "Zotero is Offline";
			}
		});
	}

	function _showTranslatorIcon(translator) {
		var itemType = translator.itemType;
		_zoteroButton.image = (itemType === "multiple"
						? safari.extension.baseURI + "images/toolbar/treesource-collection.png"
						: Zotero.ItemTypes.getImageSrc(itemType).replace('images/', 'images/toolbar/'));
		_zoteroButton.toolTip = _getTranslatorLabel(translator);
	}

	function _showWebpageIcon() {
		_zoteroButton.image = Zotero.ItemTypes.getImageSrc("webpage-gray").replace('images/', 'images/toolbar/');
		var withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		if (withSnapshot) {
			_zoteroButton.toolTip = "Save to Zotero (Web Page with Snapshot)";
		} else {
			_zoteroButton.toolTip = "Save to Zotero (Web Page without Snapshot)";
		}
	}

	this._showPDFIcon = function() {
		_zoteroButton.image = safari.extension.baseURI + "images/toolbar/pdf.png";
		_zoteroButton.toolTip = "Save to Zotero (PDF)";
	}

	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		if(translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}

		return "Save to Zotero (" + translatorName + ")";
	}
}

// register handlers
safari.application.addEventListener("command", Zotero.Connector_Browser.onPerformCommand, false);
safari.application.addEventListener("validate", Zotero.Connector_Browser.onValidateCommand, false);
safari.application.addEventListener('activate', function(e) {
	Zotero.Connector.reportActiveURL(e.target.url);
}, true);
safari.application.addEventListener('beforeNavigate', function(e) {
	if (e.target == safari.application.activeBrowserWindow.activeTab) {
		Zotero.Connector.reportActiveURL(e.target.url);
	}
	if (e.target.translators) {
		e.target.translators = null;
		e.target.isPDFFrame = false;
	}
}, true);
Zotero.Messaging.addMessageListener("selectDone", Zotero.Connector_Browser.onSelectDone);

// initialize
Zotero.initGlobal();
