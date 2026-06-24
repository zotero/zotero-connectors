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
	// Extension-page iframes (progress window, modal prompt, ...) the content script has injected
	// into the page. See _sendMessageToFrames().
	var _frames = [];

	/**
	 * Add a message listener
	 */
	this.addMessageListener = function(messageName, callback) {
		_messageListeners[messageName] = callback;
	}

	/**
	 * Register/unregister an extension-page iframe the content script controls.
	 *
	 * On Safari, browser.tabs.sendMessage from the background doesn't reach an extension-origin
	 * iframe embedded in a web page (it only reaches content scripts in web frames), so messages
	 * sent to child frames (frameId === null) can't go through the background relay. Since the
	 * content script and the iframe share a DOM, we post to the iframe directly instead. Registering
	 * the iframe here lets sendMessage() route to it transparently; other browsers keep the relay.
	 */
	this.registerFrame = function(frame) {
		if (_frames.indexOf(frame) == -1) _frames.push(frame);
	}
	this.unregisterFrame = function(frame) {
		let i = _frames.indexOf(frame);
		if (i != -1) _frames.splice(i, 1);
	}

	// Post a message to each registered frame and resolve with the first reply. The frame that
	// has a listener for the message posts back a response (see the 'message' listener in init());
	// frames without a matching listener stay silent. Works for both fire-and-forget messages
	// (resolves with undefined) and request/response ones (e.g., modalPrompt.show's button result).
	function _sendMessageToFrames(messageName, args) {
		return new Promise(function(resolve) {
			let responseId = Zotero.Utilities.randomString();
			let listener = function(event) {
				let msg = event.data;
				if (Array.isArray(msg) && msg[0] == 'zotero-frame-response' && msg[1] == responseId) {
					window.removeEventListener('message', listener);
					resolve(msg[2]);
				}
			};
			window.addEventListener('message', listener);
			for (let frame of _frames) {
				if (frame && frame.contentWindow) {
					frame.contentWindow.postMessage([messageName, args, responseId], '*');
				}
			}
		});
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

						// MV3 Chromium messaging has a 64MB per-message limit; payloads
						// that can exceed it are split into chunks in the message's
						// inject.preSend / background.postReceive hooks via
						// Zotero.Messaging.sendAsChunks / getChunkedPayload (see
						// messages.js).

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
							// calls that didn't expect a response either.
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

		// On Safari, route messages addressed to child frames (frameId === null) directly to the
		// registered extension-page iframes instead of through the background relay, which can't
		// reach them. The generated proxy above is the relay path used for everything else.
		if (Zotero.isSafari) {
			let _relaySendMessage = this.sendMessage;
			this.sendMessage = function(messageName, args, tab, frameId) {
				if (frameId === null && _frames.length) {
					return _sendMessageToFrames(messageName, args);
				}
				return _relaySendMessage.apply(this, arguments);
			};
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

		// On Safari, the background relay can't deliver tabs.sendMessage to an extension-page iframe
		// (e.g., the progress window / modal prompt), so the content script posts directly to the
		// iframe instead. Dispatch those postMessages through the same listeners. The _messageListeners
		// check ignores anything not addressed to a registered handler.
		// Message shape: [name, args, responseId?]. If a responseId is present the sender is awaiting
		// a reply, so post the handler's result back to it (e.g., modalPrompt.show's button result).
		if (Zotero.isSafari) {
			window.addEventListener('message', async function(event) {
				let request = event.data;
				if (!Array.isArray(request) || !request.length || !_messageListeners[request[0]]) return;
				let responseId = request[2];
				let result = await _messageListeners[request[0]](request[1]);
				if (responseId && event.source) {
					event.source.postMessage(['zotero-frame-response', responseId, result], '*');
				}
			});
		}
	}

	this.sendAsChunks = async function(payload) {
		if (!Zotero.isChromium) throw new Error("Messaging.sendAsChunks is only required on Chromium");
		const MAX_CHUNK_SIZE = 8 * (1024 * 1024);
		const id = Zotero.Utilities.randomString()
		const numChunks = Math.ceil(payload.length / MAX_CHUNK_SIZE);
		for (let i = 0; i < numChunks; i++) {
			await Zotero.Messaging.receiveChunk(id, payload.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE));
		}
		return id;
	}
}