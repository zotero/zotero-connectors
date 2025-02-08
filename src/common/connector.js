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
	const CONNECTOR_API_VERSION = 2;
	
	var _ieStandaloneIframeTarget, _ieConnectorCallbacks;
	this.isOnline = (Zotero.isSafari || Zotero.isFirefox) ? false : null;
	this.shouldReportActiveURL = true;
	this.clientVersion = '';
	
	/**
	 * Checks if Zotero is online and passes current status to callback
	 * @param {Function} callback
	 */
	this.checkIsOnline = async function() {
		return this.ping({}).catch(function(e) {
			if (e.status != 0) {
				Zotero.debug("Checking if Zotero is online returned a non-zero HTTP status.");
				Zotero.logError(e);
			}
			return false;
		});
	};

	this.reportActiveURL = function(url) {
		if (!this.isOnline || !this.shouldReportActiveURL) return;
		
		let payload = { activeURL: url };
		this.ping(payload);
	}
	
	// For use in injected pages
	this.getPref = function(pref) {
		return Zotero.Connector[pref];
	}
	
	this.ping = async function(payload={}) {
		let response = await Zotero.Connector.callMethod("ping", payload);
		if (response && 'prefs' in response) {
			Zotero.Connector.shouldReportActiveURL = !!response.prefs.reportActiveURL;
			Zotero.Connector.automaticAttachmentTypes = response.prefs.automaticAttachmentTypes;
			Zotero.Connector.automaticAttachmentTypesOrder = response.prefs.automaticAttachmentTypesOrder;
			// Old client returns downloadAssociatedFiles and automaticSnapshots instead
			if (!Zotero.Connector.automaticAttachmentTypes && !Zotero.Connector.automaticAttachmentTypesOrder) {
				let types = [];
				if (response.prefs.downloadAssociatedFiles) {
					types.push('pdf', 'epub');
				}
				if (response.prefs.automaticSnapshots) {
					types.push('html');
				}
				Zotero.Connector.automaticAttachmentTypes = types.join(',');
				Zotero.Connector.automaticAttachmentTypesOrder = 'pdf,epub,html';
			}
			Zotero.Connector.googleDocsAddNoteEnabled = !!response.prefs.googleDocsAddNoteEnabled;
			Zotero.Connector.googleDocsCitationExplorerEnabled = !!response.prefs.googleDocsCitationExplorerEnabled;
			if (response.prefs.translatorsHash) {
				(async () => {
					let sorted = !!response.prefs.sortedTranslatorHash;
					let remoteHash = sorted ? response.prefs.sortedTranslatorHash : response.prefs.translatorsHash;
					let translatorsHash = await Zotero.Translators.getTranslatorsHash(sorted);
					if (remoteHash != translatorsHash) {
						Zotero.debug("Zotero Ping: Translator hash mismatch detected. Updating translators from Zotero")
						return Zotero.Translators.updateFromRemote();
					}
				})()
			}
		}
		return response || {};
	}
	
	this.getClientVersion = async function() {
		let isOnline = await this.checkIsOnline();
		return isOnline && this.clientVersion;
	}
	
	Object.defineProperty(this, 'automaticSnapshots', {
		get() {
			let pref;
			if (this.isOnline) {
				pref = Zotero.Connector.automaticAttachmentTypes;
			}
			else {
				pref = Zotero.Prefs.get('automaticAttachmentTypes');
			}
			return pref.split(',').includes('html');
		}
	});
	
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
	this.callMethod = async function(options, data, tab) {
		if (typeof options == 'string') {
			options = {method: options};
		}
		var method = options.method;
		var headers = Object.assign({
				"Content-Type":"application/json",
				"X-Zotero-Version":Zotero.version,
				"X-Zotero-Connector-API-Version":CONNECTOR_API_VERSION
			}, options.headers || {});
		var timeout = "timeout" in options ? options.timeout : 15000;
		var queryString = options.queryString ? ("?" + options.queryString) : "";
		
		var deferred = Zotero.Promise.defer();
		var newCallback = function(req) {
			try {
				var isOnline = req.status !== 0 && req.status !== 403 && req.status !== 412;
				
				if (req.status != 0) {
					Zotero.Connector.clientVersion = req.getResponseHeader('X-Zotero-Version');
					if (Zotero.Connector.isOnline !== isOnline) {
						Zotero.Connector.isOnline = isOnline;
						if (Zotero.Connector_Browser && Zotero.Connector_Browser.onStateChange) {
							Zotero.Connector_Browser.onStateChange(isOnline && Zotero.Connector.clientVersion);
						}
					}
				}
				var val = null;
				if(req.responseText) {
					let contentType = req.getResponseHeader("Content-Type") || ""
					if (contentType.includes("application/json")) {
						val = JSON.parse(req.responseText);
					} else {
						val = req.responseText;
					}
				}
				if(req.status == 0 || req.status >= 400) {
					// Check for incompatible version
					if(req.status === 412) {
						if(Zotero.Connector_Browser && Zotero.Connector_Browser.onIncompatibleStandaloneVersion) {
							var standaloneVersion = req.getResponseHeader("X-Zotero-Version");
							Zotero.Connector_Browser.onIncompatibleStandaloneVersion(Zotero.version, standaloneVersion);
							deferred.reject("Connector: Version mismatch: Connector version "+Zotero.version
								+", Standalone version "+(standaloneVersion ? standaloneVersion : "<unknown>", val));
						}
					}
					
					Zotero.debug("Connector: Method "+method+" failed with status "+req.status);
					deferred.reject(new Zotero.Connector.CommunicationError(`Method ${method} failed`, req.status, val));
				} else {
					Zotero.debug("Connector: Method "+method+" succeeded");
					deferred.resolve(val);
				}
			} catch(e) {
				Zotero.logError(e);
				deferred.reject(new Zotero.Connector.CommunicationError(e.message, 0));
			}
		};
		
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
		options = {body: data, headers, successCodes: false, timeout};
		let httpMethod = data == null || data == undefined ? "GET" : "POST";
		Zotero.HTTP.request(httpMethod, uri, options)
		.then(newCallback)
		// Unexpected error, including a timeout
		.catch(function (e) {
			// Don't log status 0 (Zotero offline) report, it's chatty and needless
			if (e instanceof Zotero.HTTP.StatusError && e.status === 0) {
				Zotero.debug(e);
			}
			else {
				Zotero.logError(e);
			}
			deferred.reject(e);
		});
		let result = await deferred.promise;
		this._handleIntegrationTabClosed(method, tab);
		return result;
	},
	
	/**
	 * Adds detailed cookies to the data before sending "saveItems" request to
	 *  the server/Standalone
	 *
	 * @param {String|Object} options. See documentation above
	 * @param	{Object} data RPC data. See documentation above.
	 */
	this.callMethodWithCookies = function(options, data, tab) {
		if (Zotero.isBrowserExt) {
			let cookieParams = {
				url: tab.url
			};
			// When first-party isolation is enabled in Firefox, browser.cookies.getAll()
			// will fail if firstPartyDomain isn't provided, causing all saves to fail. According
			// to the document [1], passing null should cause all cookies to be returned, but as
			// of Fx60.0b7 that doesn't seem to be working, returning no cookies instead. (It
			// returns all cookies if FPI is disabled.)
			//
			// In 60.0b7 it does work to set the domain explicitly (e.g., 'gmu.edu'), but we
			// can't get that correctly without the public suffix list, which isn't yet available
			// to WebExtensions [2], so for now we pass null, which will cause attachments that
			// rely on cookies to fail but will at least allow saves to go through when FPI is
			// enabled.
			//
			// https://github.com/zotero/zotero-connectors/issues/226
			//
			// [1] https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/cookies/getAll
			// [2] https://bugzilla.mozilla.org/show_bug.cgi?id=1315558
			if (Zotero.isFirefox && Zotero.browserMajorVersion >= 59) {
				cookieParams.firstPartyDomain = null;
			}
			return browser.cookies.getAll(cookieParams)
			.then(function(cookies) {
				var cookieHeader = '';
				for(var i=0, n=cookies.length; i<n; i++) {
					cookieHeader += '\n' + cookies[i].name + '=' + cookies[i].value
						+ ';Domain=' + cookies[i].domain
						+ (cookies[i].path ? ';Path=' + cookies[i].path : '')
						+ (cookies[i].hostOnly ? ';hostOnly' : '') //not a legit flag, but we have to use it internally
						+ (cookies[i].secure ? ';secure' : '');
				}
				
				if(cookieHeader) {
					data.detailedCookies = cookieHeader.substr(1);
					delete data.cookie;
				}
				
				// Cookie URI needed to set up the cookie sandbox on standalone
				data.uri = tab.url;
				
				return this.callMethod(options, data, tab);
			}.bind(this));
		}
		
		return this.callMethod(options, data, tab);
	}

	/**
	 * This is callMethodWithCookies except that it unpacks the singlefile snapshot.
	 * We need to pack the snapshot because Chrome limits IPC messages to 128MB.
	 */
	this.saveSingleFile = async function(options, data, tab) {
		if (data.snapshotContent) {
			data.snapshotContent = await Zotero.Utilities.Connector.unpackString(data.snapshotContent);
		}
		return this.callMethodWithCookies(options, data, tab);
	}

	/**
	 * If running an integration method check if the tab is still available to receive
	 * a response from Zotero and if not - respond with an error message so that
	 * the integration operation can be discarded in Zotero
	 */
	this._handleIntegrationTabClosed = async function(method, tab) {
		if (tab && Zotero.isBrowserExt) {
			if (method.startsWith('document/')) {
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
