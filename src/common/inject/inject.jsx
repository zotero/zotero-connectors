/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

// import PageSaving from "./pageSaving.js";
let PageSaving;

var isTopWindow = false;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}
if (isTopWindow) {
	Zotero.Messaging.addMessageListener("confirm", function (props) {
		return Zotero.Inject.confirm(props);
	});

	Zotero.Messaging.addMessageListener("notify", (args) => Zotero.Inject.notify.apply(this, args));
	
	Zotero.Messaging.addMessageListener("ping", function () {
		// Respond to indicate that script is injected
		return 'pong';
	});
}

// check whether this is a hidden browser window being used for scraping
var isHiddenIFrame = false;
try {
	isHiddenIFrame = !isTopWindow && window.frameElement && window.frameElement.style.display === "none";
} catch(e) {}

// Iframes where we inject translation can be non-text/html,
// and we shouldn't even bother translating them
// (and it also causes errors to be thrown when trying to create a ZoteroFrame)
// Update: Except for 'application/pdf', like on https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=9919149
const isAllowedIframeContentType = ['text/html', 'application/pdf'].includes(document.contentType);

// Do not run on non-web pages (file://), test pages, safari extension pages (i.e. safari prefs)
// or non-top Safari pages
const isWeb = window.location.protocol === "http:" || window.location.protocol === "https:";
const isTestPage = Zotero.isBrowserExt && window.location.href.startsWith(browser.runtime.getURL('test'));

// Not scraping on hidden iframes and only select frames
const shouldInject = isWeb && !isTestPage && !isHiddenIFrame && (isTopWindow || isAllowedIframeContentType)

var instanceID = isTopWindow ? 0 : (new Date()).getTime();

/**
 * @namespace
 */
Zotero.Inject = {
	
	async init() {
		if (!shouldInject) return;
		PageSaving = (await import(Zotero.getExtensionURL("inject/pageSaving.js"))).default;
		
		await Zotero.initInject();
		// Zotero namespace APIs now initialized
		
		document.addEventListener("ZoteroItemUpdated", function() {
			Zotero.debug("Inject: ZoteroItemUpdated event received");
			Zotero.Messaging.sendMessage("pageModified", null);
		}, false);
		
		this._addMessageListeners();
		
		this._handleOAuthComplete()

		if(document.readyState !== "complete") {
			window.addEventListener("pageshow", function(e) {
				if(e.target !== document) return;
				return PageSaving.onPageLoad(e.persisted);
			}, false);
		} else {
			return PageSaving.onPageLoad();
		}	
	},

	/**
	 * Call OAuth complete listeners if on the relevant URL
	 */
	_handleOAuthComplete() {
		if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH.ZOTERO.CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH.ZOTERO.CALLBACK_URL+"?") {
			Zotero.API.onAuthorizationComplete(document.location.href.substr(ZOTERO_CONFIG.OAUTH.ZOTERO.CALLBACK_URL.length+1));
		} else if (document.location.href.substr(0, ZOTERO_CONFIG.OAUTH.ZOTERO.CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH.GOOGLE_DOCS.CALLBACK_URL+"#") {
			Zotero.GoogleDocs_API.onAuthComplete(document.location.href);
		}
	},
	
	_addMessageListeners() {
		// add listener for translate message from background page
		Zotero.Messaging.addMessageListener("translate", function(data) {
			if (data.shift() !== instanceID) return;
			return PageSaving.onTranslate(...data);
		});
		// add a listener to save as webpage when translators unavailable
		Zotero.Messaging.addMessageListener("saveAsWebpage", function(data) {
			if (Zotero.isSafari) {
				if (data[0] !== instanceID) return;
				return PageSaving.onSaveAsWebpage(data[1]);
			} else {
				return PageSaving.onSaveAsWebpage(data);
			}
		});
		Zotero.Messaging.addMessageListener('updateSession', (data) => {
			return PageSaving.onUpdateSession(data);
		})
		// add listener to rerun detection on page modifications
		Zotero.Messaging.addMessageListener("pageModified", Zotero.Utilities.debounce(function() {
			PageSaving.onPageLoad(true);
		}, 1000));
		Zotero.Messaging.addMessageListener('historyChanged', Zotero.Utilities.debounce(function() {
			PageSaving.onPageLoad(true);
		}, 1000));

		Zotero.Messaging.addMessageListener("firstUse", function () {
			return Zotero.Inject.firstUsePrompt();
		});

		Zotero.Messaging.addMessageListener("expiredBetaBuild", function () {
			return Zotero.Inject.expiredBetaBuildPrompt();
		});

		// Cannot copy to clipboard in the background page
		Zotero.Messaging.addMessageListener("clipboardWrite", function (text) {
			navigator.clipboard.writeText(text);
		});
	},
	
	/**
	 * Check if React and components are loaded and if not - load into page.
	 * 
	 * This is a performance optimization - we want to avoid loading React into every page.
	 * 
	 * @param components {Object[]} an array of component names to load
	 * @return {Promise} resolves when components are injected
	 */
	async loadReactComponents(components=[]) {
		if (Zotero.isSafari) return;
		var toLoad = [];
		if (typeof ReactDOM === "undefined" || typeof React === "undefined"
				|| !React.useState) {
			toLoad = [
				'lib/react.js',
				'lib/react-dom.js',
				'lib/prop-types.js'
			];
		}
		for (let component of components) {
			if (!Zotero.UI || !Zotero.UI[component]) {
				toLoad.push(`ui/${component}.js`)
			}
		}
		if (toLoad.length) {
			return Zotero.Connector_Browser.injectScripts(toLoad);
		}
	},

	async confirm(props) {
		await Zotero.initializedPromise;
		// Remove MV3 importConfirm hash from the history after displaying the prompt so that going back
		// does not trigger repeat prompts
		let resultPromise = Zotero.ModalPrompt.confirm(props);
		resultPromise.then(() => {
			let url = new URL(document.location.href)
			if (url.hash.includes('importConfirm')) {
				url.hash = "";
				history.replaceState(null, "", url.href)
			}
		});
		return resultPromise;
	},

	/**
	 * Display an old-school firefox notification by injecting HTML directly into DOM.
	 * 
	 * @param {String} text
	 * @param {String[]} buttons - labels for buttons
	 * @param {Number} timeout - notification gets removed after this timeout
	 * @param {String} tabStatus - available on chrome.Tab.status in background scripts
	 * @returns {Number} button pressed
	 */
	notify: new function() {
		var lastChainedPromise = Zotero.Promise.resolve();
		return function(text, buttons, timeout, tabStatus) {
			// This is a little awkward, because the tab status is passed from the background script to
			// the content script, but chrome.tabs is unavailable in content scripts.
			//
			// If we're navigating somewhere don't display the notification, because it looks dumb.
			// The navigation will re-trigger this method from the background script.
			if (tabStatus != 'complete') return;

			let showNotificationPrompt = async function() {
				await Zotero.Promise.delay(500);
				await Zotero.Connector_Browser.injectScripts('ui/Notification.js');
				
				this.notification = new Zotero.UI.Notification(text, buttons);
				if (timeout) setTimeout(() => {
					this.notification.dismiss()
					this.notification = null;
				}, timeout);
				return this.notification.show();
			}.bind(Zotero.Inject);
			
			// Sequentialize notification display
			lastChainedPromise = lastChainedPromise.then(showNotificationPrompt);
			return lastChainedPromise;
		}
	},
	
	async expiredBetaBuildPrompt() {
		return this.confirm({
			title: "Build Expired",
			button1Text: "OK",
			button2Text: "",
			message: `This Zotero Connector beta build has expired. Please download the latest version from zotero.org.`
		});
	},

	async firstUsePrompt() {
		var clientName = ZOTERO_CONFIG.CLIENT_NAME;
		return this.confirm({
			title: Zotero.getString('firstRun_title', clientName),
			button1Text: Zotero.getString('firstRun_acceptButton'),
			button2Text: "",
			message: Zotero.getString(
					'firstRun_text1',
					[
						clientName,
						"https://www.zotero.org/support/adding_items_to_zotero"
					]
				)
				+ '<br><br>'
				+ Zotero.getString(
					'firstRun_text2',
					[
						clientName,
						// TODO: Make download URL configurable (instead of just base URL + "download")
						ZOTERO_CONFIG.WWW_BASE_URL + "download/"
					]
				)
		});
	},
	
	async firstSaveToServerPrompt() {
		var clientName = ZOTERO_CONFIG.CLIENT_NAME;
		
		var result = await this.confirm({
			button1Text: Zotero.getString('general_tryAgain'),
			button2Text: Zotero.getString('general_cancel'),
			button3Text: Zotero.getString('error_connection_enableSavingToOnlineLibrary'),
			title: Zotero.getString('error_connection_isAppRunning', clientName),
			message: Zotero.getString(
					'error_connection_save',
					[
						Zotero.getString('appConnector', clientName),
						clientName,
						ZOTERO_CONFIG.DOMAIN_NAME
					]
				)
				+ '<br /><br />'
				+ Zotero.Inject.getConnectionErrorTroubleshootingString()
		});
		
		switch (result.button) {
			case 1:
				return 'retry';
			
			case 3:
				return 'server';
			
			default:
				return 'cancel';
		}
	},
	
	getConnectionErrorTroubleshootingString() {
		var clientName = ZOTERO_CONFIG.CLIENT_NAME;
		var connectorName = Zotero.getString('appConnector', ZOTERO_CONFIG.CLIENT_NAME);
		var downloadLink = 'https://www.zotero.org/download/';
		var troubleshootLink = 'https://www.zotero.org/support/kb/connector_zotero_unavailable';
		return Zotero.getString(
			'error_connection_downloadOrTroubleshoot',
			[downloadLink, clientName, troubleshootLink]
		);
	},
	
	/**
	 * If Zotero is offline and attempting action fallback to zotero.org for first time: prompts about it
	 * Prompt only available on BrowserExt which supports programmatic injection
	 * Otherwise just resolves to true
	 * 
	 * return {Promise<Boolean>} whether the action should proceed
	 */
	async checkActionToServer() {
		var [firstSaveToServer, zoteroIsOnline] = await Zotero.Promise.all([
			Zotero.Prefs.getAsync('firstSaveToServer'), 
			Zotero.Connector.checkIsOnline()
		]);
		if (zoteroIsOnline || !firstSaveToServer) {
			return true;
		}
		var result = await this.firstSaveToServerPrompt();
		if (result == 'server') {
			Zotero.Prefs.set('firstSaveToServer', false);
			return true;
		} else if (result == 'retry') {
			// If we perform the retry immediately and Zotero is still unavailable the prompt returns instantly
			// making the user interaction confusing so we wait a bit first
			await Zotero.Promise.delay(500);
			return this.checkActionToServer();
		}
		return false;
	},
	
	addKeyboardShortcut(eventDescriptor, fn, elem) {
		elem = elem || document;
		let listener = (event) => {
			for (let prop in eventDescriptor) {
				if (event[prop] != eventDescriptor[prop]) return;
			}
			event.stopPropagation();
			event.preventDefault();
			fn();
		};
		elem.addEventListener('keydown', listener);
		return () => {
			elem.removeEventListener('keydown', listener);
		};
	}
};

// Wait until pages in prerender state become visible before injecting
if (document.visibilityState == 'prerender') {
	var handler = function() {
		Zotero.Inject.init();
		document.removeEventListener("visibilitychange", handler);
	};
	document.addEventListener("visibilitychange", handler);
} else {
	Zotero.Inject.init();
}