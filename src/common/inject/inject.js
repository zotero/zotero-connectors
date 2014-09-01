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
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}

if(isTopWindow) {
	/*
	 * Register save dialog listeners
	 *
	 * When an item is saved (by this page or by an iframe), the item will be relayed back to 
	 * the background script and then to this handler, which will show the saving dialog
	 */
	Zotero.Messaging.addMessageListener("saveDialog_show", function() {
		Zotero.ProgressWindow.show();
		Zotero.Connector.callMethod("getSelectedCollection", {}, function(response, status) {
			if(status !== 200) return;
			Zotero.ProgressWindow.changeHeadline("Saving to ",
				response.id ? "treesource-collection.png" : "treesource-library.png",
				response.name+"\u2026");
		});
	});
	var itemProgress = {};
	Zotero.Messaging.addMessageListener("saveDialog_itemSaving", function(data) {
		itemProgress[data[2]] = new Zotero.ProgressWindow.ItemProgress(data[0], data[1],
			data.length > 3 ? itemProgress[data[3]] : undefined);
	});
	Zotero.Messaging.addMessageListener("saveDialog_itemProgress", function(data) {
		var progress = itemProgress[data[2]];
		if(!progress) {
			progress = itemProgress[data[2]] = new Zotero.ProgressWindow.ItemProgress(data[0], data[1]);
		} else {
			progress.setIcon(data[0]);
		}
		
		if(data[3] === false) {
			progress.setError();
		} else {
			progress.setProgress(data[3]);
		}
	});
	Zotero.Messaging.addMessageListener("saveDialog_close", Zotero.ProgressWindow.close);
	Zotero.Messaging.addMessageListener("saveDialog_done", function(returnValue) {
		if(returnValue) {
			Zotero.ProgressWindow.startCloseTimer(2500);
		} else {
			new Zotero.ProgressWindow.ErrorMessage("translationError");
			Zotero.ProgressWindow.startCloseTimer(8000);
		}
	});
	Zotero.Messaging.addMessageListener("saveSnapshot", function() {
		var html = document.documentElement.innerHTML;
		var progress = new Zotero.ProgressWindow.ItemProgress(
			Zotero.ItemTypes.getImageSrc("webpage"), document.title);
		Zotero.Connector.callMethod("saveSnapshot", {"url":document.location.toString(),
				"cookie":document.cookie, "html":html},
			function(returnValue, status) {
				if(returnValue === false) {
					if(status === 0) {
						new Zotero.ProgressWindow.ErrorMessage("standaloneRequired");
					} else {
						new Zotero.ProgressWindow.ErrorMessage("translationError");
					}
					Zotero.ProgressWindow.startCloseTimer(8000);
				} else {
					progress.setProgress(100);
					Zotero.ProgressWindow.startCloseTimer(2500);
				}
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
	
	function determineAttachmentIcon(attachment) {
		if(attachment.linkMode === "linked_url") {
			return Zotero.ItemTypes.getImageSrc("attachment-web-link");
		}
		return Zotero.ItemTypes.getImageSrc(attachment.mimeType === "application/pdf"
							? "attachment-pdf" : "attachment-snapshot");
	}
	
	/**
	 * Translates this page. First, retrieves schema and preferences from global script, then
	 * passes them off to _haveSchemaAndPrefs
	 */
	this.translate = function(translator) {
		// this relays an item from this tab to the top level of the window
		Zotero.Messaging.sendMessage("saveDialog_show", null);
		_translate.setTranslator(translator);
		_translate.translate();
	};
	
	/**
	 * Initializes the translate machinery and determines whether this page can be translated
	 */
	this.detect = function(force) {	
		// On OAuth completion, close window and call completion listener
		if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH_CALLBACK_URL+"?") {
			Zotero.API.onAuthorizationComplete(document.location.href.substr(ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1));
			return;
		} /*else if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_NEW_KEY_URL.length) === ZOTERO_CONFIG.OAUTH_NEW_KEY_URL) {
			document.getElementById("submit").click();
			return;
		}*/
		
		// wrap this in try/catch so that errors will reach logError
		try {
			if(this.translators.length) {
				if(force) {
					this.translators = [];
				} else {
					return;
				}
			}
			if(document.location == "about:blank") return;

			if(!_translate) {
				var me = this;
				_translate = new Zotero.Translate.Web();
				_translate.setDocument(document);
				_translate.setHandler("translators", function(obj, translators) {
					if(translators.length) {
						me.translators = translators;
						for(var i=0; i<translators.length; i++) {
							if(translators[i].properToProxy) {
								delete translators[i].properToProxy;
							}
						}
						Zotero.Connector_Browser.onTranslators(translators, instanceID);
					}
				});
				_translate.setHandler("select", function(obj, items, callback) {
					Zotero.Connector_Browser.onSelect(items, function(returnItems) {
						// if no items selected, close save dialog immediately
						if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
							Zotero.Messaging.sendMessage("saveDialog_close", null);
						}
						callback(returnItems);
					});
				});
				_translate.setHandler("itemSaving", function(obj, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("saveDialog_itemSaving",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id]);
				});
				_translate.setHandler("itemDone", function(obj, dbItem, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("saveDialog_itemProgress",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id, 100]);
					for(var i=0; i<item.attachments.length; i++) {
						var attachment = item.attachments[i];
						Zotero.Messaging.sendMessage("saveDialog_itemSaving",
							[determineAttachmentIcon(attachment), attachment.title, attachment.id,
								item.id]);
					}
				});
				_translate.setHandler("attachmentProgress", function(obj, attachment, progress, err) {
					// this relays an item from this tab to the top level of the window
					if(progress === 0) return;
					Zotero.Messaging.sendMessage("saveDialog_itemProgress",
						[determineAttachmentIcon(attachment), attachment.title, attachment.id, progress]);
				});
				_translate.setHandler("done", function(obj, status) {
					Zotero.Messaging.sendMessage("saveDialog_done", status);
				});
				_translate.setHandler("pageModified", function() {
					Zotero.Connector_Browser.onPageLoad();
					Zotero.Messaging.sendMessage("pageModified", null);
				});
				document.addEventListener("ZoteroItemUpdated", function() {
					Zotero.debug("Inject: ZoteroItemUpdated event received");
					Zotero.Connector_Browser.onPageLoad();
					Zotero.Messaging.sendMessage("pageModified", null);
				}, false);
			}
			_translate.getTranslators();
		} catch(e) {
			Zotero.logError(e);
		}
	};
};

// check whether this is a hidden browser window being used for scraping
var isHiddenIFrame = false;
try {
	isHiddenIFrame = !isTopWindow && window.frameElement && window.frameElement.style.display === "none";
} catch(e) {}

// don't try to scrape on hidden frames
if(!isHiddenIFrame && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
	// add listener for translate message from extension
	Zotero.Messaging.addMessageListener("translate", function(data) {
		if(data[0] !== instanceID) return;
		Zotero.Inject.translate(data[1]);
	});
	// add listener to rerun detection on page modifications
	Zotero.Messaging.addMessageListener("pageModified", function() {
		Zotero.Inject.detect(true);
	});
	// initialize
	Zotero.initInject();
	
	// Send page load event to clear current save icon/data
	if(isTopWindow) Zotero.Connector_Browser.onPageLoad();

	if(document.readyState !== "complete") {
		window.addEventListener("load", function(e) {
				if(e.target !== document) return;
				Zotero.Inject.detect();
			}, false);
	} else {	
		Zotero.Inject.detect();
	}
}