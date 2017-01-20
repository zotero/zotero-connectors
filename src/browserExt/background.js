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
	var _injectTranslationScripts = [
		/*INJECT SCRIPTS*/
	];
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab) {
		_enableForTab(tab.id);
		
		var oldTranslators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		if (oldTranslators) {
			if ((oldTranslators.length
					&& (!translators.length || oldTranslators[0].priority <= translators[0].priority))
				|| (!oldTranslators.length && !translators.length)) return;
		}
		var isPDF = contentType == 'application/pdf';
		_tabInfo[tab.id] = {translators, instanceID, isPDF};
		
		_updateExtensionUI(tab);
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, callback, tab) {
		chrome.windows.get(tab.windowId, null, function (win) {
			var width = 600;
			var height = 325;
			var left = Math.floor(win.left + (win.width / 2) - (width / 2));
			var top = Math.floor(win.top + (win.height / 2) - (height / 2));
			
			chrome.windows.create(
				{
					url: chrome.extension.getURL("itemSelector/itemSelector.html")
						+ "#" + encodeURIComponent(JSON.stringify([tab.id, items]))
						// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
						.replace(/%3A/g, 'ZOTEROCOLON'),
					height: height,
					width: width,
					top: top,
					left: left,
					type: 'popup'
				},
				function (win) {
					// Fix positioning in Chrome when window is on second monitor
					// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
					if (Zotero.isChrome && win.left < left) {
						chrome.windows.update(win.id, { left: left });
					}
					_tabInfo[tab.id].selectCallback = callback;
				}
			);
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
	 */
	this.onStateChange = function(isOnline) {
		if (isOnline) {
			Zotero.Prefs.set('firstSaveToServer', true);
			Zotero.ContentTypeHandler.enable();
		} else {
			for (var i in _tabInfo) {
				if (_tabInfo[i].translators && _tabInfo[i].translators.length) {
					_tabInfo[i].translators = _tabInfo[i].translators.filter(
						(t) => t.runMode !== Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE);
				}
			}
			
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	this.onTabActivated = function(tab) {
		_updateExtensionUI(tab);
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
	 * @param args [url, rootUrl]
	 * @param tab
	 * @param frameId
	 */
	this.onFrameLoaded = function(args, tab, frameId) {
		if (_isDisabledForURL(tab.url)) {
			_clearInfoForTab(tab.id);
			return;
		}
		var url = args[0];
		var rootUrl = args[1];
		if (!url || !rootUrl) return;
		return Zotero.Translators.getWebTranslatorsForLocation(url, rootUrl).then(function(translators) {
			if (translators.length == 0) {
				Zotero.debug("Not injecting. No translators found for [rootUrl, url]: " + rootUrl + " , " + url);
				return;
			}
			Zotero.debug(translators.length+  " translators found. Injecting into [rootUrl, url]: " + rootUrl + " , " + url);
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
		});
	};

	/**
	 * Checks whether translation scripts are already injected into a frame and if not - injects
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectTranslationScripts = function(tab, frameId=0) {
		let deferred = Zotero.Promise.defer();
		Zotero.Messaging.sendMessage('ping', null, tab).then(function(response) {
			if (response) return deferred.resolve();
			return Zotero.Connector_Browser.injectScripts(_injectTranslationScripts, null, tab, frameId)
			.then(deferred.resolve).catch(deferred.reject);
		});
		return deferred.promise;
	};

	/**
	 * Injects custom scripts
	 * 
	 * @param scripts {Object[]} array of scripts to inject
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectScripts = function(scripts, callback, tab, frameId=0) {
		if (! Array.isArray(scripts)) scripts = [scripts];
		var promises = [];
		for (let script of scripts) {
			let deferred = Zotero.Promise.defer();
			promises.push(deferred.promise);
			try {
				chrome.tabs.executeScript(tab.id, {file: script, frameId}, deferred.resolve);
			} catch (e) {
				deferred.reject(e);
			}
		}
		return Zotero.Promise.all(promises);
	};

	this.openTab = function(url, tab) {
		if (tab) {
			let tabProps = { index: tab.index + 1 };
			// Firefox doesn't support openerTabId
			if (!Zotero.isFirefox) {
				tabProps.openerTabId = tab.id;
			}
			chrome.tabs.create(Object.assign({url}, tabProps));
		} else {
			chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => this.openTab(url, tabs[0]));
		}
	};

	/**
	 * Update status and tooltip of Zotero button
	 */
	function _updateExtensionUI(tab) {
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) return _showFirstUseUI(tab);
		chrome.contextMenus.removeAll();

		if (_isDisabledForURL(tab.url)) {
			_showZoteroStatus();
			return;
		} else {
			_enableForTab(tab.id);
		}
		
		var isPDF = _tabInfo[tab.id] && _tabInfo[tab.id].isPDF;
		var translators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		if (translators && translators.length) {
			_showTranslatorIcon(tab, translators[0]);
			_showTranslatorContextMenuItem(translators);
		} else if (isPDF) {
			_showPDFIcon(tab);
		} else {
			_showWebpageIcon(tab);
		}
		
		if (isPDF) {
			_showPDFContextMenuItem();
		} else {
			_showWebpageContextMenuItem();
		}
		
		if (Zotero.isFirefox) {
			_showPreferencesContextMenuItem();
		}
	}
	
	function _showFirstUseUI(tab) {
		var icon = `${Zotero.platform}/zotero-z-${window.devicePixelRatio > 1 ? 32 : 16}px-australis.png`;
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: `images/${icon}`
		});
		chrome.browserAction.setTitle({
			tabId: tab.id,
			title: "Zotero Connector"
		});
		chrome.browserAction.enable(tab.id);
	}
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID) {
		delete _tabInfo[tabID];
	}
	
	function _isDisabledForURL(url) {
		return url.includes('chrome://') || url.includes('about:') || url.includes('-extension://');
	}
	
	function _showZoteroStatus(tabID) {
		Zotero.Connector.checkIsOnline(function(isOnline) {
			var icon, title;
			if (isOnline) {
				icon = "images/zotero-new-z-16px.png";
				title = "Zotero is Online";
			} else {
				icon = "images/zotero-z-16px-offline.png";
				title = "Zotero is Offline";
			}
			chrome.browserAction.setIcon({
				tabId:tabID,
				path:icon
			});
			
			chrome.browserAction.setTitle({
				tabId:tabID,
				title: title
			});
		});
		chrome.browserAction.disable(tabID);
		chrome.contextMenus.removeAll();
	}
	
	function _enableForTab(tabID) {
		chrome.browserAction.enable(tabID);
	}
	
	function _showTranslatorIcon(tab, translator) {
		var itemType = translator.itemType;
		
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title: _getTranslatorLabel(translator)
		});
	}
	
	function _showWebpageIcon(tab) {
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:Zotero.ItemTypes.getImageSrc("webpage-gray")
		});
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero (Web Page with Snapshot)"
		});
	}
	
	function _showPDFIcon(tab) {
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:Zotero.ItemTypes.getImageSrc("webpage-gray")
		});
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero (PDF)"
		});
	}
	
	function _showTranslatorContextMenuItem(translators) {
		for (var i = 0; i < translators.length; i++) {
			chrome.contextMenus.create({
				id: "zotero-context-menu-translator-save" + i,
				title: _getTranslatorLabel(translators[i]),
				onclick: (function (i) {
					return function (info, tab) {
						_saveWithTranslator(tab, i);
					};
				})(i),
				contexts: ['page', 'browser_action']
			});
		}
	}
	
	function _showWebpageContextMenuItem() {
		chrome.contextMenus.create({
			id: "zotero-context-menu-webpage-withSnapshot-save",
			title: "Save to Zotero (Web Page with Snapshot)",
			onclick: function (info, tab) {
				_saveAsWebpage(tab, true);
			},
			contexts: ['page', 'browser_action']
		});
		chrome.contextMenus.create({
			id: "zotero-context-menu-webpage-withoutSnapshot-save",
			title: "Save to Zotero (Web Page without Snapshot)",
			onclick: function (info, tab) {
				_saveAsWebpage(tab, false);
			},
			contexts: ['page', 'browser_action']
		});
	}
	
	function _showPDFContextMenuItem() {
		chrome.contextMenus.create({
			id: "zotero-context-menu-pdf-save",
			title: "Save to Zotero (PDF)",
			onclick: function (info, tab) {
				_saveAsWebpage(tab);
			},
			contexts: ['all']
		});
	}
	
	function _showPreferencesContextMenuItem() {
		chrome.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-pref-separator",
			contexts: ['all']
		});
		chrome.contextMenus.create({
			id: "zotero-context-menu-preferences",
			title: "Preferences",
			onclick: function () {
				chrome.tabs.create({url: chrome.extension.getURL('preferences/preferences.html')});
			},
			contexts: ['all']
		});
	}
	
	function _browserAction(tab) {
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) {
			Zotero.Messaging.sendMessage("firstUse", null, tab)
			.then(function () {
				Zotero.Prefs.set('firstUse', false);
				_updateExtensionUI(tab);
			});
		}
		else if(_tabInfo[tab.id] && _tabInfo[tab.id].translators && _tabInfo[tab.id].translators.length) {
			_saveWithTranslator(tab, 0);
		} else {
			_saveAsWebpage(tab, true);
		}
	}
	
	function _saveWithTranslator(tab, i) {
		Zotero.Messaging.sendMessage("translate", [
			_tabInfo[tab.id].instanceID,
			_tabInfo[tab.id].translators[i].translatorID
		], tab);
	}
	
	function _saveAsWebpage(tab, withSnapshot) {
		if (tab.id != -1) {
			Zotero.Messaging.sendMessage("saveAsWebpage", [tab.title, withSnapshot], tab);
		}
		// Handle right-click on PDF overlay, which exists in a weird non-tab state
		else {
			chrome.tabs.query(
				{
					lastFocusedWindow: true,
					active: true
				},
				function (tabs) {
					Zotero.Messaging.sendMessage("saveAsWebpage", tabs[0].title, tabs[0]);
				}
			);
		}
	}
	
	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		if(translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}
		
		return "Save to Zotero (" + translatorName + ")";
	}
	
	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		_tabInfo[data[0]].selectCallback(data[1]);
	});
	
	Zotero.Messaging.addMessageListener("frameLoaded", this.onFrameLoaded);

	chrome.tabs.onRemoved.addListener(_clearInfoForTab);

	chrome.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
		_updateExtensionUI(tab);
		if(!changeInfo.url) return;
		Zotero.debug("Connector_Browser: URL changed for tab");
		_clearInfoForTab(tabID);
		// Rerun translation
		Zotero.Messaging.sendMessage("pageModified", null, tab);
	});
	
	chrome.tabs.onActivated.addListener(function(activeInfo) {
		chrome.tabs.get(activeInfo.tabId, function(tab) {
			Zotero.Connector_Browser.onTabActivated(tab);
		});
	});

	chrome.browserAction.onClicked.addListener(_browserAction);
}

Zotero.initGlobal();
// BrowserExt specific
Zotero.WebRequestIntercept.init();
Zotero.Proxies.init();
