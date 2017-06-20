/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2016 Center for History and New Media
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
 * Intercepts web requests to detect and redirect proxies. Loosely based on Zotero for Firefox proxy code.
 *
 * Zotero.Proxies.Detectors specifies detector functions/objects, which run asynchronously for every
 * request and add new proxies based on proxy specific rule match
 *
 * Zotero.Proxies.proxies defines a list of already known proxies (Zotero.Proxy), based on an URL match scheme.
 *
 * Each Zotero.Proxy holds a list of already recognized hosts (previously accessed via the proxy
 * by the user) and automatically redirects the requests to these hosts via the proxy.
 */

(function() {

"use strict";

var url = require('url');

/**
 * A singleton to handle URL rewriting proxies
 * @namespace
 * @property transparent {Boolean} Whether transparent proxy functionality is enabled
 * @property proxies {Zotero.Proxy[]} All loaded proxies
 * @property hosts {Zotero.Proxy{}} Object mapping hosts to proxies
 */
Zotero.Proxies = new function() {
	/**
	 * Initializes the proxy settings
	 * @returns Promise{boolean} proxy enabled/disabled status
	 */
	this.init = function() {
		this.transparent = false;
		this.proxies = [];
		this.hosts = {};
		this._ignoreURLs = new Set();
		
		this.loadPrefs();
		
		Zotero.Proxies.lastIPCheck = 0;
		Zotero.Proxies.disabledByDomain = false;
		
		Zotero.Proxies.proxies = Zotero.Prefs.get('proxies.proxies').map(function(proxy) {
			proxy = new Zotero.Proxy(proxy);
			for (let host of proxy.hosts) {
				Zotero.Proxies.hosts[host] = proxy;
			}
			return proxy;
		});
		
		if (this.transparent) {
			Zotero.Proxies.loadFromClient();
		}
	};
	
	this.loadPrefs = function() {
		Zotero.Proxies.transparent = Zotero.Prefs.get("proxies.transparent");
		Zotero.Proxies.autoRecognize = Zotero.Proxies.transparent && Zotero.Prefs.get("proxies.autoRecognize");
		
		var disableByDomainPref = Zotero.Prefs.get("proxies.disableByDomain");
		Zotero.Proxies.disableByDomain = (Zotero.Proxies.transparent && disableByDomainPref ? Zotero.Prefs.get("proxies.disableByDomainString") : null);
		Zotero.Proxies.showRedirectNotification = Zotero.Prefs.get("proxies.showRedirectNotification");	
		
		if (this.transparent) {
			this.enable();
			this.updateDisabledByDomain();
		} else {
			this.disable();
		}
	};
	
	
	this.enable = function() {
		Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.Proxies.observe);
	};
	
	
	this.disable = function() {
		Zotero.WebRequestIntercept.removeListener('headersReceived', Zotero.Proxies.observe);
	};
	
	
	this.updateDisabledByDomain = function() {
		if (!Zotero.Proxies.disableByDomain) return;
		let now = Date.now();
		if (now - this.lastIPCheck > 15 * 60 * 1000) {
			this.lastIPCheck = now;
			Zotero.Proxies.DNS.getHostnames().then(function(hosts) {
				// if domains necessitate disabling, disable them
				Zotero.Proxies.disabledByDomain = false;
				for (var host of hosts) {
					Zotero.Proxies.disabledByDomain = host.toLowerCase().indexOf(Zotero.Proxies.disableByDomain) != -1;
					if (Zotero.Proxies.disabledByDomain) return;
				}
				
				// IP update interval is every 15 minutes
			}.bind(this));
		}
	};
	
	this.loadFromClient = function() {
		if (Zotero.Prefs.get('proxies.clientChecked')) return;
		return Zotero.Connector.callMethod('proxies', null).then(function(result) {
			for (let proxy of result) {
				let existingProxy;
				for (let p of Zotero.Proxies.proxies) {
					if (proxy.scheme == p.scheme) {
						existingProxy = p;
						break;
					}
				}
				if (existingProxy) {
					// Copy hosts from the client if proxy already exists
					existingProxy.hosts.push.apply(existingProxy.hosts, proxy.hosts);
					existingProxy.hosts = Array.from(new Set(existingProxy.hosts));
				} else {
					// Otherwise add the proxy
					Zotero.Proxies.proxies.push(new Zotero.Proxy(proxy));
				}
			}
			Zotero.Proxies.storeProxies();

			Zotero.Prefs.set('proxies.clientChecked', true);
			return result;
		}, () => 0);
	}
	

	/**
	 * Observe method to capture and redirect page loads if they're going through an existing proxy.
	 *
	 * @param {Object} details - webRequest details object
	 */
	this.observe = function (details, meta) {
		if (meta.proxyRedirected || Zotero.Proxies._ignoreURLs.has(details.url) || details.statusCode >= 400) {
			return;
		}
		// try to detect a proxy
		var requestURL = details.url;

		// see if there is a proxy we already know
		var m = false;
		for (var proxy of  Zotero.Proxies.proxies) {
			if (proxy.regexp) {
				m = proxy.regexp.exec(requestURL);
				if (m) break;
			}
		}
		function notifyNewProxy(proxy, proxiedHost) {
			_showNotification(
				'New Zotero Proxy',
				`Zotero detected that you are accessing ${proxy.hosts[proxy.hosts.length-1]} through a proxy. Would you like to automatically redirect future requests to ${proxy.hosts[proxy.hosts.length-1]} through ${proxiedHost}?`,
				['✕', 'Proxy Settings', 'Accept']
			)
			.then(function(response) {
				if (response == 2) {
					return Zotero.Messaging.sendMessage('confirm', {
						title: 'Only add proxies linked from your library, school, or corporate website',
						message: 'Adding other proxies allows malicious sites to masquerade as sites you trust.<br/></br>'
							+ 'Adding this proxy will allow Zotero to recognize items from proxied pages and will automatically '
							+ `redirect future requests to ${proxy.hosts[proxy.hosts.length-1]} through ${proxiedHost}.`,
						button1Text: 'Add Proxy',
						button2Text: 'Cancel'
					}).then(function(result) {
						if (result.button == 1) {
							return Zotero.Proxies.save(proxy);
						}
					});
				}
				if (response == 1) {
					Zotero.Connector_Browser.openPreferences("proxies");
					// This is a bit of a hack.
					// Technically the notification can take an onClick handler, but we cannot
					// pass functions from background to content scripts easily
					// so to "keep the notification open" we display it agian
					notifyNewProxy(proxy, proxiedHost);
				}
			});
		}

		if (m) {
			var host = m[proxy.parameters.indexOf("%h")+1];
			// add this host if we know a proxy
			if (proxy.autoAssociate							// if autoAssociate is on
				&& details.statusCode < 400					// and query was successful
				&& !Zotero.Proxies.hosts[host]				// and host is not saved
				&& proxy.hosts.indexOf(host) === -1
				&& !_isBlacklisted(host)					// and host is not blacklisted
			) {
				proxy.hosts.push(host);
				Zotero.Proxies.save(proxy);

				let requestURI = url.parse(requestURL);
				_showNotification(
					'New Zotero Proxy Host',
					`Zotero automatically associated ${host} with a previously defined proxy. Future requests to this site will be redirected to ${requestURI.host}.`,
					["✕", "Proxy Settings"]
				)
				.then(function(response) {
					if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
				});
			}
		} else if (Zotero.Proxies.autoRecognize) {
			// perform in the next event loop step to reduce impact of header processing in a blocking call
			setTimeout(function() {
				var proxy = false;
				for (var detectorName in Zotero.Proxies.Detectors) {
					var detector = Zotero.Proxies.Detectors[detectorName];
					try {
						proxy = detector(details);
					} catch(e) {
						Zotero.logError(e);
					}
					
					if (!proxy) continue;
					let requestURI = url.parse(requestURL);
					Zotero.debug("Proxies: Detected "+detectorName+" proxy "+proxy.scheme+" for "+requestURI.host);
					
					notifyNewProxy(proxy, requestURI.host);
					
					break;
				}
			});
		}

		Zotero.Proxies.updateDisabledByDomain();
		if (Zotero.Proxies.disabledByDomain) return;

		var proxied = Zotero.Proxies.properToProxy(requestURL, true);
		if (!proxied) return;

		return _maybeRedirect(details, proxied, meta);
	};

	function _maybeRedirect(details, proxied, meta) {
		var proxiedURI = url.parse(proxied);
		if (details.requestHeadersObject['referer']) {
			// If the referrer is a proxiable host, we already have access (e.g., we're
			// on-campus) and shouldn't redirect
			if (Zotero.Proxies.properToProxy(details.requestHeadersObject['referer'], true)) {
				Zotero.debug("Proxies: skipping redirect; referrer was proxiable");
				return;
			}
			// If the referrer is the same host as we're about to redirect to, we shouldn't
			// or we risk a loop
			if (url.parse(details.requestHeadersObject['referer']).hostname == proxiedURI.hostname) {
				Zotero.debug("Proxies: skipping redirect; redirect URI and referrer have same host");
				return;
			}
		}

		if (details.originUrl) {
			// If the original URI was a proxied host, we also shouldn't redirect, since any
			// links handed out by the proxy should already be proxied
			if (Zotero.Proxies.proxyToProper(details.originUrl, true)) {
				Zotero.debug("Proxies: skipping redirect; original URI was proxied");
				return;
			}
			// Finally, if the original URI is the same as the host we're about to redirect
			// to, then we also risk a loop
			if (url.parse(details.originUrl).hostname == proxiedURI.hostname) {
				Zotero.debug("Proxies: skipping redirect; redirect URI and original URI have same host");
				return;
			}
		}

		// make sure that the top two domains (e.g. gmu.edu in foo.bar.gmu.edu) of the
		// channel and the site to which we're redirecting don't match, to prevent loops.
		const top2DomainsRe = /[^\.]+\.[^\.]+$/;
		let top21 = top2DomainsRe.exec(url.parse(details.url).hostname);
		let top22 = top2DomainsRe.exec(proxiedURI.hostname);
		if (!top21 || !top22 || top21[0] == top22[0]) {
			Zotero.debug("Proxies: skipping redirect; redirect URI and URI have same top 2 domains");
			return;
		}

		// Otherwise, redirect.
		if (Zotero.Proxies.showRedirectNotification && details.type === 'main_frame') {
			_showNotification(
				'Zotero Proxy Redirection',
				`Zotero automatically redirected your request to ${url.parse(details.url).host} through the proxy at ${proxiedURI.host}.`,
				['✕', 'Proxy Settings']
			)
			.then(function(response) {
				if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
			});
		}

		meta.proxyRedirected = true;
		return {redirectUrl: proxied};
	}


	/**
	 * Update proxy and host maps and store proxy settings in storage
	 */
	this.save = function(proxy) {
		// If empty or default scheme
		var invalid = Zotero.Proxies.validate(proxy);
		if (invalid) {
			Zotero.debug(`Proxy ${proxy.scheme} invalid with reason ${JSON.stringify(invalid)}`);
			return Zotero.Proxies.remove(proxy);
		}
		
		// If no %h present, then only a single host can be supported and we drop all but the first one.
		if (proxy.scheme.indexOf('%h') == -1) {
			proxy.hosts = proxy.hosts.slice(0, 1);
		}
		proxy = new Zotero.Proxy(proxy);
	
		var existingProxyIndex = Zotero.Proxies.proxies.findIndex((p) => p.id == proxy.id);
		if (existingProxyIndex == -1) {
			Zotero.Proxies.proxies.push(proxy);
		}
		else {
			Zotero.Proxies.proxies[existingProxyIndex] = proxy;
		}
		if (!proxy.regexp) proxy.compileRegexp();

		// delete hosts that point to this proxy if they no longer exist
		for (let host in Zotero.Proxies.hosts) {
			if (Zotero.Proxies.hosts[host].id == proxy.id && proxy.hosts.indexOf(host) == -1) {
				delete Zotero.Proxies.hosts[host];
			}
		}
		
		for (let host of proxy.hosts) {
			Zotero.Proxies.hosts[host] = proxy;
		}
		
		Zotero.Proxies.storeProxies();
	};

	/**
	 * Ensures that the proxy scheme and host settings are valid for this proxy type
	 *
	 * @returns {Array{String}|Boolean} An error type if a validation error occurred, or "false" if there was
	 *	no error.
	 */
	this.validate = function(proxy) {
		proxy.scheme.trim();
		if (proxy.scheme.length < 8 || (proxy.scheme.substr(0, 7) != "http://" && proxy.scheme.substr(0, 8) != "https://")) {
			return ["scheme.noHTTP"];
		}
		
		if (!Zotero_Proxy_schemeParameterRegexps["%p"].test(proxy.scheme) &&
				(!Zotero_Proxy_schemeParameterRegexps["%d"].test(proxy.scheme) ||
				!Zotero_Proxy_schemeParameterRegexps["%f"].test(proxy.scheme))) {
			return ["scheme.noPath"];
		}

		// If empty or unmodified scheme
		if (proxy.scheme.length == 0 || proxy.scheme == 'http://%h.example.com/%p') {
			return ["scheme.invalid"];
		}
		// If empty or unmodified hosts
		if (proxy.hosts.length == 0 || proxy.hosts.length == 1 && proxy.hosts[0].trim().length == 0) {
			return ["hosts.invalid"];
		}
		
		for (let host in proxy.hosts) {
			host = host.trim();
			var oldProxy = Zotero.Proxies.hosts[host];
			if (oldProxy && oldProxy.proxyID  != proxy.proxyID) {
				return ["host.proxyExists", host];
			}
		}
		
		return false;
	};
	
	this.remove = function(proxy) {
		var existingProxyIndex = Zotero.Proxies.proxies.findIndex((p) => p.id == proxy.id);
		if (existingProxyIndex != -1) {
			Zotero.Proxies.proxies.splice(existingProxyIndex, 1);
			Zotero.Proxies.storeProxies();
		}
		Object.keys(Zotero.Proxies.hosts).filter(function(h) {
			if (Zotero.Proxies.hosts[h]) {
				delete Zotero.Proxies.hosts[h];
			}
		});
	};
	
	this.storeProxies = function() {
		let proxies = Zotero.Proxies.proxies.map(function(p) {
			return {
				id: p.id,
				autoAssociate: p.autoAssociate,
				scheme: p.scheme,
				hosts: p.hosts,
				dotsToHyphens: p.dotsToHyphens
			};
		});
		
		Zotero.Prefs.set('proxies.proxies', proxies);
	};

	/**
	 * Returns a page's proper URL from a proxied URL. Uses both transparent and opaque proxies.
	 * @param {String} URL
	 * @param {Boolean} onlyReturnIfProxied Controls behavior if the given URL is not proxied. If
	 *	it is false or unspecified, unproxied URLs are returned verbatim. If it is true, the
	 *	function will return "false" if the given URL is unproxied.
	 * @type String
	 */
	this.proxyToProper = function(URL, onlyReturnIfProxied) {
		for (var proxy of Zotero.Proxies.proxies) {
			if (proxy.regexp) {
				var m = proxy.regexp.exec(URL);
				if (m) {
					var toProper = proxy.toProper(m);
					Zotero.debug("Proxies.proxyToProper: "+URL+" to "+toProper);
					return toProper;
				}
			}
		}
		return (onlyReturnIfProxied ? false : URL);
	};

	/**
	 * Returns a page's proxied URL from the proper URL. Uses only transparent proxies.
	 * @param {String} URL
	 * @param {Boolean} onlyReturnIfProxied Controls behavior if the given URL is not proxied. If
	 *	it is false or unspecified, unproxied URLs are returned verbatim. If it is true, the
	 *	function will return "false" if the given URL is unproxied.
	 * @type String
	 */
	this.properToProxy = function(URL, onlyReturnIfProxied) {
		var uri = url.parse(URL);
		if (Zotero.Proxies.hosts[uri.host]) {
			var toProxy = Zotero.Proxies.hosts[uri.host].toProxy(uri);
			Zotero.debug("Proxies.properToProxy: "+URL+" to "+toProxy);
			return toProxy;
		}
		return (onlyReturnIfProxied ? false : URL);
	};

	/**
	 * Check the url for potential proxies and deproxify, providing a schema to build
	 * a proxy object.
	 * 
	 * @param URL
	 * @returns {Object} Unproxied url to proxy object
	 */
	this.getPotentialProxies = function(URL) {
		var urlToProxy = {};
		// If it's a known proxied URL just return it
		if (Zotero.Proxies.transparent) {
			for (var proxy of Zotero.Proxies.proxies) {
				if (proxy.regexp) {
					var m = proxy.regexp.exec(URL);
					if (m) {
						let proper = proxy.toProper(m);
						urlToProxy[proper] = proxy.toJSON();
						return urlToProxy;
					}
				}
			}
		}
		urlToProxy[URL] = null;
		
		// if there is a subdomain that is also a TLD, also test against URI with the domain
		// dropped after the TLD
		// (i.e., www.nature.com.mutex.gmu.edu => www.nature.com)
		var m = /^(https?:\/\/)([^\/]+)/i.exec(URL);
		if (m) {
			// First, drop the 0- if it exists (this is an III invention)
			var host = m[2];
			if (host.substr(0, 2) === "0-") host = host.substr(2);
			var hostnameParts = [host.split(".")];
			if (m[1] == 'https://' && host.replace(/-/g, '.') != host) {
				// try replacing hyphens with dots for https protocol
				// to account for EZProxy HttpsHypens mode
				hostnameParts.push(host.replace(/-/g, '.').split('.'));
			}
			
			for (let i=0; i < hostnameParts.length; i++) {
				let parts = hostnameParts[i];
				// If hostnameParts has two entries, then the second one is with replaced hyphens
				let dotsToHyphens = i == 1;
				// skip the lowest level subdomain, domain and TLD
				for (let j=1; j<parts.length-2; j++) {
					// if a part matches a TLD, everything up to it is probably the true URL
					if (TLDS[parts[j].toLowerCase()]) {
						var properHost = parts.slice(0, j+1).join(".");
						// protocol + properHost + /path
						var properURL = m[1]+properHost+URL.substr(m[0].length);
						var proxyHost = parts.slice(j+1).join('.');
						urlToProxy[properURL] = {scheme: m[1] + '%h.' + proxyHost + '/%p', dotsToHyphens};
					}
				}
			}
		}
		return urlToProxy;
	};

	/**
	 * Determines whether a host is blacklisted, i.e., whether we should refuse to save transparent
	 * proxy entries for this host. This is necessary because EZProxy offers to proxy all Google and
	 * Wikipedia subdomains, but in practice, this would get really annoying.
	 *
	 * @type Boolean
	 * @private
	 */
	function _isBlacklisted(host) {
		/**
		 * Regular expression patterns of hosts never to proxy
		 * @const
		 */
		const hostBlacklist = [
			/edu$/,
			/google\.com$/,
			/wikipedia\.org$/,
			/^[^.]*$/,
			/doubleclick\.net$/
		];
		/**
		 * Regular expression patterns of hosts that should always be proxied, regardless of whether
		 * they're on the blacklist
		 * @const
		 */
		const hostWhitelist = [
			/^scholar\.google\.com$/,
			/^muse\.jhu\.edu$/
		]

		for (var blackPattern of hostBlacklist) {
			if (blackPattern.test(host)) {
				for (var whitePattern of hostWhitelist) {
					if (whitePattern.test(host)) {
						return false;
					}
				}
				return true;
			}
		}
		return false;
	}

	/**
	 * Show a proxy-related notification
	 * @param {String} title - notification title (currently unused)
	 * @param {String} message - notification text
	 * @param {String[]} actions
	 * @param {Number} timeout
	 */
	function _showNotification(title, message, actions, timeout) {
		// chrome.notifications.create({
		// 	type: 'basic',
		// 	title,
		// 	message,
		// 	iconUrl: 'Icon-128.png'
		// });
		Zotero.debug(`NOTIFICATION: ${message}`);
		actions = actions && actions.map((a) => {return {title: a, dismiss: true}});
		return Zotero.Connector_Browser.notify(message, actions, timeout);
	}

};

/**
 * Creates a Zotero.Proxy object from a DB row
 *
 * @constructor
 * @class A model for a http proxy server
 */
Zotero.Proxy = function (json={}) {
	this.id = json.id || Date.now();
	this.autoAssociate = !!json.autoAssociate;
	this.scheme = json.scheme;
	this.hosts = json.hosts || [];
	this.dotsToHyphens = !!json.dotsToHyphens;
	if (this.scheme) {
		// Loading from storage or new
		this.compileRegexp();
	}
};

/**
 * Convert the proxy to JSON compatible object
 * @returns {Object}
 */
Zotero.Proxy.prototype.toJSON = function() {
	if (!this.scheme) {
		throw Error('Cannot convert proxy to JSON - no scheme');
	}
	return {id: this.id, scheme: this.scheme, dotsToHyphens: this.dotsToHyphens};
};


/**
 * Regexps to match the URL contents corresponding to proxy scheme parameters
 * @const
 */
const Zotero_Proxy_schemeParameters = {
	"%p": "(.*?)",	// path
	"%d": "(.*?)",	// directory
	"%f": "(.*?)",	// filename
	"%a": "(.*?)",	// anything
	"%h": "([a-zA-Z0-9]+[.\\-][a-zA-Z0-9.\\-]+)"	// hostname
};

/**
 * Regexps to match proxy scheme parameters in the proxy scheme URL
 * @const
 */
const Zotero_Proxy_schemeParameterRegexps = {
	"%p": /([^%])%p/,
	"%d": /([^%])%d/,
	"%f": /([^%])%f/,
	"%h": /([^%])%h/,
	"%a": /([^%])%a/
};


/**
 * Compiles the regular expression against which we match URLs to determine if this proxy is in use
 * and saves it in this.regexp
 */
Zotero.Proxy.prototype.compileRegexp = function() {
	var indices = this.indices = {};
	this.parameters = [];
	for (var param in Zotero_Proxy_schemeParameters) {
		var index = this.scheme.indexOf(param);

		// avoid escaped matches
		while (this.scheme[index-1] && (this.scheme[index-1] == "%")) {
			this.scheme = this.scheme.substr(0, index-1)+this.scheme.substr(index);
			index = this.scheme.indexOf(param, index+1);
		}

		if (index != -1) {
			this.indices[param] = index;
			this.parameters.push(param);
		}
	}

	// sort params by index
	this.parameters = this.parameters.sort(function(a, b) {
		return indices[a]-indices[b];
	});

	// now replace with regexp fragment in reverse order
	var re = "^"+Zotero.Utilities.quotemeta(this.scheme)+"$";
	for(var i=this.parameters.length-1; i>=0; i--) {
		var param = this.parameters[i];
		re = re.replace(Zotero_Proxy_schemeParameterRegexps[param], "$1"+Zotero_Proxy_schemeParameters[param]);
	}

	this.regexp = new RegExp(re);
}

/**
 * Converts a proxied URL to an unproxied URL using this proxy
 *
 * @param m {Array} The match from running this proxy's regexp against a URL spec
 * @type String
 */
Zotero.Proxy.prototype.toProper = function(m) {
	if (!Array.isArray(m)) {
		let match = this.regexp.exec(m);
		if (!match) {
			return m
		} else {
			m = match;
		}
	}
	let hostIdx = this.parameters.indexOf("%h");
	let scheme = this.scheme.indexOf('https') == -1 ? 'http://' : 'https://';
	if (hostIdx != -1) {
		var properURL = scheme+m[hostIdx+1]+"/";
	} else {
		var properURL = scheme+this.hosts[0]+"/";
	}
	
	// Replace `-` with `.` in https to support EZProxy HttpsHyphens.
	// Potentially troublesome with domains that contain dashes
	if (this.dotsToHyphens ||
		(this.dotsToHyphens == undefined && scheme == "https://") ||
		!properURL.includes('.')) {
		properURL = properURL.replace(/-/g, '.');
	}

	if (this.indices["%p"]) {
		properURL += m[this.parameters.indexOf("%p")+1];
	} else {
		var dir = m[this.parameters.indexOf("%d")+1];
		var file = m[this.parameters.indexOf("%f")+1];
		if (dir !== "") properURL += dir+"/";
		properURL += file;
	}

	return properURL;
}

/**
 * Converts an unproxied URL to a proxied URL using this proxy
 *
 * @param {Object|String} uri The URI corresponding to the unproxied URL
 * @type String
 */
Zotero.Proxy.prototype.toProxy = function(uri) {
	if (typeof uri == "string") {
		uri = url.parse(uri);
	}
	if (this.regexp.exec(uri.href)) {
		return uri.href;
	}
	var proxyURL = this.scheme;

	for(var i=this.parameters.length-1; i>=0; i--) {
		var param = this.parameters[i];
		var value = "";
		if (param == "%h") {
			value = this.dotsToHyphens ? uri.host.replace(/\./g, '-') : uri.host;
		} else if (param == "%p") {
			value = uri.path.substr(1);
		} else if (param == "%d") {
			value = uri.path.substr(0, uri.path.lastIndexOf("/"));
		} else if (param == "%f") {
			value = uri.path.substr(uri.path.lastIndexOf("/")+1)
		}

		proxyURL = proxyURL.substr(0, this.indices[param])+value+proxyURL.substr(this.indices[param]+2);
	}

	return proxyURL;
}

/**
 * Detectors for various proxy systems
 * @namespace
 */
Zotero.Proxies.Detectors = {};

/**
 * Detector for OCLC EZProxy
 * @param {Object} details
 * @type Boolean|Zotero.Proxy
 */
Zotero.Proxies.Detectors.EZProxy = function(details) {
	// Try to catch links from one proxy-by-port site to another
	var uri = url.parse(details.url);
	if (uri.port && [80, 443].indexOf(uri.port) == -1) {
		// Two options here: we could have a redirect from an EZProxy site to another, or a link
		// If it's a redirect, we'll have to catch the Location: header
		var toProxy = false;
		var fromProxy = false;
		if ([301, 302, 303].indexOf(details.statusCode) !== -1) {
			try {
				toProxy = url.parse(details.responseHeadersObject["location"]);
				fromProxy = uri;
			} catch(e) {}
		} else {
			try {
				toProxy = uri;
				fromProxy = url.parse(details.requestHeadersObject["referer"]);
			} catch (e) {}
		}
		
		if (fromProxy && toProxy && fromProxy.hostname == toProxy.hostname && fromProxy.port != toProxy.port
				&& (! toProxy.port || [80, 443].indexOf(toProxy.port) == -1)) {
			for (var proxy of Zotero.Proxies.proxies) {
				if (proxy.regexp) {
					var m = proxy.regexp.exec(fromProxy.href);
					if (m) break;
				}
			}
			if (m) {
				// Make sure caught proxy is not multi-host and that we don't have this new proxy already
				if (Zotero.Proxies.proxyToProper(toProxy.href, true)) return false;
				
				Zotero.debug("Proxies: Identified putative port-by-port EZProxy link from "+fromProxy.host+" to "+toProxy.host);

				// Figure out real URL by failing to send cookies, so we get back to the login page
				new Zotero.Proxies.Detectors.EZProxy.Listener(toProxy.href);
				let xhr = new XMLHttpRequest;
				xhr.open('GET', toProxy.href, true);
				xhr.send();
				
				return false;
			}
		}
	}
	
	// Now try to catch redirects
	try {
		var proxiedURI = url.parse(details.responseHeadersObject["location"]);
	} catch (e) {
		return false;
	}
	if (!proxiedURI.protocol || details.statusCode != 302 || details.responseHeadersObject["server"] != "EZproxy") return false;
	return Zotero.Proxies.Detectors.EZProxy.learn(url.parse(details.url), proxiedURI);
}

/**
 * Learn about a mapping from an EZProxy to a normal proxy
 * @param {nsIURI} loginURI The URL of the login page
 * @param {nsIURI} proxiedURI The URI of the page
 * @return {Zotero.Proxy | false}
 */
Zotero.Proxies.Detectors.EZProxy.learn = function(loginURI, proxiedURI) {
	// look for query
	var m =  /(url|qurl)=([^&]+)/i.exec(loginURI.query);
	if (!m) return false;
	
	// Ignore if we already know about it
	if (Zotero.Proxies.proxyToProper(proxiedURI.href, true)) return false;
	
	// Found URL
	var properURL = (m[1].toLowerCase() == "qurl" ? decodeURI(m[2]) : m[2]);
	var properURI = url.parse(properURL);
	if (!properURI.protocol) {
		return false;
	}
	
	let loginHostIsProxiedHost = loginURI.hostname == proxiedURI.hostname;
	let proxiedAndLoginPortsDiffer = proxiedURI.port != loginURI.port;
	
	let proxiedHostContainsProperHost = (proxiedURI.host.indexOf(properURI.hostname) != -1);
	// Account for dashed out URLs in https wildcard scenario
	if (!proxiedHostContainsProperHost && properURI.protocol == 'https:') {
		if (properURI.hostname != properURI.hostname.replace(/\./g, '-')) {
			properURI.hostname = properURI.hostname.replace(/\./g, '-');
			var dotsToHyphens = true;
		}
		proxiedHostContainsProperHost = (proxiedURI.host.indexOf(properURI.hostname) != -1);
	}

	
	var proxy = false;
	if (loginHostIsProxiedHost && proxiedAndLoginPortsDiffer) {
		// Proxy by port
		proxy = new Zotero.Proxy({
			autoAssociate: false,
			scheme: proxiedURI.protocol+"//"+proxiedURI.host+"/%p",
			hosts: [properURI.host],
			dotsToHyphens: !!dotsToHyphens
		});
	} else if (!loginHostIsProxiedHost && proxiedHostContainsProperHost) {
		// Proxy by host
		proxy = new Zotero.Proxy({
			autoAssociate: true,
			scheme: proxiedURI.protocol+"//"+proxiedURI.host.replace(properURI.hostname, "%h")+"/%p",
			hosts: [properURI.host],
			dotsToHyphens: !!dotsToHyphens
		});
	}
	return proxy;
}

/**
 * @class Observer to clear cookies on an HTTP request, then remove itself
 */
Zotero.Proxies.Detectors.EZProxy.Listener = function(requestURL) {
	this.requestURL = requestURL;
	this.listeners = {
		beforeSendHeaders: this.onBeforeSendHeaders.bind(this),
		headersReceived: this.onHeadersReceived.bind(this),
		errorOccurred: this.deregister.bind(this)
	};
	Zotero.Proxies._ignoreURLs.add(requestURL);
	for (let listenerType in this.listeners) {
		Zotero.WebRequestIntercept.addListener(listenerType, this.listeners[listenerType]);
	}
};
Zotero.Proxies.Detectors.EZProxy.Listener.prototype.deregister = function(details) {
	if (details.url.indexOf(this.requestURL) == -1) return;
	Zotero.Proxies._ignoreURLs.delete(this.requestURL);
	for (let listenerType in this.listeners) {
		Zotero.WebRequestIntercept.removeListener(listenerType, this.listeners[listenerType]);
	}
};
Zotero.Proxies.Detectors.EZProxy.Listener.prototype.onBeforeSendHeaders = function(details) {
	if (details.url.indexOf(this.requestURL) == -1) return;
	return {requestHeaders: details.requestHeaders.filter((header) => header.name.toLowerCase() != 'cookie')}
};
Zotero.Proxies.Detectors.EZProxy.Listener.prototype.onHeadersReceived = function(details) {
	if (details.url.indexOf(this.requestURL) == -1) return;
	this.deregister(details);
	// Make sure this is a redirect involving an EZProxy
	try {
		var loginURI = url.parse(details.responseHeadersObject["location"]);
	} catch (e) {
		return;
	}
	if (!loginURI.host || details.statusCode != 302 || details.responseHeadersObject["server"] != "EZproxy") return false;

	var proxy = Zotero.Proxies.Detectors.EZProxy.learn(url.parse(loginURI), url.parse(details.url));
	if (proxy) {
		Zotero.debug("Proxies: Proxy-by-port EZProxy "+aSubject.URI.hostPort+" corresponds to "+proxy.hosts[0]);
		Zotero.Proxies.save(proxy);
	}
	return {cancel: true};
};

/**
 * Detector for Juniper Networks WebVPN
 * @param {Object} details
 * @type Boolean|Zotero.Proxy
 */
Zotero.Proxies.Detectors.Juniper = function(details) {
	const juniperRe = /^(https?:\/\/[^\/:]+(?:\:[0-9]+)?)\/(.*),DanaInfo=([^+,]*)([^+]*)(?:\+(.*))?$/;
	var m = juniperRe.exec(details.url);
	if (!m) return false;
	
	return new Zotero.Proxy({
		autoAssociate: true,
		scheme: m[1]+"/%d"+",DanaInfo=%h%a+%f",
		hosts: [m[3]]
	});
}


Zotero.Proxies.DNS = new function() {
	this.getHostnames = function() {
		return Zotero.Connector.callMethod('getClientHostnames', null).then(function(hostnames) {
			Zotero.Proxies._clientHostnames = hostnames;
			return hostnames;
		});
	}
};

})();
