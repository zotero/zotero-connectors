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
	var _callbacks = {},
		_messageListeners = {},
		_listenerRegistered = false,
		_structuredCloneSupported = false;
	
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
						var message = [requestID, messageName, newArgs];
						zoteroIFrame.contentWindow.postMessage(
							(_structuredCloneSupported ? message : JSON.stringify(message)),
							ZOTERO_CONFIG.BOOKMARKLET_URL+(Zotero.isIE ? "iframe_ie.html" : "iframe.html"));
					};
				};
			}
		}
		
		if(_listenerRegistered) return;
		
		var listener = function(event) {
			try {
				var data = event.data, origin = event.origin;
				if(event.origin !== "https://www.zotero.org"
						&& (!Zotero.isIE || event.origin !== "http://www.zotero.org")) {
					throw "Received message from invalid origin";
				}
				
				if(typeof data === "string") {
					try {
						// parse out the data
						data = JSON.parse(data);
					} catch(e) {
						return;
					}
				} else if(!_structuredCloneSupported) {
					_structuredCloneSupported = true;
					Zotero.debug("Structured clone algorithm is supported");
				}
				
				// first see if there is a message listener
				if(_messageListeners[data[0]]) {
					_messageListeners[data[0]](data[1], event);
					return;
				}
				
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
		}
		
		// in the bookmarklet, our listener must also handle responses
		if(window.addEventListener) {
			window.addEventListener("message", listener, false);
		} else {
			window.attachEvent("onmessage", function() { listener(event) });
		}
		
		_listenerRegistered = true;
	}
}
