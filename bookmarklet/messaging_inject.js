/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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
	const BOOKMARKLET_MESSAGE_PREFIX = "ZOTERO_MSG ";
	const BOOKMARKLET_MESSAGE_RESPONSE_PREFIX = "ZOTERO_MSG_RESPONSE ";
	
	var _callbacks = {};
	var _messageListeners = {};
	
	/**
	 * Add a message listener
	 */
	this.addMessageListener = function(messageName, callback) {
		_messageListeners[messageName] = callback;
	}
	
	/**
	 * Adds messaging functions to injected script. This adds Zotero.xxx.yyy functions for all
	 * entries in MESSAGES. These will send a message to the global script and return immediately.
	 * When a message is received, they will call the callback function, which should be passed
	 * as the last argument to Zotero.xxx.yyy.
	 */
	this.init = function() {
		for(var ns in MESSAGES) {
			if(!Zotero[ns]) Zotero[ns] = {};
			for(var meth in MESSAGES[ns]) {
				Zotero[ns][meth] = new function() {
					var messageName = ns+MESSAGE_SEPARATOR+meth;
					var messageConfig = MESSAGES[ns][meth];
					return function() {
						// make sure last argument is a callback
						var callback, callbackArg;
						if(messageConfig) {
							callbackArg = (messageConfig.callbackArg
								? messageConfig.callbackArg : arguments.length-1);
							callback = arguments[callbackArg];
							if(typeof callback !== "function") {
								Zotero.logError(new Error("Zotero: "+messageName+" must be called with a callback"));
								return;
							}
						}
						
						// copy arguments to newArgs
						var newArgs = new Array(arguments.length);
						for(var i=0; i<arguments.length; i++) {
							newArgs[i] = (i === callbackArg ? null : arguments[i]);
						}
					
						// set up a request ID and save the callback
						if(callback) {
							var requestID = Math.floor(Math.random()*1e12);
							_callbacks[requestID] = callback;
						}
						
						// send message
						zoteroIFrame.contentWindow.postMessage(
							BOOKMARKLET_MESSAGE_PREFIX+JSON.stringify([requestID, messageName, newArgs]),
							ZOTERO_CONFIG.BOOKMARKLET_URL+"iframe.html");
					};
				};
			}
		}
		
		// in the bookmarklet, our listener must also handle responses
		window.addEventListener("message", function(event) {
			try {
				var data = event.data, source = event.source;
				if(data.substr(0, BOOKMARKLET_MESSAGE_PREFIX.length) === BOOKMARKLET_MESSAGE_PREFIX) {
					// This would be a plain message
					data = JSON.parse(data.substr(BOOKMARKLET_MESSAGE_PREFIX.length));
					_messageListeners[data[0]](data[1]);
					return;
				} else if(data.substr(0, BOOKMARKLET_MESSAGE_RESPONSE_PREFIX.length) !== BOOKMARKLET_MESSAGE_RESPONSE_PREFIX) {
					// This would be the response to a previous message
					return;
				}
				
				// parse out the data
				data = JSON.parse(data.substr(BOOKMARKLET_MESSAGE_RESPONSE_PREFIX.length));
				
				// next determine original function name
				var messageParts = data[1].split(MESSAGE_SEPARATOR);
				var ns = messageParts[0];
				var meth = messageParts[1];
				
				var callback = _callbacks[data[0]];
				// if no function matching, message must have been for another instance in this tab
				if(!callback) return;
				delete _callbacks[data[0]];
				
				// run postReceive function
				var response = data[2];
				var messageConfig = MESSAGES[ns][meth];
				if(messageConfig.postReceive) {
					response = messageConfig.postReceive.apply(null, response);
				}
				
				// run callback
				callback.apply(null, response);
			} catch(e) {
				Zotero.logError(e);
			}
		}, false);
	}
}