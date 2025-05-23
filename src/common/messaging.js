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
	var _chunkedPayloads = {};
	
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
		await Zotero.initDeferred.promise;
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

		if (messageConfig && messageConfig.background && messageConfig.background.postReceive) {
			args = await messageConfig.background.postReceive(args, tab, frameId);
		} else {
			args.push(tab);
			args.push(frameId);
		}
		
		var promise = fn.apply(Zotero[messageParts[0]], args);
		if (typeof promise != "object" || typeof promise.then !== "function") promise = Zotero.Promise.resolve(promise);
		var shouldRespond = messageConfig && messageConfig.response !== false;
		if (shouldRespond) {
			return promise.then(async function(response) {
				if (messageConfig.background && messageConfig.background.preSend) {
					response = await messageConfig.background.preSend(response);
				}
				return response;
			});
		}
	};
	
	/**
	 * Sends a message to a tab
	 */
	this.sendMessage = async function(messageName, args, tab=null, frameId=0) {
		var response;
		// Use the promise or response callback in BrowserExt for advanced functionality
		if(Zotero.isBrowserExt) {
			// Get current tab if not provided
			if (!tab) {
				tab = (await browser.tabs.query({active: true, lastFocusedWindow: true}))[0]
			}
			if (typeof tab === 'number') {
				tab = await browser.tabs.get(tab);
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
		if (Zotero.isBrowserExt) {
			browser.runtime.onMessage.addListener(function(request, sender) {
				// All Zotero messages are arrays so we ignore everything else
				// SingleFile will pass an object in the message so this ignores those.
				if (!Array.isArray(request)) {
					return;
				}

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
		} else if (Zotero.isSafari) {
			// Safari handled in safari/messaging_global.js
		}
		Zotero.Messaging.initialized = true;
	}

	this.receiveChunk = function(id, payload) {
		_chunkedPayloads[id] = _chunkedPayloads[id] || "";
		_chunkedPayloads[id] += payload;
		// Shouldn't need to keep this for longer than 30s
		setTimeout(() => {
			delete _chunkedPayloads[id];
		}, 30000);
	}

	this.getChunkedPayload = function(id) {
		const payload = _chunkedPayloads[id];
		delete _chunkedPayloads[id];
		return payload;
	}
}
// Used to pass large data like blobs on Chrome
if (Zotero.isChromium) {
	// Cannot be added asynchronously
	self.addEventListener('message', async (e) => {
		if (!(e.data?.type === "inject-message")) return;
		let { args } = e.data;
		// Replace tabId with tab
		if (args[2]) {
			args[2] = await browser.tabs.get(args[2]);
		}
		let result, error;
		try {
			result = await Zotero.Messaging.receiveMessage(...args)
		} catch (e) {
			error = JSON.stringify(Object.assign({
				name: e.name,
				message: e.message,
				stack: e.stack
			}, e));
		}
		e.source.postMessage({ result, error });
	});
}