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
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab) {
		if(_isDisabledForURL(tab.url)) {
			_clearInfoForTab(tab.id);
			_disableForTab(tab.id);
			return;
		}
		
		_enableForTab(tab.id);
		
		var oldTranslators = _translatorsForTabIDs[tab.id];
		if (oldTranslators) {
			if ((oldTranslators.length
					&& (!translators.length || oldTranslators[0].priority <= translators[0].priority))
				|| (!oldTranslators.length && !translators.length)) return;
		}
		_translatorsForTabIDs[tab.id] = translators;
		_instanceIDsForTabs[tab.id] = instanceID;
		
		if (translators.length) {
			_showTranslatorIcon(tab, translators[0]);
		} else if (contentType == 'application/pdf') {
			_showPDFIcon(tab);
		} else {
			_showWebpageIcon(tab);
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
			
			win = window.open(chrome.extension.getURL("itemSelector/itemSelector.html")+"#"+encodeURIComponent(JSON.stringify([tab.id, items])), '',
			'height=' + height + ',width=' + width + ',top=' + top + ',left=' + left + 'location=no,'
				+ 'toolbar=no,menubar=no,status=no');
			// Fix positioning when window is on second monitor
			// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
			if (win.screenX < left) {
				chrome.windows.getLastFocused(null, function (win) {
					chrome.windows.update(win.id, { left: left });
				});
			}
			_selectCallbacksForTabIDs[tab.id] = callback;
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
		chrome.contextMenus.update("zotero-context-menu-save", { enabled: false });
	}
	
	function _enableForTab(tabID) {
		chrome.browserAction.enable(tabID);
		chrome.contextMenus.update("zotero-context-menu-save", { enabled: true });
	}
	
	function _showTranslatorIcon(tab, translator) {
		var itemType = translator.itemType;
		
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		var translatorName = translator.label;
		if(translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero ("+translatorName+")"
		});
	}
	
	function _showWebpageIcon(tab) {
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:Zotero.ItemTypes.getImageSrc("webpage")
		});
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero (Web Page)"
		});
	}
	
	function _showPDFIcon(tab) {
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:Zotero.ItemTypes.getImageSrc("webpage")
		});
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero (PDF)"
		});
	}
	
	function _saveFromPage(tab) {
		if(_translatorsForTabIDs[tab.id].length) {
			chrome.tabs.sendRequest(tab.id, ["translate",
					[_instanceIDsForTabs[tab.id], _translatorsForTabIDs[tab.id][0]]], null);
		} else {
			chrome.tabs.sendRequest(tab.id, ["saveSnapshot", tab.title], null);
		}
	}
	
	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		_selectCallbacksForTabIDs[data[0]](data[1]);
	});

	chrome.tabs.onRemoved.addListener(_clearInfoForTab);

	chrome.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
		// Rerun translation if a tab's URL changes
		if(!changeInfo.url) return;
		Zotero.debug("Connector_Browser: URL changed for tab");
		_clearInfoForTab(tabID);
		chrome.tabs.sendRequest(tabID, ["pageModified"], null);
	});

	chrome.browserAction.onClicked.addListener(function(tab) {
		_saveFromPage(tab);
	});

	chrome.contextMenus.create({
		"id":"zotero-context-menu-save",
		"title":"Save Page to Zotero",
		"onclick":function(info, tab) {
			_saveFromPage(tab);
		}
	});
}

Zotero.initGlobal();