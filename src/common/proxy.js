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

const OPENATHENS_REDIRECT_INTERVAL = 12 * 60 * 60 * 1000;

/**
 * A singleton to handle URL rewriting proxies
 * @namespace
 * @property transparent {Boolean} Whether transparent proxy functionality is enabled
 * @property proxies {Zotero.Proxy[]} All loaded proxies
 * @property hosts {Zotero.Proxy{}} Object mapping hosts to proxies
 */
Zotero.Proxies = new function() {
	this.REDIRECT_LOOP_TIMEOUT = 3600e3;
	this.REDIRECT_LOOP_MONITOR_COUNT = 4;
	this.REDIRECT_LOOP_MONITOR_TIMEOUT = 5e3;
	this.openAthensHostRedirectTime = {};
	/**
	 * Initializes the proxy settings
	 * @returns Promise{boolean} proxy enabled/disabled status
	 */
	this.init = async function() {
		if (Zotero.isSafari) return;
		this.transparent = false;
		this.proxies = [];
		this.hosts = {};
		this._redirectedTabIDs = {};
		this._loopPreventionTimestamp = Zotero.Prefs.get('proxies.loopPreventionTimestamp');

		this.openAthensHostRedirectTime =
			await Zotero.Utilities.Connector.createMV3PersistentObject('openAthensRedirectTime');
		
		this.loadPrefs();
		
		Zotero.Proxies.lastIPCheck = 0;
		Zotero.Proxies.disabledByDomain = false;
		
		Zotero.Proxies.proxies = Zotero.Prefs.get('proxies.proxies').map(function(proxy) {
			proxy = Zotero.Proxies._createProxyInstance(proxy);
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
		Zotero.Proxies.autoRecognize = Zotero.isBrowserExt
			&& Zotero.Proxies.transparent && Zotero.Prefs.get("proxies.autoRecognize");
		
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
		if (Zotero.isBrowserExt) {
			Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.Proxies.onHeadersReceived);
			browser.webNavigation.onBeforeNavigate.addListener(Zotero.Proxies.onBeforeNavigate)
			browser.webNavigation.onCommitted.addListener(Zotero.Proxies.checkForRedirectLoop)
		} else {
			safari.application.addEventListener('beforeNavigate', this.onBeforeNavigateSafari, false);
		}
	};
	
	
	this.disable = function() {
		if (Zotero.isBrowserExt) {
			Zotero.WebRequestIntercept.removeListener('headersReceived', Zotero.Proxies.onHeadersReceived);
			browser.webNavigation.onBeforeNavigate.removeListener(Zotero.Proxies.onBeforeNavigate)
			browser.webNavigation.onCommitted.removeListener(Zotero.Proxies.checkForRedirectLoop)
		} else {
			safari.application.removeEventListener('beforeNavigate', this.onBeforeNavigateSafari, false);
		}
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
				if (proxy.scheme.includes('://')) {
					proxy.scheme = proxy.scheme.substr(proxy.scheme.indexOf('://')+3);
				}
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
					Zotero.Proxies.save(Zotero.Proxies._createProxyInstance(proxy));
				}
			}

			Zotero.Prefs.set('proxies.clientChecked', true);
			return result;
		}, () => 0);
	}

	/**
	 * Called by the `safari.application` event listener
	 * @param e {Event}
	 */
	this.onBeforeNavigateSafari = function(e) {
		// Safari calls onBeforeNavigate from default tab while typing the url
		// so if you type a proxied url you immediately get redirected without pressing enter.
		// Not cool.
		if (!e.target.url) return;
		let details = {url: e.url || '', originUrl: e.target.url, frameId: 0,
			requestHeadersObject: {}, tabId: e.target};

		Zotero.Proxies.updateDisabledByDomain();
		if (Zotero.Proxies.disabledByDomain) return;
		let redirect;
		for (let proxy of Zotero.Proxies.proxies) {
			if (typeof proxy.maybeRedirect === 'function') {
				redirect = proxy.maybeRedirect(details);
				if (redirect) break;
			}
		}
		if (redirect) {
			e.target.url = redirect.redirectUrl;
		}
	};

	/**
	 * Called from the Safari global page
	 * @param tab
	 */
	this.onPageLoadSafari = function(tab) {
		let details = {url: tab.url, frameId: 0, tabId: tab, statusCode: 200};
	
		for (let proxy of Zotero.Proxies.proxies) {
			if (typeof proxy.maybeAddHost === 'function') {
				proxy.maybeAddHost(details);
			}
		}
	};

	/**
	 * Called on webRequest headersReceived. Used to detect new proxies. Chrome and possibly
	 * other browserExt browsers call this when typing in the url bar, performing a prefetch
	 * for a faster page load, so we cannot issue a redirect here, as the prefetch may not get
	 * committed as page navigation.
	 * @param details
	 */
	this.onHeadersReceived = (details) => {
		if (Zotero.Proxies.autoRecognize) {
			Zotero.Proxies._recognizeProxy(details);
		}
	}

	/**
	 * Called on webNavigation onCommited. Used to redirect existing hosts and detect new hosts for
	 * existing proxies. We cannot use this to detect new proxies because we need
	 * response headers which are only available via webRequest APIs.
	 *
	 * @param {Object} details - webRequest details object
	 */
	this.onBeforeNavigate = (details) => {
		if (details.statusCode >= 400 || details.frameId != 0) {
			return;
		}

		Zotero.Proxies.updateDisabledByDomain();
		if (Zotero.Proxies.disabledByDomain) return;
		
		for (let proxy of Zotero.Proxies.proxies) {
			proxy.maybeAddHost(details);
		}
		
		if (Zotero.Proxies.isPreventingRedirectLoops()) return;
		
		let redirect;
		let redirectProxy;
		for (redirectProxy of Zotero.Proxies.proxies) {
			if (typeof redirectProxy.maybeRedirect === 'function') {
				redirect = redirectProxy.maybeRedirect(details);
				if (redirect) break;
			}
		}
		if (!redirect) return;
		// We will track this tab in case it causes a redirect loop
		if (redirectProxy.type !== 'openathens') {
			// OpenAthens always redirects back to original host, but that's handled by
			// proxy logic
			this._redirectedTabIDs[details.tabId] = {
				host: new URL(details.url).host,
				count: this.REDIRECT_LOOP_MONITOR_COUNT,
				timeout: Date.now() + this.REDIRECT_LOOP_MONITOR_TIMEOUT
			};
		}
		browser.tabs.update(details.tabId, {url: redirect.redirectUrl});
	};
	
	this.toggleRedirectLoopPrevention = function(value) {
		if (typeof value === "undefined") {
			Zotero.debug('Called Proxies._toggleRedirectLoopPrevention() without an argument');
		}
		Zotero.debug(`Proxies: ${value ? "Enabling" : "Disabling"} loop prevention`)
		this._loopPreventionTimestamp = value ? (Date.now() + this.REDIRECT_LOOP_TIMEOUT) : 0;
		Zotero.Prefs.set('proxies.loopPreventionTimestamp', this._loopPreventionTimestamp)
	}
	
	this.isPreventingRedirectLoops = function() {
		return this._loopPreventionTimestamp > Date.now();
	}
	
	this.checkForRedirectLoop = (details) => {
		if (details.frameId != 0) return;
		let redirectedTab = this._redirectedTabIDs[details.tabId];
		if (redirectedTab) {
			if (details.transitionQualifiers?.includes('forward_back') || details.transitionQualifiers?.includes('from_address_bar') ) {
				// History navigation (back button) may cause false-positives here, so we stop monitoring
				delete this._redirectedTabIDs[details.tabId];
			}
			else if (redirectedTab.host == new URL(details.url).host) {
				// Rerouted back to the original host after a redirect, so likely there is a redirect loop
				this.toggleRedirectLoopPrevention(true);
				delete this._redirectedTabIDs[details.tabId];
				return true;
			}
			else if (redirectedTab.count-- <= 0 || redirectedTab.timeout <= Date.now()) {
				// Did not detect a redirect loop on this host
				delete this._redirectedTabIDs[details.tabId];
			}
		}
		return false;
	}
	
	this.notifyNewProxy = async function(proxy, tabId) {
		let instance = Zotero.Proxies._createProxyInstance(proxy);
		let response = await Zotero.Proxies.showNotification(
			'New Zotero Proxy',
			`Zotero detected that you are accessing ${proxy.hosts[proxy.hosts.length-1]} through a proxy. Would you like to automatically redirect future requests to ${proxy.hosts[proxy.hosts.length-1]} through ${instance.toDisplayName()}?`,
			['✕', 'Proxy Settings', 'Accept'],
			tabId
		);
		if (response == 2) {
			let result = await Zotero.Messaging.sendMessage('confirm', {
				title: 'Only add proxies linked from your library, school, or corporate website',
				message: 'Adding other proxies allows malicious sites to masquerade as sites you trust.<br/></br>'
				+ 'Adding this proxy will allow Zotero to recognize items from proxied pages and will automatically '
				+ `redirect future requests to ${proxy.hosts[proxy.hosts.length - 1]} through ${instance.toDisplayName()}.`,
				button1Text: 'Add Proxy',
				button2Text: 'Cancel'
			}, tabId);
			if (result.button == 1) {
				return Zotero.Proxies.save(proxy);
			}
		}
		if (response == 1) {
			Zotero.Connector_Browser.openPreferences("proxies");
			// This is a bit of a hack.
			// Technically the notification can take an onClick handler, but we cannot
			// pass functions from background to content scripts easily
			// so to "keep the notification open" we display it again
			return this.notifyNewProxy(proxy, tabId);
		}
	}
	
	this._recognizeProxy = function (details) {
		// perform in the next event loop step to reduce impact of header processing in a blocking call
		setTimeout(() => {
			var proxy = false;
			for (var detectorName in Zotero.Proxies.Detectors) {
				var detector = Zotero.Proxies.Detectors[detectorName];
				try {
					proxy = detector(details);
				} catch(e) {
					Zotero.logError(e);
				}
				
				if (!proxy) continue;
				let requestURI = new URL(details.url);
				Zotero.debug("Proxies: Detected "+detectorName+" proxy "+proxy.toProperScheme+" for "+requestURI.host);
				
				let invalid = (typeof proxy.validate === 'function') ? proxy.validate() : false;
				if (invalid) continue;

				this.notifyNewProxy(proxy.toJSON ? proxy.toJSON() : proxy, details.tabId);
				
				break;
			}
		});
	};

	this.validate = function(proxy) {
		let instance = Zotero.Proxies._createProxyInstance(proxy);
		return instance.validate();
	}

	/**
	 * Update proxy and host maps and store proxy settings in storage
	 */
	this.save = function(proxy) {
		let instance = Zotero.Proxies._createProxyInstance(proxy);

		instance.toProxyScheme = (instance.toProxyScheme || "").trim();
		instance.toProperScheme = (instance.toProperScheme || instance.scheme || "").trim();
		instance.hosts = instance.hosts.map(host => host.trim()).filter(host => host);
		
		// If no %h or %u present, then only a single host can be supported and we drop all but the first one.
		// OpenAthens proxies always support multiple hosts via the redirector.
		let multiHost = (instance.type === 'openathens')
			|| (instance.toProperScheme || '').includes('%h')
			|| (instance.toProxyScheme || '').includes('%u');
		if (!multiHost) {
			instance.hosts = instance.hosts.slice(0, 1);
		}
		
		var existingProxyIndex = Zotero.Proxies.proxies.findIndex((p) => p.id == instance.id);
		if (existingProxyIndex == -1) {
			Zotero.Proxies.proxies.push(instance);
		}
		else {
			Zotero.Proxies.proxies[existingProxyIndex] = instance;
		}
		if (!instance.regexp && typeof instance.compileRegexp === 'function') instance.compileRegexp();

		// delete hosts that point to this proxy if they no longer exist
		for (let host in Zotero.Proxies.hosts) {
			if (Zotero.Proxies.hosts[host].id == instance.id && instance.hosts.indexOf(host) == -1) {
				delete Zotero.Proxies.hosts[host];
			}
		}
		
		for (let host of instance.hosts) {
			Zotero.Proxies.hosts[host] = instance;
		}

		Object.assign(proxy, instance.toJSON())
		
		Zotero.Proxies.storeProxies();
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
				toProxyScheme: p.toProxyScheme,
				toProperScheme: p.toProperScheme || p.scheme,
				hosts: p.hosts,
				type: p.type
			};
		});
		
		Zotero.Prefs.set('proxies.proxies', proxies);
	};

	// Create an instance of the correct proxy subtype
	this._createProxyInstance = function(json={}) {
		if (json.type === 'openathens') {
			return new Zotero.Proxy.OpenAthensProxy(json);
		}
		return new Zotero.Proxy(json);
	};

	/**
	 * Returns a page's proper URL from a proxied URL. Uses both transparent and opaque proxies.
	 * @param {String} url
	 * @param {Boolean} onlyReturnIfProxied Controls behavior if the given URL is not proxied. If
	 *	it is false or unspecified, unproxied URLs are returned verbatim. If it is true, the
	 *	function will return "false" if the given URL is unproxied.
	 * @type String
	 */
	this.proxyToProper = function(url, onlyReturnIfProxied) {
		for (var proxy of Zotero.Proxies.proxies) {
			if (proxy.regexp) {
				var m = proxy.regexp.exec(url);
				if (m) {
					var toProper = proxy.toProper(m);
					Zotero.debug("Proxies.proxyToProper: "+url+" to "+toProper);
					return toProper;
				}
			}
		}
		return (onlyReturnIfProxied ? false : url);
	};

	/**
	 * Returns a page's proxied URL from the proper URL. Uses only transparent proxies.
	 * @param {String} url
	 * @param {Boolean} onlyReturnIfProxied Controls behavior if the given URL is not proxied. If
	 *	it is false or unspecified, unproxied URLs are returned verbatim. If it is true, the
	 *	function will return "false" if the given URL is unproxied.
	 * @type String
	 */
	this.properToProxy = function(url, onlyReturnIfProxied) {
		var uri = new URL(url);
		if (Zotero.Proxies.hosts[uri.host]) {
			var toProxy = Zotero.Proxies.hosts[uri.host].toProxy(uri);
			Zotero.debug("Proxies.properToProxy: "+url+" to "+toProxy);
			return toProxy;
		}
		return (onlyReturnIfProxied ? false : url);
	};

	/**
	 * Check the url for potential proxies and deproxify, providing a schema to build
	 * a proxy object.
	 * 
	 * @param url
	 * @returns {Object} Unproxied url to proxy object
	 */
	this.getPotentialProxies = function(url) {
		// make sure url has a trailing slash
		url = new URL(url).href;
		var urlToProxy = {};
		// If it's a known proxied URL just return it
		if (Zotero.Proxies.transparent) {
			for (var proxy of Zotero.Proxies.proxies) {
				if (proxy.regexp) {
					var m = proxy.regexp.exec(url);
					if (m) {
						let proper = proxy.toProper(m);
						urlToProxy[proper] = proxy.toJSON();
						return urlToProxy;
					}
				}
			}
		}
		urlToProxy[url] = null;
		
		// if there is a subdomain that is also a TLD, also test against URI with the domain
		// dropped after the TLD
		// (i.e., www.nature.com.mutex.gmu.edu => www.nature.com)
		var m = /^(https?:\/\/)([^\/]+)/i.exec(url);
		if (m) {
			// First, drop the 0- if it exists (this is an III invention)
			var host = m[2];
			if (host.substr(0, 2) === "0-") host = host.substr(2);
			var hostnameParts = [host.split(".")];
			if (m[1] == 'https://') {
				// try replacing hyphens with dots for https protocol
				// to account for EZProxy HttpsHypens mode
				hostnameParts.push(host.split('.'));
				hostnameParts[1].splice(0, 1, ...(hostnameParts[1][0].replace(/-/g, '.').split('.')));
			}
			
			for (let i=0; i < hostnameParts.length; i++) {
				let parts = hostnameParts[i];
				// skip the lowest level subdomain, domain and TLD
				for (let j=1; j<parts.length-2; j++) {
					// if a part matches a TLD, everything up to it is probably the true URL
					if (TLDS[parts[j].toLowerCase()]) {
						var properHost = parts.slice(0, j+1).join(".");
						// protocol + properHost + /path
						var properURL = m[1]+properHost+url.substr(m[0].length);
						// Accommodating URLS like https://kns-cnki-net-443.webvpn.fafu.edu.cn:880/
						// where the TLD part j==3, but j+1 is not the start of the proxy host
						// See https://forums.zotero.org/discussion/comment/407995/#Comment_407995
						let skippedParts = '';
						while (parts[j+1].match(/^[0-9]*$/)) {
							skippedParts += '-' + parts[j+1];
							j++;
						}
						var proxyHost = parts.slice(j+1).join('.');
						let scheme = `%h${skippedParts}.${proxyHost}/%p`
						// Backwards compatibility
						urlToProxy[properURL] = {toProperScheme: scheme, scheme};
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
	this._isBlacklisted = function(host) {
		/**
		 * Regular expression patterns of hosts never to proxy
		 * @const
		 */
		const hostBlacklist = [
			/edu$/,
			/doi\.org$/,
			/google\.com$/,
			/wikipedia\.org$/,
			/^[^.]*$/,
			/doubleclick\.net$/,
			/^eutils.ncbi.nlm.nih.gov$/
		];
		/**
		 * Regular expression patterns of hosts that should always be proxied, regardless of whether
		 * they're on the blacklist
		 * @const
		 */
		const hostWhitelist = [
			/^scholar\.google\.com$/,
			/^muse\.jhu\.edu$/,
			/^(www\.)?journals\.uchicago\.edu$/
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
	 * @param {Number} tabId
	 * @param {Number} timeout
	 */
	this.showNotification = function(title, message, actions, tabId, timeout) {
		// browser.notifications.create({
		// 	type: 'basic',
		// 	title,
		// 	message,
		// 	iconUrl: 'Icon-128.png'
		// });
		Zotero.debug(`Proxy notification: ${message}`);
		actions = actions && actions.map((a) => {return {title: a, dismiss: true}});
		return Zotero.Connector_Browser.notify(message, actions, timeout, tabId);
	}

};

/**
 * Regexps to match the URL contents corresponding to proxy scheme parameters
 * @const
 */
const Zotero_Proxy_schemeParameters = {
	"%p": "(.*?)",	// path
	"%h": "([a-zA-Z0-9]+[.\\-][a-zA-Z0-9.\\-]+)",	// hostname
	"%u": "(.*?)",	// url
};

/**
 * Regexps to match proxy scheme parameters in the proxy scheme URL
 * @const
 */
const Zotero_Proxy_schemeParameterRegexps = {
	"%p": /([^%])%p/,
	"%h": /([^%])%h/,
	"%u": /([^%])%u/,
};


/**
 * Creates a Zotero.Proxy object from a DB row
 *
 * @constructor
 * @class A model for a http proxy server
 */
Zotero.Proxy = class {
	constructor(json={}) {
		this.id = json.id || Date.now();
		// Whether hosts should be automatically associated with this proxy
		this.autoAssociate = json.autoAssociate !== false;
		this.toProperScheme = json.toProperScheme || json.scheme;
		// Proxy login URL with %u where the URL to-be-proxied should be inserted
		this.toProxyScheme = json.toProxyScheme;
		// MV3 proxy toJSON needs this
		this.scheme = this.toProperScheme;
		this.hosts = json.hosts || [];
		if (this.toProperScheme) {
			this.compileRegexp();
		}
	}

	validate() {
		for (let host of this.hosts) {
			host = host.trim();
			var oldProxy = Zotero.Proxies.hosts[host];
			if (oldProxy && oldProxy.id != this.id) {
				return ["proxy_validate_hostProxyExists", host];
			}
		}

		if (this.toProxyScheme) {
			let scheme = this.toProxyScheme.trim();
			for (let p of Zotero.Proxies.proxies) {
				if (!p || p.id == this.id) continue;
				if ((p.toProxyScheme || '').trim() && (p.toProxyScheme || '').trim() == scheme) {
					return ["proxy_validate_schemeDuplicate"];
				}
			}
		}
		
		if (!this.toProperScheme) return false;

		// Unmodified
		if (this.toProperScheme == '%h.example.com/%p' || this.toProxyScheme == 'proxy.example.com/login?qurl=%s') {
			return ["proxy_validate_schemeUnmodified"];
		}

		if (
			// Scheme very short
			this.toProperScheme.length <= "%h.-.--/%p".length 
				// Host is at the end of the domain part of the scheme
				|| this.toProperScheme.includes('%h/')
				// No-op proxy schemes that don't actually proxy anything (see #492)
				|| this.toProperScheme == '%h/%p'
				|| this.toProperScheme == '%h%p'
		) {
			return ["proxy_validate_schemeInvalid"];
		}

		if (!Zotero_Proxy_schemeParameterRegexps["%p"].test(this.toProperScheme)) {
			return ["proxy_validate_schemeNoPath"];
		}
		return false;
	}

	/**
	 * Compiles the regular expression against which we match URLs to determine if this proxy is in use
	 * and saves it in this.regexp
	 */
	compileRegexp() {
		var indices = this.indices = {};
		this.parameters = [];
		for (var param in Zotero_Proxy_schemeParameters) {
			var index = this.toProperScheme.indexOf(param);

			// avoid escaped matches
			while (this.toProperScheme[index-1] && (this.toProperScheme[index-1] == "%")) {
				this.toProperScheme = this.toProperScheme.substr(0, index-1)+this.toProperScheme.substr(index);
				index = this.toProperScheme.indexOf(param, index+1);
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
		var re;
		if (this.toProperScheme.includes('://')) {
			re = "^"+Zotero.Utilities.quotemeta(this.toProperScheme)+"$";
		} else {
			re = "^https?"+Zotero.Utilities.quotemeta('://'+this.toProperScheme)+"$";
		}
		for(var i=this.parameters.length-1; i>=0; i--) {
			var param = this.parameters[i];
			re = re.replace(Zotero_Proxy_schemeParameterRegexps[param], "$1"+Zotero_Proxy_schemeParameters[param]);
		}

		this.regexp = new RegExp(re);
	}


	/**
	 * Convert the proxy to JSON compatible object
	 * @returns {Object}
	 */
	toJSON() {
		return {
			id: this.id,
			autoAssociate: this.autoAssociate,
			toProxyScheme: this.toProxyScheme,
			toProperScheme: this.toProperScheme,
			hosts: this.hosts,
			type: this.type,
		}
	}

	/**
	 * Converts a proxied URL to an unproxied URL using this proxy
	 *
	 * @param m {Array|String} Either the match from running this proxy's regexp against a URL,
	 *                         or a URL string to be matched.
	 * @type String
	 */
	toProper(m) {
		if (!this.toProperScheme) return m;
		if (!Array.isArray(m)) {
			// make sure url has a trailing slash
			m = new URL(m).href;
			let match = this.regexp.exec(m);
			if (!match) {
				return m
			} else {
				m = match;
			}
		}
		let hostIdx = this.parameters.indexOf("%h");
		let protocol = m[0].indexOf('https') == 0 ? 'https://' : 'http://';
		if (hostIdx != -1) {
			var properURL = protocol+m[hostIdx+1]+"/";
		} else {
			var properURL = protocol+this.hosts[0]+"/";
		}
		
		// Replace `-` with `.` in https to support EZProxy HttpsHyphens.
		// Potentially troublesome with domains that contain dashes
		if (protocol == "https://" ||
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
	toProxy(uri) {
		if (typeof uri == "string") {
			uri = new URL(uri);
			// If there's no path it is set to null, but we need
			// at least an empty string to avoid doing many checks
			uri.pathname = uri.pathname || '';
		}
		if (this.regexp?.exec(uri.href) || Zotero.Proxies._isBlacklisted(uri.hostname)) {
			return uri.href;
		}
		if (this.toProxyScheme) {
			return this.toProxyScheme.replace('%u', encodeURIComponent(uri.href));
		}
		var proxyURL = this.toProperScheme;

		for(var i=this.parameters.length-1; i>=0; i--) {
			var param = this.parameters[i];
			var value = "";
			if (param == "%h") {
				value = (uri.protocol == 'https:') ? uri.hostname.replace(/\./g, '-') : uri.hostname;
			} else if (param == "%p") {
				value = uri.pathname.substr(1) + uri.search;
			}

			proxyURL = proxyURL.substr(0, this.indices[param])+value+proxyURL.substr(this.indices[param]+2);
		}

		if (proxyURL.includes('://')) {
			return proxyURL;
		}
		return uri.protocol + '//' + proxyURL;
	}

	/**
	 * For URL-rewriting proxies, detect and add host associations when navigating
	 */
	maybeAddHost(details) {
		if (!this.regexp || !this.autoAssociate) return;
		var m = this.regexp.exec(details.url);
		if (!m) return;
		
		let hostParamIndex = this.parameters ? this.parameters.indexOf("%h") : -1;
		if (hostParamIndex === -1) return;
		
		let host = m[hostParamIndex + 1];
		if (!host) return;
		// Unhyphenate host before checking it
		if (!host.includes('.')) {
			host = host.replace(/-/g, '.');
		}

		if (this.hosts.includes(host) || Zotero.Proxies._isBlacklisted(host)) return;

		let otherProxy = Zotero.Proxies.hosts[host];
		let shouldMapHost = !otherProxy;
		if (otherProxy && otherProxy.toProperScheme && otherProxy.toProperScheme.substr(0, 5) != 'https') {
			let httpsOtherProxyScheme = otherProxy.toProperScheme.replace(/^http/, 'https');
			// If other proxy is not https, but this proxy is, we should remap the host to this proxy
			shouldMapHost = httpsOtherProxyScheme == this.toProperScheme
		}
		if (!shouldMapHost) return;

		if (otherProxy) {
			otherProxy.hosts = otherProxy.hosts.filter(h => h != host);
			Zotero.Proxies.save(otherProxy);
		}
		this.hosts.push(host);
		Zotero.Proxies.save(this);
		Zotero.Proxies.toggleRedirectLoopPrevention(false);

		Zotero.Proxies.showNotification(
			'New Zotero Proxy Host',
			`Zotero automatically associated ${host} with a previously defined proxy. Future requests to this site will be redirected through ${this.toDisplayName()}.`,
			["✕", "Proxy Settings", "Don’t Proxy This Site"],
			details.tabId
		)
		.then((response) => {
			if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
			if (response == 2) {
				this.hosts = this.hosts.filter((h) => h != host);
				Zotero.Proxies.save(this);
				return browser.tabs.update(details.tabId, {url: this.toProper(details.url)})
			}
		});
	}

	/**
	 * For URL-rewriting proxies, perform redirect if this proxy is associated with the host
	 */
	maybeRedirect(details) {
		let uri = new URL(details.url);
		if (Zotero.Proxies.hosts[uri.host] !== this) return;
		let proxied = this.toProxy(uri);
		if (!proxied) return;
		// Don't redirect https websites via http proxies
		if (details.url.substr(0, 5) == 'https' && proxied.substr(0, 5) != 'https') return;
		
		var proxiedURI = new URL(proxied);

		// make sure that the top two domains (e.g. gmu.edu in foo.bar.gmu.edu) of the
		// channel and the site to which we're redirecting don't match, to prevent loops.
		const top2DomainsRe = /[^\.]+\.[^\.]+$/;
		let top21 = top2DomainsRe.exec(uri.hostname);
		let top22 = top2DomainsRe.exec(proxiedURI.hostname);
		if (!top21 || !top22 || top21[0] == top22[0]) {
			Zotero.debug("Proxies: skipping redirect; redirect URI and URI have same top 2 domains");
			return;
		}

		// Otherwise, redirect.
		if (Zotero.Proxies.showRedirectNotification && details.frameId === 0) {
			Zotero.Proxies.showNotification(
				'Zotero Proxy Redirection',
				`Zotero automatically redirected your request to ${uri.host} through the proxy at ${this.toDisplayName()}.`,
				['✕', 'Proxy Settings', "Don’t Proxy This Site"],
				details.tabId
			).then((response) => {
				if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
				if (response == 2) {
					this.hosts = this.hosts.filter((h) => h != uri.host);
					Zotero.Proxies.save(this);
					// Don't redirect for hosts associated with frames
					return browser.tabs.update(details.tabId, {url: details.url})
				}
			});
		}

		return {redirectUrl: proxied};
	}

	/**
	 * Generate a display name for the proxy (e.g., "proxy.example.edu (HTTPS)")
	 *
	 * @return {String}
	 */
	toDisplayName() {
		if (this.type === 'openathens') {
			return this.toProxyScheme.match(/\/redirector\/([^?]+)/)[1];
		}
		try {
			var parts = this.toProperScheme.match(/^(?:(?:[^:]+):\/\/)?([^\/]+)/);
			var domain = parts[1]
				// Include part after %h, if it's present
				.split('%h').pop()
				// Trim leading punctuation after the %h
				.match(/\W(.+)/)[1];
			return domain;
		}
		catch (e) {
			Zotero.logError(`Invalid proxy ${this.toProperScheme}: ${e}`);
			return this.toProperScheme;
		}
	}
}

Zotero.Proxy.OpenAthensProxy = class extends Zotero.Proxy {
	constructor(json={}) {
		super(json);
		this.type = 'openathens';
		// Regexp to match the redirect URL and capture the destination to add to hosts
		this.toProxyRegexp = new RegExp(XRegExp.escape(this.toProxyScheme).replace('%u', '([^&]+)'));
	}

	/**
	 * Checks if the url matches the OpenAthens redirector and if so adds the host to this proxy
	 * and disasociates it from any other proxy.
	 * @param {Object} details 
	 * @returns 
	 */
	maybeAddHost(details) {
		if (!this.toProxyScheme || !this.autoAssociate) return;
		let m = this.toProxyRegexp.exec(details.url);
		if (!m) return;
		
		let redirectURL = decodeURIComponent(m[1]);
		let uri = new URL(redirectURL);
		let host = uri.host;
		if (!host || this.hosts.includes(host) || Zotero.Proxies._isBlacklisted(host)) return;

		let otherProxy = Zotero.Proxies.hosts[host];
		if (otherProxy) {
			// If we are redirecting to an OpenAthens host, we disassociate it from any other proxy
			otherProxy.hosts = otherProxy.hosts.filter((h) => h != host);
			Zotero.Proxies.save(otherProxy);
		}
		this.hosts.push(host);
		Zotero.Proxies.save(this);
		Zotero.Proxies.toggleRedirectLoopPrevention(false);

		Zotero.Proxies.showNotification(
			'New Zotero Proxy Host',
			`Zotero automatically associated ${host} with a previously defined proxy. Future requests to this site will be redirected through ${this.toDisplayName()}.`,
			["✕", "Proxy Settings", "Don’t Proxy This Site"],
			details.tabId
		)
		.then((response) => {
			if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
			if (response == 2) {
				this.hosts = this.hosts.filter((h) => h != host);
				Zotero.Proxies.save(this);
			}
		});
	}

	maybeRedirect(details) {
		let uri = new URL(details.url);
		if (Zotero.Proxies.hosts[uri.host] !== this) return;
		// Redirect via OpenAthens hosts every OPENATHENS_REDIRECT_INTERVAL, to make sure we are still
		// authenticated with the provider, since we don't have a good way to check for that.
		let last = Zotero.Proxies.openAthensHostRedirectTime[uri.host] || 0;
		if (Date.now() - last < OPENATHENS_REDIRECT_INTERVAL) return;
		
		Zotero.Proxies.openAthensHostRedirectTime[uri.host] = Date.now();

		if (Zotero.Proxies.showRedirectNotification && details.frameId === 0) {
			Zotero.Proxies.showNotification(
				'Zotero Proxy Redirection',
				`Zotero automatically redirected your request to ${uri.host} through the proxy at ${this.toDisplayName()}.`,
				['✕', 'Proxy Settings', "Don’t Proxy This Site"],
				details.tabId
			).then((response) => {
				if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
				if (response == 2) {
					this.hosts = this.hosts.filter((h) => h != uri.host);
					Zotero.Proxies.save(this);
				}
			});
		}
		return {redirectUrl: this.toProxy(details.url)};
	}
}

/**
 * Detectors for various proxy systems
 * @namespace
 */
Zotero.Proxies.Detectors = {};

/**
 * Detector for EZProxy
 * @param {Object} details
 * @type Boolean|Zotero.Proxy
 */
Zotero.Proxies.Detectors.EZProxy = function(details) {
	if (details.responseHeadersObject["server"] != "EZproxy") return false;
	// look for query
	let loginURI = new URL(details.url);
	var m =  /(url|qurl)=([^&]+)/i.exec(loginURI.search);
	if (loginURI.pathname !== "/login" || !m) return false;
	
	// Found URL
	var properURL = (m[1].toLowerCase() == "qurl" ? decodeURIComponent(m[2]) : m[2]);
	try {
		var properURI = new URL(properURL);
	}
	catch (e) {
		return false;
	}

	let proxiedURL = details.responseHeadersObject['location'];
	for (let proxy of Zotero.Proxies.proxies) {
		if (proxy.toProxyScheme) {
			let proxyURI = new URL(proxy.toProxyScheme);
			if (loginURI.origin == proxyURI.origin) {
				// already recognized
				return false;
			}
		}
		else if (proxiedURL && proxy.regexp.test(proxiedURL)) {
			// already recognized but we should add a toProxyScheme property
			proxy.toProxyScheme = `${loginURI.origin}${loginURI.pathname}?qurl=%u`;
			Zotero.Proxies.save(proxy)
			return false;
		}
	}
	
	if (proxiedURL) {
		let proxiedURI = new URL(proxiedURL);
		let redirectingToProxiedHost = (proxiedURI.host.indexOf(properURI.host) != -1);
		// Account for dashed out URLs in https wildcard scenario
		if (!redirectingToProxiedHost && properURI.protocol == 'https:') {
			if (properURI.host != properURI.host.replace(/\./g, '-')) {
				properURI.host = properURI.host.replace(/\./g, '-');
			}
			redirectingToProxiedHost = (proxiedURI.host.indexOf(properURI.host) != -1);
		}
		if (redirectingToProxiedHost && !Zotero.Proxies.proxyToProper(proxiedURL, true)) {
			// Proxy by host
			return new Zotero.Proxy({
				autoAssociate: true,
				toProperScheme: proxiedURI.host.replace(properURI.host, "%h")+"/%p",
				toProxyScheme: `${loginURI.origin}${loginURI.pathname}?qurl=%u`,
				hosts: [properURI.host.replace(/-/g, '.')]
			});
		}
	}
	new Zotero.Proxies.Detectors.EZProxy.Listener(details, properURL, `${loginURI.origin}${loginURI.pathname}?qurl=%u`);
}

Zotero.Proxies.Detectors.EZProxy.listeners = new Set();
/**
 * Web request listener that checks if we eventually get redirected to the site via a proxy
 */
Zotero.Proxies.Detectors.EZProxy.Listener = function(details, properURL, toProxy) {
	// Don't create multiple listeners on the same url
	if (Zotero.Proxies.Detectors.EZProxy.listeners.has(details.tabId)) return;
	Zotero.Proxies.Detectors.EZProxy.listeners.add(details.tabId)
	this.tabId = details.tabId;
	this.properURI = new URL(properURL);
	this.toProxy = toProxy;
	// The number of navigations/redirects we'll sniff on this tab before giving up
	this.sniffingLimit = 20;
	this.listeners = {
		headersReceived: this.onHeadersReceived.bind(this),
	};
	for (let listenerType in this.listeners) {
		Zotero.WebRequestIntercept.addListener(listenerType, this.listeners[listenerType]);
	}
};
Zotero.Proxies.Detectors.EZProxy.Listener.prototype.deregister = function() {
	for (let listenerType in this.listeners) {
		Zotero.WebRequestIntercept.removeListener(listenerType, this.listeners[listenerType]);
	}
	Zotero.Proxies.Detectors.EZProxy.listeners.delete(this.tabId)
};
Zotero.Proxies.Detectors.EZProxy.Listener.prototype.onHeadersReceived = function(details) {
	if (details.tabId !== this.tabId || details.frameId !== 0) return;
	if (this.sniffingLimit <= 0) {
		this.deregister();
	}
	this.sniffingLimit--;
	
	let proxiedURI = new URL(details.url);
	let isProxiedHost = (proxiedURI.host.indexOf(this.properURI.host) != -1);
	// Account for dashed out URLs in https wildcard scenario
	if (!isProxiedHost && this.properURI.protocol == 'https:') {
		if (this.properURI.host != this.properURI.host.replace(/\./g, '-')) {
			this.properURI.host = this.properURI.host.replace(/\./g, '-');
		}
		isProxiedHost = (proxiedURI.host.indexOf(this.properURI.host) != -1);
	}
	if (isProxiedHost) {
		let isExisting;
		for (let proxy of Zotero.Proxies.proxies) {
			if (proxy.regexp && proxy.regexp.test(details.url)) {
				isExisting = true;
				if (!proxy.toProxyScheme) {
					// Add a proxyScheme if not present
					proxy.toProxyScheme = this.toProxy;
					Zotero.Proxies.save(proxy)
				}
			}
		}
		if (!isExisting) {
			let proxy = new Zotero.Proxy({
				autoAssociate: true,
				toProperScheme: proxiedURI.host.replace(this.properURI.host, "%h")+"/%p",
				toProxyScheme: this.toProxy,
				hosts: [this.properURI.host.replace(/-/g, '.')]
			});
			if (proxy.validate()) {
				Zotero.Proxies.notifyNewProxy(proxy.toJSON(), details.tabId)
			}
		}
		this.deregister();
	}
};

Zotero.Proxies.Detectors.OpenAthens = function(details) {
	var m = /^https?:\/\/go\.openathens\.net\/redirector\/([^?]*)\?url=([^&]+)/i.exec(details.url);
	if (!m) return false;
	
	var name = m[1];
	var properURL = decodeURIComponent(m[2]);
	try {
		var properURI = new URL(properURL);
	}
	catch (e) {
		return false;
	}
	
	var toProxyScheme = `https://go.openathens.net/redirector/${name}?url=%u`;
	
	for (let proxy of Zotero.Proxies.proxies) {
		if (proxy.toProxyScheme == toProxyScheme) {
			// already recognized
			return false;
		}
	}
	
	// Create an OA proxy instance; hosts are added via maybeAddHost when navigating through redirector
	let proxy = new Zotero.Proxy.OpenAthensProxy({
		autoAssociate: true,
		toProxyScheme: toProxyScheme,
		hosts: [properURI.host],
		type: "openathens"
	});
	return proxy;
};

Zotero.Proxies.DNS = new function() {
	this.getHostnames = function() {
		return Zotero.Connector.callMethod('getClientHostnames', null).then(function(hostnames) {
			Zotero.Proxies._clientHostnames = hostnames;
			return hostnames;
		});
	}
};

})();
