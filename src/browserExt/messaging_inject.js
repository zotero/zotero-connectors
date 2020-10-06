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
	var _messageListeners = {};
	
	/**
	 * Add a message listener
	 */
	this.addMessageListener = function(messageName, callback) {
		_messageListeners[messageName] = callback;
	}
	
	/**
	 * Adds messaging functions to injected script. This adds Zotero.xxx.yyy functions for all
	 * entries in MESSAGES. These will send a message to the global script and return a promise.
	 * When a message is received, they will resolve the promise and call the callback function, 
	 * which can be passed as the last argument to Zotero.xxx.yyy.
	 */
	this.init = function() {
		for(var ns in MESSAGES) {
			if(!Zotero[ns]) Zotero[ns] = {};
			for(var meth in MESSAGES[ns]) {
				Zotero[ns][meth] = new function() {
					var messageName = ns+MESSAGE_SEPARATOR+meth;
					var messageConfig = MESSAGES[ns][meth];
					return async function() {
						// see if last argument is a callback
						var callback, callbackArg = null;
						if(messageConfig) {
							callbackArg = (messageConfig.callbackArg
								? messageConfig.callbackArg : arguments.length-1);
							callback = arguments[callbackArg];
							if(typeof callback !== "function") {
								// Zotero.debug("Message `"+messageName+"` has no callback arg. It should use the returned promise", 5);
								callbackArg = null;
							}
						}
						
						// copy arguments to newArgs
						var newArgs = new Array(arguments.length);
						for(var i=0; i<arguments.length; i++) {
							newArgs[i] = i === callbackArg ? undefined : arguments[i];
						}
						if (messageConfig.inject && messageConfig.inject.preSend) {
							newArgs = await messageConfig.inject.preSend(newArgs);
						}
						
						// send message
						return browser.runtime.sendMessage([messageName, newArgs]).then(async function(response) {
							if (response && response[0] == 'error') {
								response[1] = JSON.parse(response[1]);
								let e = new Error(response[1].message);
								for (let key in response[1]) e[key] = response[1][key];
								throw e;
							}
							try {
								if (messageConfig.inject && messageConfig.inject.postReceive) {
									response = await messageConfig.inject.postReceive(response);
								}
								if (callbackArg !== null) callback(response);
								return response;
							} catch(e) {
								Zotero.logError(e);
								throw e;
							}
						}, function(e) {
							// Unclear what to do with these. Chrome doesn't have error instance defined
							// and these could be simply messages saying that no response was received for
							// calls that didn't expect a resposne either.
							// Either way, if we should be at least expecting a response and get an error we 
							// throw
							if (messageConfig && messageConfig.response !== false) {
								Zotero.logError(e);
								throw e;
							}
						});
					};
				};
			}
		}
				
		// NOTE: Do not convert to `browser.` API!
		// If there are message listeners on multiple frames (or multiple listeners on the same frame)
		// and you need to respond from a specific one, Firefox does not respect the `undefined`
		// return value and will resolve the `undefined` back to the background page
		// from whichever listener returns undefined first.
		// There is also extended discussion on what's going to be the final API,
		// e.g. on the browser-polyfill github https://github.com/mozilla/webextension-polyfill/pull/97
		chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
			if (typeof request !== "object" || !request.length || !_messageListeners[request[0]]) return;
			(async function messageListener() {
				Zotero.debug(request[0] + " message received in injected page " + window.location.href);
				var result;
				try {
					result = await _messageListeners[request[0]](request[1])
				} catch (err) {
					// Zotero.logError(err);
					result = ['error', JSON.stringify(Object.assign({
						name: err.name,
						message: err.message,
						stack: err.stack
					}, err))];
				}
				sendResponse(result);
			})();
			return true;
		});
	}
}