/*
    ***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2019 Center for History and New Media
					 George Mason University, Fairfax, Virginia, USA
					 http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	
	You should have received a copy of the GNU General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

const MESSAGE_TIMEOUT = 5 * 60 * 1000;

Zotero.Messaging._responseListeners = {};
Zotero.Messaging.receiveSwiftMessage = async function(messageName, id, data, tabId) {
	// Zotero.debug(`Swift message received: ${messageName}:${id}, ${JSON.stringify(data).substr(0, 500)}`);
	if (messageName == 'response') {
		let callback = Zotero.Messaging._responseListeners[id];
		if (!callback) return;
		delete Zotero.Messaging._responseListeners[id];
		if (data && data[0] == "error") data[1] = JSON.stringify(data[1]);
		let response = callback(data, Zotero.Connector_Browser.getTab(tabId));
		// await for the response for error handling
		if (response && response.then) {
			await response;
		}
		return;
	}
	await Zotero.initDeferred.promise;
	try {
		var result = await Zotero.Messaging.receiveMessage(messageName, data, Zotero.Connector_Browser.getTab(tabId));
	} catch (err) {
		// Zotero.logError(err);
		result = ["error", JSON.stringify(Object.assign({
			name: err.name,
			message: err.message,
			stack: err.stack
		}, err))];
	}
	sendMessage(messageName+MESSAGE_SEPARATOR+"Response", id, result, tabId);
};

Zotero.Messaging.sendMessage = async function(messageName, args=[], tab, messageId, deferred) {
	try {
		messageId = messageId || `${messageName}_${Math.floor(Math.random()*1e12)}`;
		deferred = deferred || Zotero.Promise.defer();
		const tabId = tab ? tab.id : tab;
		const messageTimeout = Zotero.initialized ? MESSAGE_TIMEOUT : 2000;
		var resolved = false;
		
		function respond(payload) {
			resolved = true;
			if (payload && payload[0] == 'error') {
				var errJSON = JSON.parse(payload[1]);
				let e = new Error(errJSON.message);
				for (let key in errJSON) e[key] = errJSON[key];
				deferred.reject(e);
			}
			deferred.resolve(payload);
		}
		
		Zotero.Messaging._responseListeners[messageId] = respond;

		sendMessage(messageName, messageId, args, tabId);
		// Zotero.debug(`Swift message sent: ${messageName}:${messageId}, ${JSON.stringify(args).substr(0, 500)}`);
		// Make sure we don't slowly gobble up memory with callbacks
		// The drawback is that Google Docs users will timeout in MESSAGE_TIMEOUT
		// (at the time of writing this is 5min)
		var timeout = setTimeout(function() {
			if (!resolved) {
				if (Zotero.initialized) {
					deferred.reject(new Error(`Message ${messageName} response timed out`));
					delete Zotero.Messaging._responseListeners[messageId];
				} else {
					// If Zotero is not initialized we need to keep trying until the extension actually boots up
					console.log('Swift initialization message did not receive a response. Retrying');
					Zotero.Messaging.sendMessage(messageName, args, tab, messageId, deferred);
				}
			}
		}, messageTimeout);
		var response = await deferred.promise;
	}
	finally {
		clearTimeout(timeout);
	}
	return response;
}
