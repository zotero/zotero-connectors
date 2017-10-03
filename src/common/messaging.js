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
	 * @param {TabObject} tab 
	 * @param {Number} frameId not available in safari
	 */
	this.receiveMessage = Zotero.Promise.method(function(messageName, args, tab, frameId) {
		//Zotero.debug("Messaging: Received message: "+messageName);
		if (!Array.isArray(args)) {
			args = [args];
		}
		
		// first see if there is a message listener
		if(_messageListeners[messageName]) {
			return _messageListeners[messageName](args, tab, frameId);
		}
		
		var messageParts = messageName.split(MESSAGE_SEPARATOR);
		try {
			var fn = Zotero[messageParts[0]][messageParts[1]];
			if (!fn) {
				throw new Error();
			}
		} catch(e) {
			throw new Error("Zotero." + messageParts[0] + "." + messageParts[1] + " is not defined");
		}
		var messageConfig = MESSAGES[messageParts[0]][messageParts[1]];
		
		if (messageConfig && messageConfig.background) {
			while (messageConfig.background.minArgs > args.length) {
				args.push(undefined);
			}
		}
		args.push(tab);
		// Calls from inject pages to sendMessage are intended to go to top-frame
		if (messageParts[1] != 'sendMessage') {
			args.push(frameId);
		}
		
		var promise = fn.apply(Zotero[messageParts[0]], args);
		if (typeof promise != "object" || typeof promise.then !== "function") promise = Zotero.Promise.resolve(promise);
		var shouldRespond = messageConfig && messageConfig.response !== false;
		if (shouldRespond) {
			return promise.then(function(response) {
				if (messageConfig.background && messageConfig.background.preSend) {
					response = messageConfig.background.preSend(response);
				}
				return response;
			});
		}
	});
	
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
			if (!tab) {
				return browser.tabs.query({active: true, lastFocusedWindow: true})
				.then((tabs) => this.sendMessage(messageName, args, tabs[0], frameId));
			}
			let options = {};
			if (typeof(frameId) == 'number') options = {frameId};
			
			return browser.tabs.sendMessage(tab.id, [messageName, args], options).catch(() => undefined)
			.then(function(response) {
				if (response && response[0] == 'error') {
					response[1] = JSON.parse(response[1]);
					let e = new Error(response[1].message);
					for (let key in response[1]) e[key] = response[1][key];
					throw e;
				} 
				return response;
			});
		} else if(Zotero.isSafari) {
			return new Promise(function(resolve, reject) {
				// Use current tab if not provided
				tab = tab || safari.application.activeBrowserWindow.activeTab;
				var messageId = Date.now();
				var resolved = false;

				// This is like a tiny microcosm of (hopefully properly) self-garbage-collecting response handling
				tab.page.dispatchMessage('sendMessage', [messageName, messageId, args]);
				function response(event) {
					if (event.message[0] === messageId) {
						safari.application.removeEventListener('message', response, false);
						resolved = true;
						let payload = event.message[1];
						if (payload && payload[0] == 'error') {
							var errJSON = JSON.parse(payload[1]);
							let e = new Error(errJSON.message);
							for (let key in errJSON) e[key] = errJSON[key];
							reject(e);
						}
						resolve(payload);
					}
				}
				safari.application.addEventListener('message', response, false);
				Zotero.Promise.delay(15000).then(function() {
					if (!resolved) {
						safari.application.removeEventListener('message', response, false);
						reject(new Error('Request timed out'))
					}
				});
			});
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
			browser.runtime.onMessage.addListener(function(request, sender) {
				return Zotero.Messaging.receiveMessage(request[0], request[1], sender.tab, sender.frameId)
				.catch(function(err) {
					Zotero.logError(err);
					err = JSON.stringify(Object.assign({
						name: err.name,
						message: err.message,
						stack: err.stack
					}, err));
					return ['error', err];
				});
			});
		} else if(Zotero.isSafari) {
			safari.application.addEventListener("message", function(event) {
				// Handled by individual sendMessage handlers
				if (event.name == 'message') return;
				var tab = event.target;
				_ensureSafariTabID(tab);
				function dispatchResponse(response) {
					tab.page.dispatchMessage(event.name+MESSAGE_SEPARATOR+"Response",
						[event.message[0], response], tab);
				}
				Zotero.Messaging.receiveMessage(event.name, event.message[1], tab)
				.then(dispatchResponse, function(err) {
					Zotero.logError(err);
					err = JSON.stringify(Object.assign({
						name: err.name,
						message: err.message,
						stack: err.stack
					}, err));
					return dispatchResponse(['error', err]);
				});
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