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
Zotero.Connector = {
	_CONNECTOR_API_VERSION: 2,
	
	// As of Chrome 38 (and corresponding Opera version 24?) pages loaded over
	// https (i.e. the zotero bookmarklet iframe) can not send requests over
	// http, so pinging Standalone at http://127.0.0.1 fails.
	// Disable for all browsers, except IE, which may be used frequently with ZSA
	isOnline: Zotero.isBookmarklet && !Zotero.isIE ? false : null,
	_shouldReportActiveURL: true,
	selected: {collection: null, library: null, item: null},
	clientVersion: '',

	init: function() {
		this.addEventListener('init', {notify: function(data) {
			this.selected = data.selected;
			Zotero.Connector_Browser._updateExtensionUI();
		}.bind(this)});
		this.addEventListener('select', {notify: function(data) {
			Object.assign(this.selected, data);
			Zotero.Connector_Browser._updateExtensionUI();
		}.bind(this)});
		this.addEventListener('reports', {notify: async function(data) {
			if ('errors' in data && 'get' in data.errors) {
				let sysInfo = await Zotero.getSystemInfo();
				let errors = await Zotero.Errors.getErrors();
				Zotero.Connector.callMethod('reports', {report: `${sysInfo}\n\n${errors.join('\n\n')}`});
			}
			else if ('debug' in data) {
				if ('get' in data.debug) {
					let debug = await Zotero.Debug.get();
					Zotero.Connector.callMethod('reports', {report: debug});
				}
				else if ('store' in data.debug) {
					Zotero.Debug.setStore(data.debug.store)
				}
				else if ('clear' in data.debug) {
					Zotero.Debug.clear();
				}
			}
		}});
		
		Zotero.Connector.SSE.init();
	},
	
	/**
	 * Checks if Zotero is online and passes current status to callback
	 * @param {Function} callback
	 */
	checkIsOnline: async function() {
		// Only check once in bookmarklet
		if (Zotero.isBookmarklet && this.isOnline !== null) {
			return this.isOnline;
		}
		
		// If SSE is available then we can return current status too
		if (Zotero.Connector.SSE.available) {
			return this.isOnline;
		}

		try {
			return await Zotero.Connector.ping("ping", {});
		}
		catch (e) {
			if (e.status === 0) {
				return false;
			}
			throw e
		}
	},

	reportActiveURL: function (url) {
		if (!this.isOnline || !this._shouldReportActiveURL) return;
		
		let payload = { activeURL: url };
		this.ping(payload);
	},
	
	ping: function (payload={}) {
		return Zotero.Connector.callMethod("ping", payload).then(function(response) {
			if (response && 'prefs' in response) {
				Zotero.Connector._shouldReportActiveURL = !!response.prefs.reportActiveURL;
				Zotero.Connector.automaticSnapshots = !!response.prefs.automaticSnapshots;
			}
			return response || {};
		});
	},
	
	getSelectedCollection: async function() {
		if (!Zotero.Connector.isOnline) {
			throw new this.CommunicationError('Zotero is Offline');
		} else if (Zotero.Connector.SSE.available) {
			return this.selected;
		} else {
			const response = await this.callMethod('getSelectedCollection', {});
			let selected = {
				library: {
					id: response.libraryID,
					name: response.libraryName,
					editable: response.libraryEditable,
				}
			};
			selected.collection = { id: response.id, name: response.name };
			selected.id = response.id || response.libraryID;
			selected.name = response.name;
			return selected;
		}
	},
	
	getClientVersion: async function() {
		let isOnline = await this.checkIsOnline();
		return isOnline && this.clientVersion;
	},
	
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
	callMethod: async function(options, data, tab) {
		// TODO: make this default behaviour once people switch to SSE enabled Zotero
		// and prompt if Zotero.isOnline but SSE unavailable - i.e. fairly old version of Zotero is running
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
				"X-Zotero-Connector-API-Version":Zotero.Connector._CONNECTOR_API_VERSION
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
	callMethodWithCookies: function(options, data, tab) {
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


Zotero.Connector.SSE = {
	_listeners: {},
	available: false,

	init: function() {
		const url = Zotero.Prefs.get('connector.url') + "connector/sse";
		this._evtSrc = new EventSource(url);
		this._evtSrc.onerror = this._onError.bind(this);
		this._evtSrc.onmessage = this._onMessage.bind(this);
		this._evtSrc.onopen = this._onOpen.bind(this);
	},
	
	_onError: function(e) {
		this._evtSrc.close();
		delete this._evtSrc;
		
		if (Zotero.Connector.isOnline) {
			Zotero.Connector.isOnline = false;
			Zotero.Connector_Browser.onStateChange(false);
			Zotero.debug('Zotero client went offline');
		}

		if (e.target.readyState != 1) {
			// Attempt to reconnect every 10 secs
			return setTimeout(this.init.bind(this), 10000);
		}
		// Immediately attempt to reconnect in case of a simple HTTP timeout
		this.init();
	},
	
	_onMessage: function(e) {
		var data = JSON.parse(e.data);
		Zotero.debug(`SSE event '${data.event}':${JSON.stringify(data.data).substr(0, 100)}`);
		if (data.event in this._listeners) {
			this._listeners[data.event].forEach((l) => l.notify(data.data));
		}
	},
	
	_onOpen: function() {
		this.available = true;
		Zotero.Connector.ping();
		Zotero.debug('Zotero client is online');
	},

	/**
	 * @param {String} event
	 * @param {Object} listener - {notify: function(data){} }
	 * @returns listener
	 * @private
	 */
	_addEventListener: function(event, listener) {
		if (event in this._listeners) {
			this._listeners[event].push(listener);
		} else {
			this._listeners[event] = [listener];
		}
		return listener;
	},
	
	_removeEventListener: function(event, fn) {
		if (event in this._listeners) {
			this._listeners[event] = this._listeners[event].filter((l) => l !== listener);
		}
	}
};
Zotero.Connector.addEventListener = Zotero.Connector.SSE._addEventListener.bind(Zotero.Connector.SSE);
Zotero.Connector.removeEventListener = Zotero.Connector.SSE._removeEventListener.bind(Zotero.Connector.SSE);
