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

/**
 * Only register progress window code in top window
 */
var isTopWindow = false;
try {
	isTopWindow = window.top == window;
} catch(e) {};

if(isTopWindow) {
	/*
	 * Register save dialog listeners
	 *
	 * When an item is saved (by this page or by an iframe), the item will be relayed back to 
	 * the background script and then to this handler, which will show the saving dialog
	 */
	Zotero.Messaging.addMessageListener("saveDialog_show", Zotero.ProgressWindow.show);
	Zotero.Messaging.addMessageListener("saveDialog_itemSaving", function(data) {
		Zotero.ProgressWindow.itemSaving(data[0], data[1]);
	});
	Zotero.Messaging.addMessageListener("saveDialog_itemDone", function(data) {
		Zotero.ProgressWindow.itemDone(data[0], data[1]);
	});
	Zotero.Messaging.addMessageListener("saveDialog_close", Zotero.ProgressWindow.close);
	Zotero.Messaging.addMessageListener("saveDialog_done", function(returnValue) {
		if(returnValue) {
			Zotero.ProgressWindow.startCloseTimer(2500);
		} else {
			Zotero.ProgressWindow.showError();
			Zotero.ProgressWindow.startCloseTimer(8000);
		}
	});
	Zotero.Messaging.addMessageListener("saveSnapshot", function() {
		Zotero.Connector_Types.getSchema(function(schema) {
			Zotero.Connector_Types.schema = schema;
			Zotero.Connector_Types.init();
			
			var html = document.documentElement.innerHTML;
			var id = Zotero.Utilities.randomString();
			var icon = Zotero.ItemTypes.getImageSrc("webpage");
			var item = {"id":id, "title":document.title};
			Zotero.ProgressWindow.itemSaving(icon, item);
			Zotero.Connector.callMethod("saveSnapshot", {"url":document.location.toString(),
					"cookie":document.cookie, "html":html},
				function(returnValue, status) {
					if(returnValue === false) {
						if(status === 0) {
							Zotero.ProgressWindow.showStandaloneError();
						} else {
							Zotero.ProgressWindow.showError();
						}
						Zotero.ProgressWindow.startCloseTimer(8000);
					} else {
						Zotero.ProgressWindow.itemDone(icon, item);
						Zotero.ProgressWindow.startCloseTimer(2500);
					}
				});
		});
	});
}

/**
 * @namespace
 */
var instanceID = (new Date()).getTime();
Zotero.Inject = new function() {
	var _translate;
	this.translators = [];
	
	/**
	 * Translates this page. First, retrieves schema and preferences from global script, then
	 * passes them off to _haveSchemaAndPrefs
	 */
	this.translate = function(translator) {
		// this relays an item from this tab to the top level of the window
		Zotero.Connector_Types.getSchema(function(schema) {
			Zotero.Messaging.sendMessage("saveDialog_show", null);
			Zotero.Connector_Types.schema = schema;
			Zotero.Connector_Types.init();
			_translate.setTranslator(translator);
			_translate.translate();
		});
	};
	
	/**
	 * Initializes the translate machinery and determines whether this page can be translated
	 */
	this.detect = function() {	
		// On OAuth completion, close window and call completion listener
		if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH_CALLBACK_URL+"?") {
			Zotero.OAuth.onAuthorizationComplete(document.location.href.substr(ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1));
			return;
		} /*else if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_NEW_KEY_URL.length) === ZOTERO_CONFIG.OAUTH_NEW_KEY_URL) {
			document.getElementById("submit").click();
			return;
		}*/
		
		// wrap this in try/catch so that errors will reach logError
		try {
			if(this.translators.length) return;
			if(document.location == "about:blank") return;
			
			var me = this;
			var cancelled = false;
			_translate = new Zotero.Translate.Web();
			_translate.setDocument(document);
			_translate.setHandler("translators", function(obj, translators) {
				if(translators.length && !me.translators.length) {
					me.translators = translators;
					Zotero.Connector_Browser.onTranslators(translators, instanceID);
				}
			});
			_translate.setHandler("select", function(obj, items, callback) {
				Zotero.Connector_Browser.onSelect(items, function(returnItems) {
					// if no items selected, close save dialog immediately
					if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
						cancelled = true;
						Zotero.Messaging.sendMessage("saveDialog_close", null);
					}
					callback(returnItems);
				});
			});
			_translate.setHandler("itemSaving", function(obj, item) {
				// this relays an item from this tab to the top level of the window
				Zotero.Messaging.sendMessage("saveDialog_itemSaving",
					[Zotero.ItemTypes.getImageSrc(item.itemType), item]);
			});
			_translate.setHandler("itemDone", function(obj, dbItem, item) {
				// this relays an item from this tab to the top level of the window
				Zotero.Messaging.sendMessage("saveDialog_itemDone",
					[Zotero.ItemTypes.getImageSrc(item.itemType), item]);
			});
			_translate.setHandler("done", function(obj, status) {
				Zotero.Messaging.sendMessage("saveDialog_done", status);
			});
			_translate.getTranslators();
		} catch(e) {
			Zotero.logError(e);
		}
	};
};

// check whether this is a hidden browser window being used for scraping
var isHiddenIFrame = false;
if(!isTopWindow) {
	try {
		isHiddenIFrame = window.frameElement.style.display === "none";
	} catch(e) {}
}

// don't try to scrape on hidden frames
if(!isHiddenIFrame) {
	// add listener for translate message from extension
	Zotero.Messaging.addMessageListener("translate", function(data) {
		if(data[0] !== instanceID) return;
		Zotero.Inject.translate(data[1]);
	});
	// initialize
	Zotero.initInject();
	
	// Send page load event to clear current save icon (but only in Safari, since in Chrome the page
	// action is automatically invalidated when the page changes, so we don't need this message)
	if(isTopWindow && Zotero.isSafari) Zotero.Connector_Browser.onPageLoad();
	
	// wait until load is finished, then run detection
	if(document.readyState == "loading") {
		document.addEventListener("load", function() { Zotero.Inject.detect() }, false);
	} else {
		Zotero.Inject.detect();
	}
	document.addEventListener("ZoteroItemUpdated", function() { Zotero.Inject.detect() }, false);
}