/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
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
 * An integration interface intended to work via the Zotero client.
 * See server_connectorIntegration.js in zotero codebase for expected behaviour
 */
Zotero.ConnectorIntegration = {
	init: function() {
		// Limit to google docs for now
		if (document.location.host != 'docs.google.com') return;
		window.addEventListener('Zotero.Integration.execCommand', async function(event) {
			var client = event.data.client;
			client.call = function() {
				var evtName = `${client.name}.call`;
				window.dispatchEvent(new MessageEvent(evtName, {data: {client, args: Array.from(arguments)}}));
			};
			try {
				await Zotero.ConnectorIntegration.execCommand(client, event.data.command);
			} catch (e) {
				Zotero.debug(`Exception in ${e.data.command}`);
				Zotero.logError(e);
				var result = {
					error: e.type || `Connector Error`,
					message: e.message,
					stack: e.stack
				};
				return Zotero.ConnectorIntegration.respond(client, JSON.stringify(result));
			}
		});
		window.addEventListener('Zotero.Integration.respond', function(event) {
			var client = event.data.client;
			client.call = function() {
				var evtName = `${client.name}.call`;
				window.dispatchEvent(new MessageEvent(evtName, {data: {client, args: Array.from(arguments)}}));
			};
			Zotero.ConnectorIntegration.respond(client, event.data.response);
		});
	},
	
	execCommand: async function(client, command) {
		try {
			var request = await Zotero.Connector.callMethod(
			{method: 'document/execCommand', timeout: false},
			{command, docId: client.documentID});
		} catch (e) {
			// Usual response for a request in progress
			if (e.status == 503) {
				Zotero.debug(e.message);
				return;
			}
			else if (e.status == 404) {
				console.log(client);
				Zotero.Inject.confirm({
					title: "Upgrade Zotero",
						message: `
							Web-based citing requires Zotero 5.0.44 or later.
						`,
					button2Text: "",
				});
			}
			else if (e.status == 0) {
				Zotero.Inject.confirm({
					title: "Is Zotero Running?",
						message: `
							The Zotero Connector was unable to communicate with the Zotero desktop application. Zotero must be open to use web-based citing.
							You can <a href="https://www.zotero.org/download/">download Zotero</a> or <a href="https://www.zotero.org/support/kb/connector_zotero_unavailable">troubleshoot the connection</a> if necessary.
						`,
					button2Text: "", 
				});
			}
			Zotero.logError(e);
			return;
		}
		return client.call(request);
	},
	
	respond: async function(client, response) {
		try {
			var request = await Zotero.Connector.callMethod({method: 'document/respond', timeout: false}, response);
			return client.call(request);
		} catch (e) {
			// Usual response for a request in progress
			if (e.status == 503) {
				return;
			}
			Zotero.logError(e);
		}
	}
};

