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
	var _safariTabs = [];
	var _messageListeners = {};
	var _nextTabIndex = 1;
	
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
	 * @param {Function} responseCallback Callback to be executed when data is available
	 * @param {String|Number} tabID ID of this tab 
	 */
	this.receiveMessage = function(messageName, args, sendResponseCallback, tab) {
		try {
			//Zotero.debug("Messaging: Received message: "+messageName);
			
			// first see if there is a message listener
			if(_messageListeners[messageName]) {
				_messageListeners[messageName](args);
				return;
			}
			
			var messageParts = messageName.split(MESSAGE_SEPARATOR);
			var messageConfig = MESSAGES[messageParts[0]][messageParts[1]];
			
			if(messageConfig) {
				callbackArg = (messageConfig.callbackArg
					? messageConfig.callbackArg : args.length-1);
				// if function accepts a callback, pass one in
				args[callbackArg] = function() {
					var newArgs = new Array(arguments.length);
					for(var i=0; i<arguments.length; i++) {
						newArgs[i] = arguments[i];
					}
					
					if(messageConfig.preSend) newArgs = messageConfig.preSend.apply(null, newArgs);
					sendResponseCallback(newArgs);
				}
			}
			args.push(tab);
			
			Zotero[messageParts[0]][messageParts[1]].apply(Zotero[messageParts[0]], args);		
		} catch(e) {
			Zotero.logError(e);
		}
	}
	
	/**
	 * Sends a message to a tab
	 */
	this.sendMessage = function(messageName, args, tab) {
		if(Zotero.isChrome) {
			chrome.tabs.sendRequest(tab.id, [messageName, args]);
		} else if(Zotero.isSafari) {
			tab.page.dispatchMessage(messageName, args);
		}
	}
	
	/**
	 * Adds messaging listener
	 */
	this.init = function() {
		if(Zotero.isChrome) {
			chrome.extension.onRequest.addListener(function(request, sender, sendResponseCallback) {
				Zotero.Messaging.receiveMessage(request[0], request[1], sendResponseCallback, sender.tab);
			});
		} else if(Zotero.isSafari) {
			safari.application.addEventListener("message", function(event) {
				var tab = event.target;
				_ensureSafariTabID(tab);
				Zotero.Messaging.receiveMessage(event.name, event.message[1], function(data) {
					tab.page.dispatchMessage(event.name+MESSAGE_SEPARATOR+"Response",
							[event.message[0], data], tab);
				}, tab);
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