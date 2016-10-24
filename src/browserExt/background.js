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
	var _translatorsForTabIDs = {};
	var _instanceIDsForTabs = {};
	var _selectCallbacksForTabIDs = {};
	var _incompatibleVersionMessageShown;
	var _injectScripts = [
		/*INJECT SCRIPTS*/
	];
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab) {
		_enableForTab(tab.id);
		
		var oldTranslators = _translatorsForTabIDs[tab.id];
		if (oldTranslators) {
			if ((oldTranslators.length
					&& (!translators.length || oldTranslators[0].priority <= translators[0].priority))
				|| (!oldTranslators.length && !translators.length)) return;
		}
		_translatorsForTabIDs[tab.id] = translators;
		_instanceIDsForTabs[tab.id] = instanceID;
		
		var isPDF = contentType == 'application/pdf';
		chrome.contextMenus.removeAll();
		
		if (translators.length) {
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
					_selectCallbacksForTabIDs[tab.id] = callback;
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
	this.onStateChange = function() {
		if(!Zotero.Connector.isOnline) {
			for(var i in _translatorsForTabIDs) {
				if(_translatorsForTabIDs[i] && _translatorsForTabIDs[i].length
						&& _translatorsForTabIDs[i][0].runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
					try {
						Zotero.debug("Falling back to webpage saving for tab " + i);
						_showWebpageIcon(i);
					} catch(e) {}
				}
			}
		}
	}
	
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
		if(_isDisabledForURL(tab.url)) {
			_clearInfoForTab(tab.id);
			_disableForTab(tab.id);
			return;
		}
		var url = args[0];
		var rootUrl = args[1];
		if (!url || !rootUrl) return;
		Zotero.Translators.getWebTranslatorsForLocation(url, rootUrl).then(function(translators) {
			if (translators.length == 0) {
				Zotero.debug("Not injecting. No translators found for [rootUrl, url]: " + rootUrl + " , " + url);
				return;
			}
			Zotero.debug(translators.length+  " translators found. Injecting into [rootUrl, url]: " + rootUrl + " , " + url);
			for (let script of _injectScripts) {
				try {
					chrome.tabs.executeScript(tab.id, {file: script, frameId});
				} catch (e) {
					return;
				}
			}
		}.bind(this));
	}
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID) {
		delete _translatorsForTabIDs[tabID];
		delete _instanceIDsForTabs[tabID];
		delete _selectCallbacksForTabIDs[tabID];
	}
	
	function _isDisabledForURL(url) {
		return url.indexOf('chrome://') == 0;
	}
	
	function _disableForTab(tabID) {
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
			title:"Save to Zotero (Web Page)"
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
			id: "zotero-context-menu-webpage-save",
			title: "Save to Zotero (Web Page)",
			onclick: function (info, tab) {
				_saveAsWebpage(tab);
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
			contexts: ['page', 'browser_action']
		});
	}
	
	function _save(tab) {
		if(_translatorsForTabIDs[tab.id].length) {
			_saveWithTranslator(tab, 0);
		} else {
			_saveAsWebpage(tab);
		}
	}
	
	function _saveWithTranslator(tab, i) {
		chrome.tabs.sendMessage(
			tab.id,
			[
				"translate",
				[
					_instanceIDsForTabs[tab.id],
					_translatorsForTabIDs[tab.id][i]
				]
			],
			null
		);
	}
	
	function _saveAsWebpage(tab) {
		if (tab.id != -1) {
			chrome.tabs.sendMessage(tab.id, ["saveSnapshot", tab.title], null);
		}
		// Handle right-click on PDF overlay, which exists in a weird non-tab state
		else {
			chrome.tabs.query(
				{
					lastFocusedWindow: true,
					active: true
				},
				function (tabs) {
					chrome.tabs.sendMessage(tabs[0].id, ["saveSnapshot", tab.title], null);
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
		_selectCallbacksForTabIDs[data[0]](data[1]);
	});
	
	Zotero.Messaging.addMessageListener("frameLoaded", this.onFrameLoaded);

	chrome.tabs.onRemoved.addListener(_clearInfoForTab);

	chrome.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
		// Rerun translation if a tab's URL changes
		if(!changeInfo.url) return;
		Zotero.debug("Connector_Browser: URL changed for tab");
		_clearInfoForTab(tabID);
		chrome.tabs.sendMessage(tabID, ["pageModified"], null);
	});

	chrome.browserAction.onClicked.addListener(_save);
}

Zotero.initGlobal();