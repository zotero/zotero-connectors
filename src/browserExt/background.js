/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009-2012 Center for History and New Media
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

Zotero.Connector_Browser = new function() {
	var _tabInfo = {};
	var _incompatibleVersionMessageShown;
	this._tabInfo = _tabInfo;

	// Exposed for injected script access
	this.injectScripts = Zotero.Extension.ScriptInjection.injectScripts;
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab, frameId) {
		browser.browserAction.enable(tab.id);

		let existingTranslators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		// If translators already exist for tab we need to figure out if the new translators
		// are more important/higher priority
		if (existingTranslators) {
			if (!translators.length) return;
			
			if (existingTranslators.length) {
				let existingTranslatorsHaveHigherPriority = existingTranslators[0].priority < translators[0].priority;
				if (existingTranslatorsHaveHigherPriority) return;
				
				let priorityEqual = translators[0].priority == existingTranslators[0].priority;
				let newTranslatorsAreFromTopFrame = frameId == 0;
				if (priorityEqual && !newTranslatorsAreFromTopFrame) return;
			}	
		}
		
		var isPDF = contentType == 'application/pdf';
		_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {injections: {}}, {translators, instanceID, isPDF});
		
		Zotero.Connector_Browser.updateExtensionUI(tab);
	}

	/**
	 * If there's a frame with a PDF mimeType this gets invoked
	 * @param frameURL
	 * @param tabId
	 */
	this.onPDFFrame = function(frameURL, frameId, tabId) {
		if (_tabInfo[tabId] && _tabInfo[tabId].translators) {
			return;
		}
		browser.tabs.get(tabId).then(function(tab) {
			_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {injections: {}}, {translators: [], isPDF: true, frameId});
			Zotero.Extension.ScriptInjection.injectTranslationScripts(tab, frameId);
			Zotero.Connector_Browser.updateExtensionUI(tab);
		});
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, tab) {
		var width, height, left, top;
		return browser.windows.get(tab.windowId, null).then(function (win) {
			width = 600;
			height = 325;
			left = Math.floor(win.left + (win.width / 2) - (width / 2));
			top = Math.floor(win.top + (win.height / 2) - (height / 2));
			
			return browser.windows.create(
				{
					url: browser.extension.getURL("itemSelector/itemSelector.html")
						+ "#" + encodeURIComponent(JSON.stringify([tab.id, items]))
						// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
						.replace(/%3A/g, 'ZOTEROCOLON'),
					height: height,
					width: width,
					top: top,
					left: left,
					type: 'popup'
				})
		}).then(async function (win) {
			// Fix positioning in Chrome when window is on second monitor
			// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
			if (Zotero.isBrowserExt && win.left < left) {
				browser.windows.update(win.id, {left});
			}
			// Fix a Firefox bug where content does not appear before resize on linux
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1402110
			// this one might actually get fixed, unlike the one above
			if (Zotero.isFirefox) {
				await Zotero.Promise.delay(1000);
				browser.windows.update(win.id, {width: win.width+1});
			}
			return new Promise(function(resolve) {
				_tabInfo[tab.id].selectCallback = resolve;
			});
		});
	}
	
	/**
	 * Called when a tab is removed or the URL has changed
	 */
	this.onPageLoad = function(tab) {
		if(tab) _clearInfoForTab(tab.id);
	}
	
	/**
	 * Called when Zotero goes online or offline
	 * @param [String|Boolean] version - either `false` or version string from X-Zotero-Version header
	 */
	this.onStateChange = function(version) {
		if (version) {
			Zotero.Prefs.set('firstSaveToServer', true);
			// TODO: Enable once 5.0 is out, so that ContentTypeHandlers show an upgradeClient message instead
			parseInt(version[0]) >= 5 && Zotero.ContentTypeHandler.enable();
		} else {
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	this.onTabActivated = function(tab) {
		Zotero.Connector_Browser.updateExtensionUI(tab);
	};
	
	/**
	 * Called if Zotero version is determined to be incompatible with Standalone
	 */
	this.onIncompatibleStandaloneVersion = function(zoteroVersion, standaloneVersion) {
		if(_incompatibleVersionMessageShown) return;
		alert('Zotero Connector for Chrome '+zoteroVersion+' is incompatible with the running '+
			'version of Zotero Standalone'+(standaloneVersion ? " ("+standaloneVersion+")" : "")+
			'. Zotero Connector will continue to operate, but functionality that relies upon '+
			'Zotero Standalone may be unavaliable.\n\n'+
			'Please ensure that you have installed the latest version of these components. See '+
			'https://www.zotero.org/download for more details.');
		_incompatibleVersionMessageShown = true;
	}

	/**
	 * Checks whether a given frame has any matching translators. Injects translation code
	 * if translators are found.
	 * 
	 * @param tab
	 * @param frameId
	 * @param url - url of the frame
	 */
	this.onFrameLoaded = Zotero.Promise.method(function(tab, frameId, url) {
		if (this.isDisabledForURL(tab.url) && frameId == 0 || this.isDisabledForURL(url)) {
			return;
		}
		Zotero.debug("Connector_Browser: onFrameLoaded for " + tab.url + "; " + url);
		if (frameId == 0) {
			// Injected via the manifest file
			return;
		} else {
			if (!(tab.id in _tabInfo)) {
				_tabInfo[tab.id] = {};
			}
			if (!_tabInfo[tab.id].frameChecked) {
				// Also in the first frame detected
				// See https://github.com/zotero/zotero-connectors/issues/156
				_tabInfo[tab.id].frameChecked = true;
				return Zotero.Extension.ScriptInjection.injectTranslationScripts(tab, frameId);
			}
		}
		// Frame url shouldn't ever match the tab url but sometimes it does and causes weird
		// injections. We explicitly ignore it here.
		if (url == tab.url) {
			Zotero.debug(`Ignoring frame ${frameId} with a tab matching url ${tab.url}`);
			return;
		}
		return Zotero.Translators.getWebTranslatorsForLocation(url, tab.url).then(function(translators) {
			if (translators[0].length == 0) {
				Zotero.debug("Not injecting. No translators found for [tab.url, url]: " + tab.url + " , " + url);
				return;
			}
			Zotero.debug(translators[0].length+  " translators found. Injecting into [tab.url, url]: " + tab.url + " , " + url);
			return Zotero.Extension.ScriptInjection.injectTranslationScripts(tab, frameId);
		});
	});
	
	this.isIncognito = function(tab) {
		return tab.incognito;
	}

	this.openTab = function(url, tab) {
		if (tab) {
			let tabProps = { index: tab.index + 1 };
			// Firefox doesn't support openerTabId
			if (!Zotero.isFirefox) {
				tabProps.openerTabId = tab.id;
			}
			browser.tabs.create(Object.assign({url}, tabProps));
		} else {
			browser.tabs.query({active: true, lastFocusedWindow: true}).then((tabs) => this.openTab(url, tabs[0]));
		}
	};
	
	this.openPreferences = function(paneID, tab) {
		this.openTab(browser.extension.getURL(`preferences/preferences.html#${paneID}`), tab);
	};
	
	this.openConfigEditor = function(tab) {
		this.openTab(browser.extension.getURL(`preferences/config.html`), tab);
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
		// Get current tab if not provided
		if (!tab) {
			return browser.tabs.query({active: true, lastFocusedWindow: true})
			.then((tabs) => this.notify(text, buttons, seenTimeout, tabs[0]));
		} else if (typeof tab === 'number') {
			return browser.tabs.get(tab).then((tab) => this.notify(text, buttons, seenTimeout, tab));
		}
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		var response = await Zotero.Messaging.sendMessage('notify', [text, buttons, null, tab.status], tab)
		if (response != undefined || timedOut) return response;
		
		// Tab url changed or tab got removed, hence the undefined response
		// Wait half a sec to not run a busy-waiting loop
		await Zotero.Promise.delay(500)
		var tab = await browser.tabs.get(tab.id)
		if (!tab) return;
		// If it still exists try again
		return this.notify(text, buttons, seenTimeout, tab);
	};

	/**
	 * Update status and tooltip of Zotero button
	 */
	this.updateExtensionUI = function(tab) {
		Zotero.Extension.Button.update(tab, _tabInfo[tab.id]);
		Zotero.Extension.ContextMenu.update(tab, _tabInfo[tab.id]);
	};
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID, changeInfo) {
		if (tabID in _tabInfo) {
			_tabInfo[tabID].frameChecked = false;
		}
		if (changeInfo && !changeInfo.url) return;
		delete _tabInfo[tabID];
	}
	
	function _updateInfoForTab(tab) {
		if (!(tab.id in _tabInfo)) {
			_tabInfo[tab.id] = {
				url: tab.url,
				injections: {}
			}
		}
		if (_tabInfo[tab.id].url != tab.url) {
			Zotero.debug(`Connector_Browser: URL changed from ${_tabInfo[tab.id].url} to ${tab.url}`);
			if (_tabInfo[tab.id].injections) {
				for (let frameId in _tabInfo[tab.id].injections) {
					_tabInfo[tab.id].injections[frameId].reject(new Error(`URL changed for tab ${tab.url}`));
				}
			}
			_tabInfo[tab.id] = {
				url: tab.url,
				injections: {}
			};
		}
	}
	
	this.isDisabledForURL = function(url, excludeTests=false) {
		return url.includes('chrome://') || url.includes('about:') || (url.includes('-extension://') && (!excludeTests || !url.includes('/test/data/')));
	}
	
	this.saveWithTranslator = function(tab, i, fallbackOnFailure=false) {
		// Set frameId to null - send message to all frames
		// There is code to figure out which frame should translate with instanceID.
		return Zotero.Messaging.sendMessage("translate", [
			_tabInfo[tab.id].instanceID,
			_tabInfo[tab.id].translators[i].translatorID,
			fallbackOnFailure
		], tab, null);
	}
	
	this.saveAsWebpage = function(tab, frameId) {
		return Zotero.Messaging.sendMessage("saveAsWebpage", tab.title, tab, frameId);
	}

	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		_tabInfo[data[0]].selectCallback(data[1]);
	});
	
	function logListenerErrors(listener) {
		return function() {
			try {
				var returnValue = listener.apply(this, arguments);
				if (returnValue && returnValue.then) {
					returnValue.catch(function(e) {
						Zotero.logError(e);
						throw (e);
					});
				}
			} catch (e) {
				Zotero.logError(e);
				throw e;
			}
		}
	}

	browser.browserAction.onClicked.addListener(logListenerErrors(function(tab) {
		Zotero.Extension.Button.onClick(tab, _tabInfo[tab.id]);
	}));
	
	browser.tabs.onRemoved.addListener(logListenerErrors(_clearInfoForTab));
	
	browser.tabs.onActivated.addListener(logListenerErrors(async function(details) {
		var tab = await browser.tabs.get(details.tabId);
		// Ignore item selector
		if (tab.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html")) === 0) return;
		Zotero.debug("Connector_Browser: onActivated for " + tab.url);
		Zotero.Connector_Browser.onTabActivated(tab);
		Zotero.Connector.reportActiveURL(tab.url);
	}));
	
	browser.webNavigation.onCommitted.addListener(logListenerErrors(async function(details) {
		var tab = await browser.tabs.get(details.tabId);
		// Ignore developer tools
		if (tab.id < 0 || Zotero.Connector_Browser.isDisabledForURL(tab.url, true)) return;

		if (details.frameId == 0) {
			// Ignore item selector
			if (tab.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html")) === 0) return;
			_updateInfoForTab(tab);
			Zotero.Connector_Browser.updateExtensionUI(tab);
			Zotero.Connector.reportActiveURL(tab.url);
		}
		// _updateInfoForTab will reject pending injections, but we need to make sure this
		// executes in the next event loop such that the rejections can be processed
		await Zotero.Promise.delay(1);
		await Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
	}));
}

Zotero.initGlobal();
