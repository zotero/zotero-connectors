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

// TODO: refactor this class
Zotero.Connector = new function() {
	const CONNECTOR_API_VERSION = 3;
	const PASSIVE_METHODS = new Set(['ping', 'getTranslatorCode', 'getTranslators', 'getClientHostnames']);
	
	this.isOnline = (Zotero.isSafari || Zotero.isFirefox) ? false : null;
	this.clientVersion = '';
	this.prefs = {
		reportActiveURL: true
	};
	
	/**
	 * Checks if Zotero is online
	 * @returns {Promise<Boolean|null>} - null if Safari blocked the localhost request, leaving
	 *     Zotero's status unknown
	 */
	this.checkIsOnline = async function({active=false, permissionPromptShown=false}={}, tab=null) {
		let hadLocalhostPermission = true;
		if (Zotero.isSafari && active) {
			hadLocalhostPermission = await browser.permissions.contains({
				origins: ["http://127.0.0.1/*"]
			});
		}
		try {
			await this.ping({}, {active, permissionPromptShown}, tab);
			return true;
		} catch (e) {
			if (e.status != 0) {
				Zotero.debug("Checking if Zotero is online returned a non-zero HTTP status.");
				Zotero.logError(e);
				return true;
			}
			if (Zotero.isSafari && active) {
				const hasLocalhostPermission = await browser.permissions.contains({
					origins: ["http://127.0.0.1/*"]
				});
				if (!hasLocalhostPermission) {
					// Zotero's status is unknown when Safari blocked the request.
					return null;
				}
				if (!hadLocalhostPermission) {
					// The user granted access in Safari's permission dialog after the request had
					// already been blocked, so the failure says nothing about Zotero's status --
					// ping again
					return this.checkIsOnline({active, permissionPromptShown: true}, tab);
				}
			}
			return false;
		}
	};
	
	this.onStateChange = function(version) {
		Zotero.Connector_Browser?.onStateChange(version);
		Zotero.UpdaterFix?.onStateChange(version);
	}

	this.reportActiveURL = function(url) {
		if (!this.isOnline || !this.prefs.reportActiveURL) return;
		
		let payload = { activeURL: url };
		this.ping(payload);
	}
	
	// For use in injected pages
	this.getPref = function(pref) {
		return Zotero.Connector.prefs[pref];
	}
	
	/**
	 * Process preferences from ping response
	 * @param {Object} prefs - Preferences object from server response
	 */
	this._processPreferences = function(prefs) {
		// Populate preference container and legacy top-level fields
		const PREF_KEYS = [
			'downloadAssociatedFiles',
			'reportActiveURL',
			'automaticSnapshots',
			'googleDocsAddAnnotationEnabled',
			'googleDocsCitationExplorerEnabled',
			'supportsTagsAutocomplete',
			'canUserAddNote'
		];
		for (const key of PREF_KEYS) {
			const val = !!prefs[key];
			Zotero.Connector.prefs[key] = val;
		}
	}
	
	/**
	 * Process translator hash from ping response and update if needed
	 * @param {Object} prefs - Preferences object from server response
	 */
	this._processTranslatorHash = function(prefs) {
		if (prefs.translatorsHash) {
			(async () => {
				let sorted = !!prefs.sortedTranslatorHash;
				let remoteHash = sorted ? prefs.sortedTranslatorHash : prefs.translatorsHash;
				let translatorsHash = await Zotero.Translators.getTranslatorsHash(sorted);
				if (remoteHash != translatorsHash) {
					Zotero.debug("Zotero Ping: Translator hash mismatch detected. Updating translators from Zotero")
					return Zotero.Translators.updateFromRemote();
				}
			})()
		}
	}
	
	this.ping = async function(payload={}, options={}, tab=null) {
		let response = await Zotero.Connector.callMethod({method: "ping", ...options}, payload, tab);
		if (response && 'prefs' in response) {
			this._processPreferences(response.prefs);
			this._processTranslatorHash(response.prefs);
		}
		return response || {};
	}
	
	this.getClientVersion = async function(options={}, tab=null) {
		let isOnline = await this.checkIsOnline({...options, active: options.active ?? !!tab}, tab);
		return isOnline && this.clientVersion;
	}
	
	/**
	 * Sends the XHR to execute an RPC call.
	 *
	 * @param {String|Object} options - The method name as a string or an object with the
	 *     following properties:
	 *         method - method name
	 *         headers - an object of HTTP headers to send
	 *         queryString - a query string to pass on the HTTP call
	 *         [timeout=15000] - the timeout for the HTTP request
	 * @param {Object} data - RPC data to POST. If null or undefined, a GET request is sent.
	 * @param {Function} callback - Function to be called when requests complete.
	 */
	this.callMethod = async function(options, data = null, tab = null) {
		if (typeof options == 'string') {
			options = {method: options};
		}
		var method = options.method;
		if (Zotero.isSafari) {
			const hasLocalhostPermission = await browser.permissions.contains({
				origins: ["http://127.0.0.1/*"]
			});
			if (!hasLocalhostPermission) {
				const isActive = options.active || !PASSIVE_METHODS.has(method);
				if (!isActive) {
					throw new Zotero.Connector.CommunicationError(
						`Connector: Skipping passive ${method} request without localhost permission`
					);
				}
				if (!options.permissionPromptShown) {
					// This request can trigger Safari's own permission dialog for localhost
					await Zotero.HostPermissions.prompt(
						{domains: ['127.0.0.1'], nativePromptToFollow: true},
						tab
					);
				}
			}
		}
		var headers = Object.assign({
				"Content-Type":"application/json",
				"X-Zotero-Version":Zotero.version,
				"X-Zotero-Connector-API-Version":CONNECTOR_API_VERSION
			}, options.headers || {});
		var timeout = "timeout" in options ? options.timeout : 15000;
		var queryString = options.queryString ? ("?" + options.queryString) : "";
		
		var uri = Zotero.Prefs.get('connector.url') + "connector/" + method + queryString;
		if (headers["Content-Type"] == 'application/json') {
			data = JSON.stringify(data);
		}
		else if (headers["Content-Type"] == 'multipart/form-data') {
			let formData = new FormData();
			for (const entry in data) {
				// For SingleFile binary arrays, convert them to blobs
				if (entry.startsWith('binary-')) {
					const int8array = new Uint8Array(Object.values(data[entry]));
					formData.append(entry, new Blob([int8array]));
				}
				else {
					formData.append(entry, data[entry]);
				}
			}
			data = formData;
		}
		options = { body: data, headers, successCodes: false, timeout };
		let httpMethod = data === null ? "GET" : "POST";
		try {
			const xhr = await Zotero.HTTP.request(httpMethod, uri, options);
			Zotero.Connector.clientVersion = xhr.getResponseHeader('X-Zotero-Version');
			if (Zotero.Connector.isOnline !== true) {
				Zotero.Connector.isOnline = true;
				Zotero.Connector.onStateChange(Zotero.Connector.clientVersion)
			}
			var val = xhr.response
			if (xhr.responseText) {
				let contentType = xhr.getResponseHeader("Content-Type") || ""
				if (contentType.includes("application/json")) {
					val = JSON.parse(xhr.responseText);
				} else {
					val = xhr.responseText;
				}
			}
			if (xhr.status === 0) {
				if (Zotero.Connector.isOnline !== false) {
					Zotero.Connector.isOnline = false;
					Zotero.Connector.onStateChange(Zotero.Connector.clientVersion)
				}
				throw new Zotero.Connector.CommunicationError('Connector: Zotero is offline');
			}
			else if (xhr.status >= 400) {
				// Check for incompatible version
				if (xhr.status === 412) {
					if (Zotero.Connector_Browser && Zotero.Connector_Browser.onIncompatibleStandaloneVersion) {
						var standaloneVersion = xhr.getResponseHeader("X-Zotero-Version");
						Zotero.Connector_Browser.onIncompatibleStandaloneVersion(Zotero.version, standaloneVersion);
						throw new Zotero.Connector.CommunicationError(`Connector: Version mismatch: Connector version ${Zotero.version}, Standalone version ${standaloneVersion ? standaloneVersion : "<unknown>"}`, xhr.status, val);
					}
				}
				
				Zotero.debug("Connector: Method "+method+" failed with status "+xhr.status);
				throw new Zotero.Connector.CommunicationError(`Method ${method} failed`, xhr.status, val);
			} else {
				Zotero.debug("Connector: Method "+method+" succeeded");
				return val;
			}
		} catch (e) {
			if (!(e instanceof Zotero.Connector.CommunicationError) && !(e instanceof Zotero.HTTP.StatusError)){
				// Unexpected error, including a timeout
				Zotero.logError(e);
			}
			throw e;
		}
		finally {
			this._handleIntegrationTabClosed(method, tab);
		}
	},
	
	/**
	 * Thin wrapper around callMethod that exists as a distinct RPC message so
	 * messages.js can attach chunking hooks (inject.preSend / background.postReceive)
	 * to just this message. Those hooks use Zotero.Messaging.sendAsChunks /
	 * getChunkedPayload to split the `snapshotContent` field across multiple
	 * runtime messages, working around MV3 Chromium's 64 MB per-message limit.
	 */
	this.saveSingleFile = async function(options, data) {
		return this.callMethod(options, data);
	}

	/**
	 * If running an integration method check if the tab is still available to receive
	 * a response from Zotero and if not - respond with an error message so that
	 * the integration operation can be discarded in Zotero
	 */
	this._handleIntegrationTabClosed = async function(method, tab) {
		if (tab && method.startsWith('document/')) {
			try {
				let retrievedTab = await browser.tabs.get(tab.id);
				if (retrievedTab.discarded) throw new Error('Integration tab is discarded');
			} catch (e) {
				Zotero.logError(e);
				let response = await Zotero.Connector.callMethod({method: 'document/respond', timeout: false},
					JSON.stringify({
						error: 'Tab Not Available Error',
						message: e.message,
						stack: e.stack
					})
				);
				let method = response.command.split('.')[1];
				while (method != 'complete') {
					let response;
					if (method == 'displayAlert') {
						// Need to return an error for displayAlert so that it can be displayed in the client.
						response = await Zotero.Connector.callMethod({method: 'document/respond', timeout: false},
							JSON.stringify({error: 'Error'})
						);
					}
					else {
						response = await Zotero.Connector.callMethod({method: 'document/respond', timeout: false}, "");
					}
					method = response.command.split('.')[1];
				}
			}
		}
	}
}

Zotero.Connector.CommunicationError = function (message, status=0, value='') {
    this.name = 'Connector Communication Error';
    this.message = message;
    this.status = status;
    this.value = value;
}
Zotero.Connector.CommunicationError.prototype = new Error;

Zotero.Connector_Debug = new function() {
	/**
	 * Call a callback depending upon whether debug output is being stored
	 */
	this.storing = function() {
		return Zotero.Debug.storing;
	}
	
	/**
	 * Call a callback with the lines themselves
	 */
	this.get = function() {
		return Zotero.Debug.get();
	};
		
	/**
	 * Call a callback with the number of lines of output
	 */
	this.count = function() {
		return Zotero.Debug.count();
	}
	
	/**
	 * Submit data to the server
	 */
	this.submitReport = async function() {
		let body = await Zotero.Debug.get();
		let sysInfo = JSON.parse(await Zotero.Errors.getSystemInfo());
		let errors = (await Zotero.Errors.getErrors()).join('\n');
		sysInfo.timestamp = new Date().toString();
		body = `${errors}\n\n${JSON.stringify(sysInfo, null, 2)}\n\n${body}`;
		let xmlhttp = await Zotero.HTTP.request("POST", ZOTERO_CONFIG.REPOSITORY_URL + "report?debug=1", {body});

		let responseXML;
		try {
			let parser = new DOMParser();
			responseXML = parser.parseFromString(xmlhttp.responseText, "text/xml");
		}
		catch (e) {
			throw new Error('Invalid response from server');
		}
		var reported = responseXML.getElementsByTagName('reported');
		if (reported.length != 1) {
			throw new Error('The server returned an error. Please try again.');
		}
		return reported[0].getAttribute('reportID');
	};
}
