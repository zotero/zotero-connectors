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
	// As of Chrome 38 (and corresponding Opera version 24?) pages loaded over
	// https (i.e. the zotero bookmarklet iframe) can not send requests over
	// http, so pinging Standalone at http://127.0.0.1 fails.
	// Disable for all browsers, except IE, which may be used frequently with ZSA
	this.isOnline = Zotero.isBookmarklet && !Zotero.isIE ? false : null;
	this.shouldReportActiveURL = true;
	
	/**
	 * Checks if Zotero is online and passes current status to callback
	 * @param {Function} callback
	 */
	this.checkIsOnline = Zotero.Promise.method(function() {
		// Only check once in bookmarklet
		if(Zotero.isBookmarklet && this.isOnline !== null) {
			return this.isOnline;
		}

		var deferred = Zotero.Promise.defer();
		
		if (Zotero.isIE) {
			if (window.location.protocol !== "http:") {
				this.isOnline = false;
				return false;
			}
		
			Zotero.debug("Connector: Looking for Zotero Standalone");
			var fail = function() {
				if (this.isOnline !== null) return;
				Zotero.debug("Connector: Zotero Standalone is not online or cannot be contacted");
				this.isOnline = false;
				deferred.resolve(false);
			}.bind(this);
			
			window.setTimeout(fail, 1000);
			try {
				var xdr = new XDomainRequest();
				xdr.timeout = 700;
				xdr.open("POST", `${Zotero.Prefs.get('connector.url')}connector/ping`, true);
				xdr.onerror = function() {
					Zotero.debug("Connector: XDomainRequest to Zotero Standalone experienced an error");
					fail();
				};
				xdr.ontimeout = function() {
					Zotero.debug("Connector: XDomainRequest to Zotero Standalone timed out");
					fail();
				};
				xdr.onload = function() {
					if(me.isOnline !== null) return;
					me.isOnline = true;
					Zotero.debug("Connector: Standalone found; trying IE hack");
					
					_ieConnectorCallbacks = [];
					var listener = function(event) {
						if(!Zotero.Prefs.get('connector.url').includes(event.origin)
								|| event.source !== iframe.contentWindow) return;
						if(event.stopPropagation) {
							event.stopPropagation();
						} else {
							event.cancelBubble = true;
						}
						
						// If this is the first time the target was loaded, then this is a loaded
						// event
						if(!_ieStandaloneIframeTarget) {
							Zotero.debug("Connector: Standalone loaded");
							_ieStandaloneIframeTarget = iframe.contentWindow;
							deferred.resolve(true);
						}
						
						// Otherwise, this is a response event
						try {
							var data = JSON.parse(event.data);
						} catch(e) {
							Zotero.debug("Invalid JSON received: "+event.data);
							return;
						}
						var xhrSurrogate = {
							"status":data[1],
							"responseText":data[2],
							"getResponseHeader":function(x) { return data[3][x.toLowerCase()] }
						};
						_ieConnectorCallbacks[data[0]](xhrSurrogate);
						delete _ieConnectorCallbacks[data[0]];
					};
					
					if(window.addEventListener) {
						window.addEventListener("message", listener, false);
					} else {
						window.attachEvent("onmessage", function() { listener(event); });
					}
					
					var iframe = document.createElement("iframe");
					iframe.src = `${Zotero.Prefs.get('connector.url')}connector/ieHack`;
					document.documentElement.appendChild(iframe);
				};
				xdr.send("");
			} catch(e) {
				Zotero.logError(e);
				fail();
			}
		} else {
			return this.ping({}).catch(function(e) {
				if (e.status == 0) {
					return false;
				}
				throw e
			});
		}
		return deferred.promise;
	});

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
	this.callMethod = Zotero.Promise.method(function(options, data, tab) {
		// Don't bother trying if not online in bookmarklet
		if (Zotero.isBookmarklet && this.isOnline === false) {
			throw new Zotero.CommunicationError("Zotero Offline", 0);
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
				
				if(Zotero.Connector.isOnline !== isOnline) {
					Zotero.Connector.isOnline = isOnline;
					if(Zotero.Connector_Browser && Zotero.Connector_Browser.onStateChange) {
						Zotero.Connector_Browser.onStateChange(isOnline && req.getResponseHeader('X-Zotero-Version'));
					}
				}
				var val = null;
				if(req.responseText) {
					if(req.getResponseHeader("Content-Type") === "application/json") {
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
					deferred.reject(new Zotero.Connector.CommunicationError(`Method ${options.method} failed`, req.status, val));
				} else {
					Zotero.debug("Connector: Method "+method+" succeeded");
					deferred.resolve(val);
				}
			} catch(e) {
				Zotero.logError(e);
				deferred.reject(new Zotero.Connector.CommunicationError(e.message, 0));
			}
		};
		
		if(Zotero.isIE) {	// IE requires XDR for CORS
			if(_ieStandaloneIframeTarget) {
				var requestID = Zotero.Utilities.randomString();
				_ieConnectorCallbacks[requestID] = newCallback;
				_ieStandaloneIframeTarget.postMessage(JSON.stringify([null, "connectorRequest",
					[requestID, method, JSON.stringify(data)]]), `${Zotero.Prefs.get('connector.url')}/connector/ieHack`);
			} else {
				Zotero.debug("Connector: No iframe target; not sending to Standalone");
				throw new Zotero.Connector.CommunicationError("No iframe target; not sending to Standalone", 0);
			}
		} else {							// Other browsers can use plain doPost
			var uri = Zotero.Prefs.get('connector.url') + "connector/" + method + queryString;
			if (headers["Content-Type"] == 'application/json') {
				data = JSON.stringify(data);
			}
			let options = {body: data, headers, successCodes: false, timeout};
			let httpMethod = data == null || data == undefined ? "GET" : "POST";
			Zotero.HTTP.request(httpMethod, uri, options)
			.then(newCallback)
			// Unexpected error, including a timeout
			.catch(function (e) {
				Zotero.logError(e);
				deferred.reject(e);
			});
		}
		return deferred.promise;
	}),
	
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
	this.submitReport = function() {
		return Zotero.Debug.get().then(function(body){
			return Zotero.HTTP.request("POST", ZOTERO_CONFIG.REPOSITORY_URL + "report?debug=1", {body});
		}).then(function(xmlhttp) {
			if (!xmlhttp.responseXML) {
				throw new Error('Invalid response from server');
			}
			var reported = xmlhttp.responseXML.getElementsByTagName('reported');
			if (reported.length != 1) {
				throw new Error('The server returned an error. Please try again.');
			}
			return reported[0].getAttribute('reportID');
		});
	};
}
