﻿/*
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
	this.onTranslators = function(translators, instanceID, tab) {
		var oldTranslators = _translatorsForTabIDs[tab.id];
		if(oldTranslators && oldTranslators.length
			&& (!translators.length || oldTranslators[0].priority <= translators[0].priority)) return;
		_translatorsForTabIDs[tab.id] = translators;
		_instanceIDsForTabs[tab.id] = instanceID;
		var itemType = translators[0].itemType;
		
		chrome.pageAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		var translatorName = translators[0].label;
		if(translators[0].runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}
		chrome.pageAction.setTitle({
			tabId:tab.id,
			title:"Save to Zotero ("+translatorName+")"
		});
		
		chrome.pageAction.show(tab.id);
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, callback, tab) {
		window.open(chrome.extension.getURL("itemSelector/itemSelector.html")+"#"+encodeURIComponent(JSON.stringify([tab.id, items])), '',
		'height=325,width=500,location=no,toolbar=no,menubar=no,status=no');
		_selectCallbacksForTabIDs[tab.id] = callback;
	}
	
	/**
	 * Called when select items dialog is closed to pass data back to injected script
	 */
	this.onSelectDone = function(data) {
		_selectCallbacksForTabIDs[data[0]](data[1]);
	}
	
	/**
	 * Called when a tab is removed or the URL has changed
	 */
	this.onTabRemoved = _clearInfoForTab;
	this.onPageLoad = function(tab) {
		_clearInfoForTab(tab.id);
	}
	
	/**
	 * Called when the page action button has been clicked
	 */
	this.onPageActionClicked = function(tab) {
		chrome.tabs.sendRequest(tab.id, ["translate",
				[_instanceIDsForTabs[tab.id], _translatorsForTabIDs[tab.id][0]]], null);
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
						chrome.pageAction.hide(i);
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
			'http://www.zotero.org/support/standalone for more details.');
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
}

// register handlers
chrome.tabs.onRemoved.addListener(Zotero.Connector_Browser.onTabRemoved);
//watch for URL changes because those clear the URL bar icon
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
	if(!changeInfo.url) return;
	chrome.tabs.sendRequest(tabId, ["pageModified"], null);
});
chrome.pageAction.onClicked.addListener(Zotero.Connector_Browser.onPageActionClicked);
Zotero.Messaging.addMessageListener("selectDone", Zotero.Connector_Browser.onSelectDone);

// create context menu item
chrome.contextMenus.create({"title":"Save Zotero Snapshot from Current Page", "onclick":function(info, tab) {
	chrome.tabs.sendRequest(tab.id, ["saveSnapshot"], null);
}})

// initialize
Zotero.initGlobal();