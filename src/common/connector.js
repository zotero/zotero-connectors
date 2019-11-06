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
		// Only check once in bookmarklet
		if(Zotero.isBookmarklet && this.isOnline !== null) {
			return this.isOnline;
		}

		return this.ping({}).catch(function(e) {
			if (e.status == 0) {
				return false;
			}
			throw e;
		});
	};

	this.reportActiveURL = function(url) {
		if (!this.isOnline || !this.shouldReportActiveURL) return;
		
		let payload = { activeURL: url };
		this.ping(payload);
	}
	
	this.ping = function(payload={}) {
		return Zotero.Connector.callMethod("ping", payload).then(function(response) {
			if (response && 'prefs' in response) {
				Zotero.Connector.shouldReportActiveURL = !!response.prefs.reportActiveURL;
				Zotero.Connector.automaticSnapshots = !!response.prefs.automaticSnapshots;
			}
			return response || {};
		});
	}
	
	this.getClientVersion = async function() {
		let isOnline = await this.checkIsOnline();
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
	this.callMethod = async function(options, data, tab) {
		// Don't bother trying if not online in bookmarklet
		if (Zotero.isBookmarklet && this.isOnline === false) {
			throw new Zotero.Connector.CommunicationError("Zotero Offline", 0);
		}
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

				Zotero.Connector.clientVersion = req.getResponseHeader('X-Zotero-Version');
				if (Zotero.Connector.isOnline !== isOnline) {
					Zotero.Connector.isOnline = isOnline;
					if (Zotero.Connector_Browser && Zotero.Connector_Browser.onStateChange) {
						Zotero.Connector_Browser.onStateChange(isOnline && Zotero.Connector.clientVersion);
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
		options = {body: data, headers, successCodes: false, timeout};
		let httpMethod = data == null || data == undefined ? "GET" : "POST";
		Zotero.HTTP.request(httpMethod, uri, options)
		.then(newCallback)
		// Unexpected error, including a timeout
		.catch(function (e) {
			Zotero.logError(e);
			deferred.reject(e);
		});
		return deferred.promise;
	},
	
	/**
	 * Adds detailed cookies to the data before sending "saveItems" request to
	 *  the server/Standalone
	 *
	 * @param {String|Object} options. See documentation above
	 * @param	{Object} data RPC data. See documentation above.
	 */
	this.callMethodWithCookies = function(options, data, tab) {
		if (Zotero.isBrowserExt && !Zotero.isBookmarklet) {
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
