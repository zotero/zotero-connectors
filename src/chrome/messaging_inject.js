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
							newArgs[i] = i === callbackArg ? undefined : arguments[i];
						}
						
						// send message
						chrome.extension.sendRequest([messageName, newArgs], function(response) {
								try {
									if(messageConfig.postReceive) {
										response = messageConfig.postReceive.apply(null, response);
									}
									if (callback) callback.apply(null, response);
								} catch(e) {
									Zotero.logError(e);
								}
							}
						);
					};
				};
			}
		}
				
		chrome.extension.onRequest.addListener(function(request, sender, sendResponseCallback) {
			if(typeof request !== "object" || !request.length || !_messageListeners[request[0]]) return;
			try {
				//Zotero.debug("Received message "+request[0]);
				_messageListeners[request[0]](request[1]);
			} catch(e) {
				Zotero.logError(e);
			}
		});
	}
}