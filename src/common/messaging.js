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
	var _messageListeners = {
			"structuredCloneTest":function() {}
		},
		_nextTabIndex = 1;
	
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
	this.receiveMessage = async function(messageName, args, tab, frameId) {
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

		if (messageConfig.background && messageConfig.background.postReceive) {
			args = await messageConfig.background.postReceive(args, tab, frameId);
		} else {
			args.push(tab);
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
	};
	
	/**
	 * Sends a message to a tab
	 */
	this.sendMessage = async function(messageName, args, tab, frameId=0) {
		var response;
		if(Zotero.isBookmarklet) {
			window.parent.postMessage([messageName, args], "*");
		}
		// Use the promise or response callback in BrowserExt for advanced functionality
		else if(Zotero.isBrowserExt) {
			// Get current tab if not provided
			if (!tab) {
				tab = (await browser.tabs.query({active: true, lastFocusedWindow: true}))[0]
			}
			let options = {};
			if (typeof frameId == 'number') options = {frameId};
			
			try {
				response = await browser.tabs.sendMessage(tab.id, [messageName, args], options);
			} catch (e) {}
			if (response && response[0] == 'error') {
				response[1] = JSON.parse(response[1]);
				let e = new Error(response[1].message);
				for (let key in response[1]) e[key] = response[1][key];
				throw e;
			}
			return response;
		} //else if(Zotero.isSafari) { }
		// Safari handled in safari/messaging_global.js
	}
	
	/**
	 * Adds messaging listener
	 */
	this.init = function() {
		if(Zotero.isBookmarklet) {
			async function listener(event) {
				var data = event.data, source = event.source;
				
				// Ensure this message was sent by Zotero
				if(event.source !== window.parent && event.source !== window) return;
			
				try {
					let response = await Zotero.Messaging.receiveMessage(data[1], data[2]);
					var message = [data[0], data[1], response];
					source.postMessage(message, "*");
				} catch (err) {
					// Zotero.logError(err);
					err = JSON.stringify(Object.assign({
						name: err.name,
						message: err.message,
						stack: err.stack
					}, err));
					var message = [data[0], data[1], ['error', err]];
					source.postMessage(message, "*");
				}
			};
			
			if (window.addEventListener) {
				window.addEventListener("message", listener, false);
			} else {
				window.attachEvent("onmessage", function() { listener(event) });
			}
		} else if(Zotero.isBrowserExt) {
			browser.runtime.onMessage.addListener(function(request, sender) {
				return Zotero.Messaging.receiveMessage(request[0], request[1], sender.tab, sender.frameId)
				.catch(function(err) {
					// Zotero.logError(err);
					err = JSON.stringify(Object.assign({
						name: err.name,
						message: err.message,
						stack: err.stack
					}, err));
					return ['error', err];
				});
			});
		} else if(Zotero.isSafari) {
			// Safari handled in safari/messaging_global.js
			Zotero.Messaging.initialized = true;
		}
	}
}