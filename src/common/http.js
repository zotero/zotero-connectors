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

/**
 * Functions for performing HTTP requests, both via XMLHTTPRequest and using a hidden browser
 * @namespace
 */
Zotero.HTTP = new function() {
	this.StatusError = function(xmlhttp, url) {
		this.message = `HTTP request to ${url} rejected with status ${xmlhttp.status}`;
		this.status = xmlhttp.status;
		try {
			this.responseText = typeof xmlhttp.responseText == 'string' ? xmlhttp.responseText : undefined;
		} catch (e) {}
	};
	this.StatusError.prototype = Object.create(Error.prototype);

	this.TimeoutError = function(ms) {
		this.message = `HTTP request has timed out after ${ms}ms`;
	};
	this.TimeoutError.prototype = Object.create(Error.prototype);
	
	/**
	 * Get a promise for a HTTP request
	 *
	 * @param {String} method The method of the request ("GET", "POST", "HEAD", or "OPTIONS")
	 * @param {String}	url				URL to request
	 * @param {Object} [options] Options for HTTP request:<ul>
	 *         <li>body - The body of a POST request</li>
	 *         <li>headers - Object of HTTP headers to send with the request</li>
	 *         <li>debug - Log response text and status code</li>
	 *         <li>logBodyLength - Length of request body to log</li>
	 *         <li>timeout - Request timeout specified in milliseconds [default 15000]</li>
	 *         <li>responseType - The response type of the request from the XHR spec</li>
	 *         <li>responseCharset - The charset the response should be interpreted as</li>
	 *         <li>successCodes - HTTP status codes that are considered successful, or FALSE to allow all</li>
	 *     </ul>
	 * @return {Promise<XMLHttpRequest>} A promise resolved with the XMLHttpRequest object if the
	 *     request succeeds, or rejected if the browser is offline or a non-2XX status response
	 *     code is received (or a code not in options.successCodes if provided).
	 */
	this.request = function(method, url, options = {}) {
		// Default options
		options = Object.assign({
			body: null,
			headers: {},
			debug: false,
			logBodyLength: 1024,
			timeout: 15000,
			responseType: '',
			responseCharset: null,
			successCodes: null
		}, options);
		
		var useContentXHR = false;
		
		if (Zotero.isInject) {
			// The privileged XHR that Firefox makes available to content scripts so that they
			// can make cross-domain requests doesn't include the Referer header in requests [1],
			// so sites that check for it don't work properly. As long as we're not making a
			// cross-domain request, we can use the content XHR that it provides, which does
			// include Referer. Chrome's XHR in content scripts includes Referer by default.
			//
			// [1] https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#XHR_and_Fetch
			if (Zotero.HTTP.isSameOrigin(url)) {
				if (typeof content != 'undefined' && content.XMLHttpRequest) {
					Zotero.debug("Using content XHR");
					useContentXHR = true;
				}
			}
			else {
				if (Zotero.isBookmarklet) {
					Zotero.debug("HTTP: Attempting cross-site request from bookmarklet; this may fail");
				}
				else {
					// Make a cross-origin request via the background page, parsing the responseText with
					// DOMParser and returning a Proxy with 'response' set to the parsed document
					let isDocRequest = options.responseType == 'document';
					let coOptions = Object.assign({}, options);
					if (isDocRequest) {
						coOptions.responseType = 'text';
					}
					return Zotero.COHTTP.request(method, url, coOptions).then(function (xmlhttp) {
						if (!isDocRequest) return xmlhttp;
						
						Zotero.debug("Parsing cross-origin response for " + url);
						let parser = new DOMParser();
						let contentType = xmlhttp.getResponseHeader("Content-Type");
						if (contentType != 'application/xml' && contentType != 'text/xml') {
							contentType = 'text/html';
						}
						let doc = parser.parseFromString(xmlhttp.responseText, contentType);
						
						return new Proxy(xmlhttp, {
							get: function (target, name) {
								return name == 'response' ? doc : target[name];
							}
						});
					});
				}
			}
		}
		
		let logBody = '';
		if (['GET', 'HEAD'].includes(method)) {
			if (options.body != null) {
				throw new Error(`HTTP ${method} cannot have a request body (${options.body})`)
			}
		} else if(options.body) {
			options.body = typeof options.body == 'string' ? options.body : JSON.stringify(options.body);
			
			if (!options.headers) options.headers = {};
			if (!options.headers["Content-Type"]) {
				options.headers["Content-Type"] = "application/x-www-form-urlencoded";
			}
			else if (options.headers["Content-Type"] == 'multipart/form-data') {
				// Allow XHR to set Content-Type with boundary for multipart/form-data
				delete options.headers["Content-Type"];
			}
					
			logBody = `: ${options.body.substr(0, options.logBodyLength)}` +
					options.body.length > options.logBodyLength ? '...' : '';
			// TODO: make sure below does its job in every API call instance
			// Don't display password or session id in console
			logBody = logBody.replace(/password":"[^"]+/, 'password":"********');
			logBody = logBody.replace(/password=[^&]+/, 'password=********');
		}
		Zotero.debug(`HTTP ${method} ${url}${logBody}`);
		
		var xmlhttp = useContentXHR ? new content.XMLHttpRequest() : new XMLHttpRequest();
		xmlhttp.timeout = options.timeout;
		var promise = Zotero.HTTP._attachHandlers(url, xmlhttp, options);
		
		xmlhttp.open(method, url, true);

		for (let header in options.headers) {
			xmlhttp.setRequestHeader(header, options.headers[header]);
		}
		
		xmlhttp.responseType = options.responseType || '';
		
		// Maybe should provide "mimeType" option instead. This is xpcom legacy, where responseCharset
		// could be controlled manually
		if (options.responseCharset) {
			xmlhttp.overrideMimeType("text/plain; charset=" + options.responseCharset);
		}
		
		xmlhttp.send(options.body);
		
		return promise.then(function(xmlhttp) {
			if (options.debug) {
				if (xmlhttp.responseType == '' || xmlhttp.responseType == 'text') {
					Zotero.debug(`HTTP ${xmlhttp.status} response: ${xmlhttp.responseText}`);
				}
				else {
					Zotero.debug(`HTTP ${xmlhttp.status} response`);
				}
			}	
			
			let invalidDefaultStatus = options.successCodes === null &&
				(xmlhttp.status < 200 || xmlhttp.status >= 300);
			let invalidStatus = Array.isArray(options.successCodes) && !options.successCodes.includes(xmlhttp.status);
			if (invalidDefaultStatus || invalidStatus) {
				throw new Zotero.HTTP.StatusError(xmlhttp, url);
			}
			return xmlhttp;
		});
	};
	/**
	* Send an HTTP GET request via XMLHTTPRequest
	*
	* @deprecated Use {@link Zotero.HTTP.request}
	* @param {String}			url				URL to request
	* @param {Function} 		onDone			Callback to be executed upon request completion
	* @param {String}			responseCharset	
	* @param {N/A}				cookieSandbox	Not used in Connector
	* @param {Object}			headers			HTTP headers to include with the request
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doGet = function(url, onDone, responseCharset, cookieSandbox, headers) {
		Zotero.debug('Zotero.HTTP.doGet is deprecated. Use Zotero.HTTP.request');
		this.request('GET', url, {responseCharset, headers})
		.then(onDone, function(e) {
			onDone({status: e.status, responseText: e.responseText});
			throw (e);
		});
		return true;
	};
	
	/**
	* Send an HTTP POST request via XMLHTTPRequest
	*
	* @deprecated Use {@link Zotero.HTTP.request}
	* @param {String}			url URL to request
	* @param {String|Object[]}	body Request body
	* @param {Function}			onDone Callback to be executed upon request completion
	* @param {String}			headers Request HTTP headers
	* @param {String}			responseCharset	
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doPost = function(url, body, onDone, headers, responseCharset) {
		Zotero.debug('Zotero.HTTP.doPost is deprecated. Use Zotero.HTTP.request');
		this.request('POST', url, {body, responseCharset, headers})
		.then(onDone, function(e) {
			onDone({status: e.status, responseText: e.responseText});
			throw (e);
		});
		return true;	
	};
	
	
	/**
	 * Adds a ES6 Proxied location attribute
	 * @param doc
	 * @param docUrl
	 */
	this.wrapDocument = function(doc, docURL) {
		let url = require('url');
		docURL = url.parse(docURL);
		docURL.toString = () => this.href;
		var wrappedDoc = new Proxy(doc, {
			get: function (t, prop) {
				if (prop === 'location') {
					return docURL;
				}
				else if (prop == 'evaluate') {
					// If you pass the document itself into doc.evaluate as the second argument
					// it fails, because it receives a proxy, which isn't of type `Node` for some reason.
					// Native code magic.
					return function() {
						if (arguments[1] == wrappedDoc) {
							arguments[1] = t;
						}
						return t.evaluate.apply(t, arguments)
					}
				}
				else {
					if (typeof t[prop] == 'function') {
						return t[prop].bind(t);
					}
					return t[prop];
				}
			}
		});
		return wrappedDoc;
	};
	
	
	/**
	 * Adds request handlers to the XMLHttpRequest and returns a promise that resolves when
	 * the request is complete. xmlhttp.send() still needs to be called, this just attaches the
	 * handler
	 *
	 * See {@link Zotero.HTTP.request} for parameters
	 * @private
	 */
	this._attachHandlers = function(url, xmlhttp, options) {
		var deferred = Zotero.Promise.defer();
		xmlhttp.onload = () => deferred.resolve(xmlhttp);
		xmlhttp.onerror = xmlhttp.onabort = function() {
			var e = new Zotero.HTTP.StatusError(xmlhttp, url);
			if (options.successCodes === false) {
				deferred.resolve(xmlhttp);
			} else {
				deferred.reject(e);
			}
		};
		xmlhttp.ontimeout = function() {
			var e = new Zotero.HTTP.TimeoutError(xmlhttp.timeout);
			Zotero.logError(e);
			deferred.reject(e);
		};
		return deferred.promise;
	};
}

// Alias as COHTTP = Cross-origin HTTP; this is how we will call it from children
// For injected scripts, this get overwritten in messaging.js (see messages.js)
Zotero.COHTTP = {
	request: Zotero.HTTP.request
};
