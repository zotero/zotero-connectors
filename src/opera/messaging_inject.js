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
/*
 * this is Opera specific, uses same mechanics as safari (copy&paste)
 */
var XPathResult = window.XPathResult;
var XMLHttpRequest = XMLHttpRequest;
/**
 * @namespace
 * See messages.js for an overview of the message handling process.
 */

//dummy for testing
opera.extension.ondisconnect=function(event) {
    Zotero.Errors.log("FG: we got disconnected "+event.data[0]);
}

Zotero.Messaging = new function() {
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
					    //original code resulted in an array with length n but only n-1 elements
					    //seems to trigger a bug in Opera where we get arguments instead of
					    //newArgs on the BG side. 
					    //changed to array.push
					    //also the emtpy last element is needed in BG:messaging.js
						var newArgs = new Array();
						for(var i=0; i<arguments.length; i++) {
						    if(i !== callbackArg) newArgs.push( arguments[i]);
						    else newArgs.push(null);
						}
						
					    // set up a request ID and save the callback
					    if(callback) {
						var requestID = Math.floor(Math.random()*1e12);
						_callbacks[requestID] = callback;
					    }
					    // send message
					    opera.extension.postMessage([messageName, requestID, newArgs]);
					};
				};
			}
		}

	    opera.extension.onmessage=function(event) {
			try {
			        //OPERA:   request->[0]:eventName, [1]:callback, [2]:args
			        //Zotero.debug("FG Received message "+event.data[0]);
			    
			        // first see if there is a message listener
				if(_messageListeners[event.data[0]]) {
					_messageListeners[event.data[0]](event.data[1]);
					return;
				}
				
				// next determine original function name
				var messageParts = event.data[0].split(MESSAGE_SEPARATOR);
				// if no function matching, message must have been for another instance in this tab
				if(messageParts.length !== 3 || messageParts[2] !== "Response") return;
				
				var ns = messageParts[0];
				var meth = messageParts[1];
				
				var callback = _callbacks[event.data[1]];
				// if no function matching, message must have been for another instance in this tab
				if(!callback) return;
				delete _callbacks[event.data[1]];
				
				// run postReceive function
				var response = event.data[2];
				var messageConfig = MESSAGES[ns][meth];
				if(messageConfig.postReceive) {
					response = messageConfig.postReceive.apply(null, response);
				}
				
				// run callback
				callback.apply(null, response);
			} catch(e) {
				Zotero.logError(e);
			}
	    };
	}
}