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
 * @namespace
 * See messages.js for an overview of the message handling process.
 */
Zotero.Messaging = new function() {
	var _safariTabs = [],
		_messageListeners = {
			"structuredCloneTest":function() {}
		},
		_nextTabIndex = 1,
		_structuredCloneSupported = false;
	
	/**
	 * Add a message listener
	 */
	this.addMessageListener = function(messageName, callback) {
		_messageListeners[messageName] = callback;
	}
	
	/**
	 * Handles a message to the global process received from the injected script in Chrome or Safari
	 * @param {String} messageName The name of the message received
	 * @param {Array} args Arguments for to be passed to the function corresponding to this message
	 * @param {Function} sendResponseCallback Callback to be executed when data is available
	 * @param {TabObject} tab 
	 * @param {Number} frameId not available in safari
	 */
	this.receiveMessage = function(messageName, args, sendResponseCallback, tab, frameId) {
		try {
			//Zotero.debug("Messaging: Received message: "+messageName);
			if (!Array.isArray(args)) {
				args = [args];
			}
			
			// first see if there is a message listener
			if(_messageListeners[messageName]) {
				_messageListeners[messageName](args, tab, frameId);
				// return false, indicating that `sendResponseCallback won't be called
				return false;
			}
			
			var messageParts = messageName.split(MESSAGE_SEPARATOR);
			var fn = Zotero[messageParts[0]][messageParts[1]];
			if(!fn) {
				var e = new Error("Zotero."+messageParts[0]+"."+messageParts[1]+" is not defined");
				sendResponseCallback(['error', e]);
				throw e;
			}
			var messageConfig = MESSAGES[messageParts[0]][messageParts[1]];
			
			if (messageConfig && messageConfig.background) {
				while (messageConfig.background.minArgs > args.length) {
					args.push(undefined);
				}
			}
			var shouldRespond = messageConfig && messageConfig.response !== false;
			if (shouldRespond) {
				var callbackArg = messageConfig.callbackArg || args.length-1;

				// TODO: make this not awful
				// sendMessage is used to notify top frame, but the callback arg messes with tab injection
				if (messageParts[1] != 'sendMessage') {
					// TODO: maybe not needed
					if (args[callbackArg] !== null && args[callbackArg] !== undefined) {
						// Just append the callback if it is not there as is the case for promisified functions
						!messageConfig.callbackArg && args.push(0);
						callbackArg = (messageConfig.callbackArg ? messageConfig.callbackArg : args.length-1); 
					}
					// add a response passthrough callback for the message
					args[callbackArg] = function() {
						if (arguments[0] && arguments[0][0] == 'error') {
							let err = arguments[0][1];
							err = JSON.stringify(Object.assign({
								name: err.name,
								message: err.message,
								stack: err.stack
							}, err));
							return sendResponseCallback([arguments[0][0], err]);
						}
						var newArgs = new Array(arguments.length);
						for(var i=0; i<arguments.length; i++) {
							newArgs[i] = arguments[i];
						}
						
						if (messageConfig.background && messageConfig.background.preSend) {
							newArgs = messageConfig.background.preSend.apply(null, newArgs);
						}
						sendResponseCallback(newArgs);
					}
				}
			}
			args.push(tab);
			if (messageParts[1] != 'sendMessage') {
				args.push(frameId);
			}
			
			try {
				var maybePromise = fn.apply(Zotero[messageParts[0]], args);
			} catch (e) {
				if (shouldRespond) {
					args[callbackArg](['error', e]);
				}
			}
			// If you thought the message passing system wasn't complicated enough as it were,
			// now background page functions can return promises too 👍
			if (shouldRespond) {
				if (maybePromise && maybePromise.then) {
					maybePromise.then(args[callbackArg]).catch(e => args[callbackArg](['error', e]));
				} else {
					args[callbackArg](maybePromise);
				}
			}
		} catch(e) {
			Zotero.logError(e);
		}
		// Return a value, indicating whether `sendResponseCallback` will be called
		return shouldRespond;
	}
	
	/**
	 * Sends a message to a tab
	 */
	this.sendMessage = function(messageName, args, tab, frameId=0) {
		if(Zotero.isBookmarklet) {
			window.parent.postMessage((_structuredCloneSupported
				? [messageName, args] : JSON.stringify([messageName, args])), "*");
		}
		// Use the promise or response callback in BrowserExt for advanced functionality
		else if(Zotero.isBrowserExt) {
			// Get current tab if not provided
			if (!tab) return new Zotero.Promise(function(resolve) {
				chrome.tabs.query({active: true, lastFocusedWindow: true},
					(tabs) => resolve(this.sendMessage(messageName, args, tabs[0], frameId)));
			}.bind(this));
			let options = {};
			if (typeof(frameId) == 'number') options = {frameId};
			// Firefox returns a promise
			if (Zotero.isFirefox) {
				// Firefox throws an error when the receiving end doesn't exist (e.g. before injection)
				return browser.tabs.sendMessage(tab.id, [messageName, args], options)
					.catch(() => undefined);
			}
			else {
				let deferred = Zotero.Promise.defer();
				chrome.tabs.sendMessage(tab.id, [messageName, args], options, deferred.resolve);
				return deferred.promise;
			}
		} else if(Zotero.isSafari) {
			// Use current tab if not provided
			tab = tab || safari.application.activeBrowserWindow.activeTab;
			tab.page.dispatchMessage(messageName, args);
		}
	}
	
	/**
	 * Adds messaging listener
	 */
	this.init = function() {
		if(Zotero.isBookmarklet) {
			var listener = function(event) {
				var data = event.data, source = event.source;
				
				// Ensure this message was sent by Zotero
				if(event.source !== window.parent && event.source !== window) return;
				
				// Parse and receive message
				if(typeof data === "string") {
					try {
						// parse out the data
						data = JSON.parse(data);
					} catch(e) {
						return;
					}
				} else {
					_structuredCloneSupported = true;
				}
				
				Zotero.Messaging.receiveMessage(data[1], data[2], function(output) {
					var message = [data[0], data[1], output];
					source.postMessage(_structuredCloneSupported ? message : JSON.stringify(message), "*");
				}, event);
			};
			
			if(window.addEventListener) {
				window.addEventListener("message", listener, false);
			} else {
				window.attachEvent("onmessage", function() { listener(event) });
			}
			
			window.postMessage([null, "structuredCloneTest", null], window.location.href);
		} else if(Zotero.isBrowserExt) {
			chrome.runtime.onMessage.addListener(function(request, sender, sendResponseCallback) {
				// See `sendResponse` notes for return value
				// https://developer.chrome.com/extensions/runtime#event-onMessage
				return Zotero.Messaging.receiveMessage(request[0], request[1], sendResponseCallback, sender.tab, sender.frameId);
			});
		} else if(Zotero.isSafari) {
			safari.application.addEventListener("message", function(event) {
				var tab = event.target;
				_ensureSafariTabID(tab);
				Zotero.Messaging.receiveMessage(event.name, event.message[1], function(data) {
					tab.page.dispatchMessage(event.name+MESSAGE_SEPARATOR+"Response",
							[event.message[0], data], tab);
				}, tab);
			}, false);
		}
	}
	
	/**
	 * Gets the ID of a given tab in Safari
	 * Inspired by port.js from adblockforchrome by Michael Gundlach
	 */
	function _ensureSafariTabID(tab) {
		// if tab already has an ID, don't set a new one
		if(tab.id) return;
		
		// set tab ID
		tab.id = _nextTabIndex++;
		
		// remove old tabs that no longer exist from _safariTabs
		_safariTabs = _safariTabs.filter(function(t) { return t.browserWindow != null; });
		
		// add tab to _safariTabs so that it doesn't get garbage collected and we can keep ID
		_safariTabs.push(tab);
	}
}