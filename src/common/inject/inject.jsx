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
	Zotero.Messaging.addMessageListener("progressWindow.show", function(headline) {
		Zotero.ProgressWindow.show();
		if (headline) {
			return Zotero.ProgressWindow.changeHeadline(headline);
		}
		Zotero.Connector.callMethod("getSelectedCollection", {}, function(response, status) {
			if (status !== 200) {
				Zotero.ProgressWindow.changeHeadline("Saving to zotero.org");
			} else {
				Zotero.ProgressWindow.changeHeadline("Saving to ",
					response.id ? "treesource-collection.png" : "treesource-library.png",
					response.name+"\u2026");
			}
		});
	});
	var itemProgress = {};
	Zotero.Messaging.addMessageListener("progressWindow.itemSaving", function(data) {
		itemProgress[data[2]] = new Zotero.ProgressWindow.ItemProgress(data[0], data[1],
			data.length > 3 ? itemProgress[data[3]] : undefined);
	});
	Zotero.Messaging.addMessageListener("progressWindow.itemProgress", function(data) {
		var progress = itemProgress[data[2]];
		if(!progress || !data[2]) {
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
	Zotero.Messaging.addMessageListener("progressWindow.close", Zotero.ProgressWindow.close);
	Zotero.Messaging.addMessageListener("progressWindow.done", function(returnValue) {
		if (returnValue[0]) {
			Zotero.ProgressWindow.startCloseTimer(2500);
		} else {
			new Zotero.ProgressWindow.ErrorMessage(returnValue[1] || "translationError");
			Zotero.ProgressWindow.startCloseTimer(8000);
		}
	});
	Zotero.Messaging.addMessageListener("confirm", function (props) {
		return Zotero.Inject.confirm(props);
	});
	
	Zotero.Messaging.addMessageListener("ping", function () {
		// Respond to indicate that script is injected
		return 'pong';
	});
}

/**
 * @namespace
 */
var instanceID = (new Date()).getTime();
Zotero.Inject = new function() {
	var _translate;
	this.translators = {};
	
	function determineAttachmentIcon(attachment) {
		if(attachment.linkMode === "linked_url") {
			return Zotero.ItemTypes.getImageSrc("attachment-web-link");
		}
		return Zotero.ItemTypes.getImageSrc(attachment.mimeType === "application/pdf"
							? "attachment-pdf" : "attachment-snapshot");
	}

	/**
	 * Check if React and components are loaded and if not - load into page.
	 * 
	 * This is a performance optimization - we want to avoid loading React into every page.
	 * 
	 * @param components {Object[]} an array of component names to load
	 * @return {Promise} resolves when components are injected
	 */
	this.loadReactComponents = function(components) {
		var toLoad = [];
		if (typeof ReactDOM === "undefined") {
			toLoad = ['lib/react.js', 'lib/react-dom.js'];
		}
		for (let component of components) {
			if (!Zotero.ui || !Zotero.ui[component]) {
				toLoad.push(`ui/${component.replace(/(.)([A-Z])/g, '$1-$2').toLowerCase()}.js`)
			}
		}
		if (toLoad.length) {
			return Zotero.Connector_Browser.injectScripts(toLoad);
		} else {
			return Zotero.Promise.resolve();
		}
	}

	/**
	 * 
	 * @param props {Object} to be passed to ModalPrompt component
	 * @returns {Promise{Object}} Object with properties:
	 * 		`button` - button number clicked (or 0 if clicked outside of prompt)
	 * 		`checkboxChecked` - checkbox state on close
	 * 		`inputText` - input field string on close	
	 */
	this.confirm = function(props) {
		let deferred = Zotero.Promise.defer();
		
		Zotero.Inject.loadReactComponents(['ModalPrompt']).then(function() {
			let div = document.createElement('div');
			div.style.cssText = 'z-index: 1000000; position: fixed; top: 0; left: 0; width: 100%; height: 100%';
			let prompt = (
				<Zotero.ui.ModalPrompt 
					onClose={onClose}
					{...props}
				/>
			);
			function onClose(state, event) {
				deferred.resolve({button: parseInt(event.target.name || 0),
					checkboxChecked: state.checkboxChecked,
					inputText: state.inputText
				});
				ReactDOM.unmountComponentAtNode(div);
				document.body.removeChild(div);
			}
			ReactDOM.render(prompt, div);
			document.body.appendChild(div);	
		}.bind(this));
		
		return deferred.promise;	
	};
	
	this.firstSaveToServerPrompt = function() {
		return this.confirm({
			checkbox: true,
			checkboxBlock: true,
			checkboxText: "I want to save directly to zotero.org",
			button1Text: "Save",
			button3Text: "More Information…",
			title: `Saving to zotero.org`,
			message: `
				The Zotero Connector is unable to communicate with Zotero. The Zotero Connector can save some pages directly to your zotero.org account, but for best results you should make sure Zotero is open before attempting to save.<br/><br/>
				You can <a href="https://www.zotero.org/download/">download Zotero</a> or <a href="https://www.zotero.org/support/kb/connector_zotero_unavailable">troubleshoot the connection</a> if necessary.
			`
		}).then(function(result) {
			if (result.button == 3) {
				Zotero.Connector_Browser.openTab('https://www.zotero.org/support/save_to_zotero_org');
			}
			return result.button == 1;
		});
	};

	/**
	 * Prompts about saving to zotero.org if attempting for the first time
	 * Prompt only available on BrowserExt which supports programmatic injection
	 * Otherwise just resolves to true
	 * 
	 * return {Promise<Boolean>} whether save to server should proceed
	 */
	this.checkSaveToServer = function() {
		if (Zotero.isBrowserExt) {
			return Zotero.Prefs.getAsync('firstSaveToServer')
			.then(function (firstSaveToServer) {
				if (firstSaveToServer) {
					return Zotero.Inject.firstSaveToServerPrompt().then(function (proceed) {
						if (proceed) {
							Zotero.Prefs.set('firstSaveToServer', false);
						}
						return proceed;
					});
				}
				return true;
			});
		} else {
			return Zotero.Promise.resolve(true);
		}
	}
	
	this.translate = function(translatorID) {
		Zotero.Messaging.sendMessage("progressWindow.show", null);
		_translate.setTranslator(Zotero.Inject.translators[translatorID]);
		_translate.translate();
	};
	
	this.saveAsWebpage = function (title) {
		var html = document.documentElement.innerHTML;
		
		var data = {
			"url": document.location.toString(),
			"cookie": document.cookie,
			"html": html
		};
		
		if (document.contentType == 'application/pdf') {
			data.pdf = true;
			var image = "attachment-pdf";
		} else {
			var image = "webpage";
		}
		
		var progress = new Zotero.ProgressWindow.ItemProgress(
			Zotero.ItemTypes.getImageSrc(image), title || document.title
		);
		Zotero.Connector.callMethod("saveSnapshot", data,
			function(returnValue, status) {
				if (returnValue === false) {
					// Client unavailable
					if (status === 0) {
						// Attempt saving to server if not pdf
						if (document.contentType != 'application/pdf') {
							Zotero.ProgressWindow.changeHeadline('Saving to zotero.org');
							let itemSaver = new Zotero.Translate.ItemSaver({});
							itemSaver.saveSnapshot().then(function(items) {
								if (items.length) progress.setProgress(100);
							});
						} else {
							new Zotero.ProgressWindow.ErrorMessage("clientRequired");
						}
					} else {
						new Zotero.ProgressWindow.ErrorMessage("translationError");
					}
					Zotero.ProgressWindow.startCloseTimer(8000);
				} else {
					progress.setProgress(100);
					Zotero.ProgressWindow.startCloseTimer(2500);
				}
			});
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
					me.translators = {};
					for (let translator of translators) {
						me.translators[translator.translatorID] = translator;
					}
					
					translators = translators.map(function(translator) {return translator.serialize(TRANSLATOR_PASSING_PROPERTIES)});
					Zotero.Connector_Browser.onTranslators(translators, instanceID, document.contentType);
				});
				_translate.setHandler("select", function(obj, items, callback) {
					Zotero.Connector_Browser.onSelect(items, function(returnItems) {
						// if no items selected, close save dialog immediately
						if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
							Zotero.Messaging.sendMessage("progressWindow.close", null);
						}
						callback(returnItems);
					});
				});
				_translate.setHandler("itemSaving", function(obj, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("progressWindow.itemSaving",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id]);
				});
				_translate.setHandler("itemDone", function(obj, dbItem, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("progressWindow.itemProgress",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id, 100]);
					for(var i=0; i<item.attachments.length; i++) {
						var attachment = item.attachments[i];
						Zotero.Messaging.sendMessage("progressWindow.itemSaving",
							[determineAttachmentIcon(attachment), attachment.title, attachment.id,
								item.id]);
					}
				});
				_translate.setHandler("attachmentProgress", function(obj, attachment, progress, err) {
					if(progress === 0) return;
					Zotero.Messaging.sendMessage("progressWindow.itemProgress",
						[determineAttachmentIcon(attachment), attachment.title, attachment.id, progress]);
				});
				_translate.setHandler("done", function(obj, status) {
					Zotero.Messaging.sendMessage("progressWindow.done", [status]);
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
			return _translate.getTranslators(true);
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
	var doInject = function () {
		// add listener for translate message from extension
		Zotero.Messaging.addMessageListener("translate", function(data) {
			if(data[0] !== instanceID) return;
			Zotero.Inject.translate(data[1]);
		});
		// add a listener to save as webpage when translators unavailable
		Zotero.Messaging.addMessageListener("saveAsWebpage", Zotero.Inject.saveAsWebpage);
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
	};
	
	// Wait until pages in prerender state become visible before injecting
	if (document.visibilityState == 'prerender') {
		var handler = function() {
			doInject();
			document.removeEventListener("visibilitychange", handler);
		};
		document.addEventListener("visibilitychange", handler);
	} else {
		doInject();
	}
}