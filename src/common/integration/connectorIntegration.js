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
				Zotero.debug(`Exception in ${event.data.command}`);
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
				Zotero.Inject.confirm({
					title: Zotero.getString('upgradeApp', ZOTERO_CONFIG.CLIENT_NAME),
					message: Zotero.getString(
						'integration_error_clientUpgrade',
						ZOTERO_CONFIG.CLIENT_NAME + ' 5.0.46'
					),
					button2Text: "",
				});
			}
			else if (e.status == 0) {
				var connectorName = Zotero.getString('appConnector', ZOTERO_CONFIG.CLIENT_NAME);
				Zotero.Inject.confirm({
					title: Zotero.getString('error_connection_isAppRunning', ZOTERO_CONFIG.CLIENT_NAME),
					message: Zotero.getString(
							'integration_error_connection',
							[connectorName, ZOTERO_CONFIG.CLIENT_NAME]
						)
						+ '<br /><br />'
						+ Zotero.Inject.getConnectionErrorTroubleshootingString(),
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

Zotero.ConnectorIntegration.Alert = class extends Error {
	constructor(message) {
		super(message);
		this.name = "Alert";
		this.type = "Alert";
	}
}
