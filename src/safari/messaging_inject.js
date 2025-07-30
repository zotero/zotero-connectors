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
	var _callbacks = {};
	var _messageListeners = {};
	
	/**
	 * Add a message listener
	 */
	this.addMessageListener = function(messageName, callback) {
		_messageListeners[messageName] = Zotero.Promise.method(callback);
	}
	
	/**
	 * Adds messaging functions to injected script. This adds Zotero.xxx.yyy functions for all
	 * entries in MESSAGES. These will send a message to the global script and return immediately.
	 * When a message is received, they will call the callback function, which should be passed
	 * as the last argument to Zotero.xxx.yyy.
	 */
	this.init = function() {
		Zotero.Messaging.addMessageListener('globalAvailable', async function() {
			// If we receive globalAvailable it means the global page was killed
			// and is back online. We need to refresh the tab data before
			// we can issue any other commands to it
			const messageId = Math.floor(Math.random() * 1e12);
			let onTabDataPromise = generateResponsePromise(messageId, true);
			safari.extension.dispatchMessage('message', {
				message: 'Connector_Browser.onTabData',
				messageId,
				args: [{
					url: document.location.href,
					title: document.title,
					translators: Zotero.Inject.translators,
					contentType: document.contentType,
					instanceID: 0
				}]
			});
		});
		
		for (let ns in MESSAGES) {
			if( !Zotero[ns]) Zotero[ns] = {};
			for (let meth in MESSAGES[ns]) {
				Zotero[ns][meth] = new function() {
					var messageName = ns+MESSAGE_SEPARATOR+meth;
					var messageConfig = MESSAGES[ns][meth];
					return function() {
						// see if last argument is a callback
						var callback, callbackArg = null;
						if(messageConfig) {
							callbackArg = (messageConfig.callbackArg
								? messageConfig.callbackArg : arguments.length-1);
							callback = arguments[callbackArg];
							if(typeof callback !== "function") {
								// Zotero.debug("Message `"+messageName+"` has no callback arg. It should use the returned promise");
								callbackArg = null;
								callback = null;
							}
						}
						
						// copy arguments to newArgs
						var newArgs = new Array(arguments.length);
						for(var i=0; i<arguments.length; i++) {
							newArgs[i] = (i === callbackArg ? null : arguments[i]);
						}

						let requestID = `${messageName}_${Math.floor(Math.random() * 1e12)}`;
						let responsePromise = generateResponsePromise(requestID, messageConfig, callback);
						sendMessage(messageName, requestID, newArgs);
						return responsePromise;
					};
				};
			}
		}

		// in Safari, our listener must also handle responses
		async function receiveMessage(message, payload, messageId) {
			try {
				// see if there is a message listener
				if (message in _messageListeners) {
					// Zotero.debug(message + " message received in injected page " + window.location.href);
					try {
						var result = await _messageListeners[message](payload);
					} catch (err) {
						// Zotero.logError(err);
						err = JSON.stringify(Object.assign({
							name: err.name,
							message: err.message,
							stack: err.stack
						}, err));
						result = ['error', err];
					}
					sendMessage('response', messageId, result);
					return;
				}
				
				// next determine original function name
				var messageParts = message.split(MESSAGE_SEPARATOR);
				// if no function matching, message must have been for another instance in this tab
				if(messageParts[messageParts.length-1] !== "Response") return;
				
				var callback = _callbacks[messageId];
				// if no function matching, message must have been for another instance in this tab
				if (!callback) return;
				delete _callbacks[messageId];

				// run callback
				callback(payload);
			} catch(e) {
				Zotero.logError(e);
			}
		}
		
		async function sendMessage(message, messageId, args) {
			// The Safari App Extension likes to kill the background page,
			// so we have to keep pinging it to see if it's still there
			const requestID = `SwiftPing_${Math.floor(Math.random() * 1e12)}`;
			let pingPromise = generateResponsePromise(requestID, true);
			safari.extension.dispatchMessage('message', {
				message: 'ping',
				messageId: requestID,
				args: []
			});
			// If we do not receive a response in 1 second then the
			// background page is too unresponsive for some reason and we need to act
			let response = await Zotero.Promise.race([pingPromise, Zotero.Promise.delay(1000)]);
			if (!response) {
				return sendMessage(message, messageId, args);
			}
			
			safari.extension.dispatchMessage('message', {
				message: message,
				messageId,
				args
			});
		}
		
		async function generateResponsePromise(requestID, messageConfig, callback) {
			return new Zotero.Promise(function(resolve, reject) {
				if (messageConfig) {
					_callbacks[requestID] = function (response) {
						if (response && response[0] == 'error') {
							response[1] = JSON.parse(response[1]);
							let e = new Error(response[1].message);
							for (let key in response[1]) e[key] = response[1][key];
							return reject(e);
						}
						try {
							if (messageConfig.inject && messageConfig.inject.postReceive) {
								response = messageConfig.inject.postReceive(response);
							}
							if (typeof callback == 'function') callback(response);
							resolve(response);
						} catch (e) {
							Zotero.logError(e);
							reject(e);
						}
					}
				} else {
					resolve();
				}
			});
		}
		
		safari.self.addEventListener("message", function(event) {
			receiveMessage(event.name, event.message.args[0], event.message.args[1]);
		}, false);
	}
}