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
	/**
	 * Initializes the proxy settings
	 * @returns Promise{boolean} proxy enabled/disabled status
	 */
	this.init = function() {
		if (Zotero.isSafari) return;
		this.transparent = false;
		this.proxies = [];
		this.hosts = {};
		this._redirectedTabIDs = {};
		this._loopPreventionTimestamp = Zotero.Prefs.get('proxies.loopPreventionTimestamp');
		
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
			Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.Proxies.onWebRequest);
			browser.webNavigation.onCommitted.addListener(Zotero.Proxies._checkForRedirectLoop)
		} else {
			safari.application.addEventListener('beforeNavigate', this.onBeforeNavigateSafari, false);
		}
	};
	
	
	this.disable = function() {
		if (Zotero.isBrowserExt) {
			Zotero.WebRequestIntercept.removeListener('headersReceived', Zotero.Proxies.onWebRequest);
			browser.webNavigation.onCommitted.removeListener(Zotero.Proxies._checkForRedirectLoop)
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
					Zotero.Proxies.save(new Zotero.Proxy(proxy));
				}
			}

			Zotero.Prefs.set('proxies.clientChecked', true);
			return result;
		}, () => 0);
	}

	this.onBeforeNavigateSafari = function(e) {
		// Safari calls onBeforeNavigate from default tab while typing the url
		// so if you type a proxied url you immediatelly get redirected without pressing enter.
		// Not cool.
		if (!e.target.url) return;
		let details = {url: e.url || '', originUrl: e.target.url, type: 'main_frame',
			requestHeadersObject: {}, tabId: e.target};

		Zotero.Proxies.updateDisabledByDomain();
		if (Zotero.Proxies.disabledByDomain) return;
		let redirect = Zotero.Proxies._maybeRedirect(details);
		if (redirect) {
			e.target.url = redirect.redirectUrl;
		}
	};
	
	this.onPageLoadSafari = function(tab) {
		let details = {url: tab.url, type: 'main_frame', tabId: tab, statusCode: 200};
	
		Zotero.Proxies._maybeAddHost(details);
	};

	/**
	 * Observe method to capture and redirect page loads if they're going through an existing proxy.
	 *
	 * @param {Object} details - webRequest details object
	 */
	this.onWebRequest = (details, meta) => {
		if (details.statusCode >= 400 || details.frameId != 0) {
			return;
		}

		Zotero.Proxies._checkForRedirectLoop(details);
		
		Zotero.Proxies._maybeAddHost(details);
		
		if (Zotero.Proxies.autoRecognize) {
			Zotero.Proxies._recognizeProxy(details);
		}

		Zotero.Proxies.updateDisabledByDomain();
		if (Zotero.Proxies.disabledByDomain) return;
		
		if (Zotero.Proxies.isPreventingRedirectLoops()) return;
		
		let redirect = Zotero.Proxies._maybeRedirect(details);
		if (redirect) {
			// We will track this tab in case it causes a redirect loop
			this._redirectedTabIDs[details.tabId] = {
				host: new URL(details.url).host,
				count: this.REDIRECT_LOOP_MONITOR_COUNT,
				timeout: Date.now() + this.REDIRECT_LOOP_MONITOR_TIMEOUT
			};
			browser.tabs.update(details.tabId, {url: redirect.redirectUrl});
		}
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
	
	this._checkForRedirectLoop = (details) => {
		if (details.frameId != 0) return;
		let redirectedTab = this._redirectedTabIDs[details.tabId];
		if (redirectedTab) {
			if (details.transitionQualifiers && details.transitionQualifiers.includes('forward_back')) {
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
	
	this._maybeAddHost = function(details) {
		// see if there is a proxy we already know
		var m = false;
		for (var proxy of Zotero.Proxies.proxies) {
			if (proxy.regexp) {
				m = proxy.regexp.exec(details.url);
				if (m) break;
			}
		}
		if (!m) return;
		
		let host = m[proxy.parameters.indexOf("%h")+1];
		// Unhyphenate host before checking it
		//
		// DEBUG: If a site has a valid hyphen in it, we probably won't redirect it properly,
		// because we'll add the host with a dot instead and won't match it when the original
		// unproxied site is loaded with the hyphen.
		if (!host.includes('.')) {
			host = host.replace(/-/g, '.');
		}
		
		let shouldRemapHostToMatchedProxy = false;
		let associatedProxy = Zotero.Proxies.hosts[host];
		if (associatedProxy && associatedProxy.toProperScheme.substr(0, 5) != 'https') {
			let secureAssociatedProxyScheme = associatedProxy.toProperScheme.substr(0, 4) + 's' + associatedProxy.toProperScheme.substr(4);
			// I.e. if we matched a proxy with a scheme like https://%h.proxy.edu/%p
			// (which means that we navigated to https://%h/%p) and the host was previously associated with a
			// proxy with a scheme like http://%h.proxy.edu/%p, we remap this host to be mapped to the
			// https proxy instead
			shouldRemapHostToMatchedProxy = secureAssociatedProxyScheme == proxy.toProperScheme
		}
		// add this host if we know a proxy
		if (proxy.autoAssociate							// if autoAssociate is on
			&& details.statusCode < 300					// and query was successful
			&& (!Zotero.Proxies.hosts[host] || shouldRemapHostToMatchedProxy)		// and host is not saved
			&& proxy.hosts.indexOf(host) === -1
			&& !Zotero.Proxies._isBlacklisted(host)					// and host is not blacklisted
		) {
			if (shouldRemapHostToMatchedProxy) {
				associatedProxy.hosts = associatedProxy.hosts.filter(h => h != host);
				Zotero.Proxies.save(associatedProxy);
			}
			proxy.hosts.push(host);
			Zotero.Proxies.save(proxy);
			Zotero.toggleRedirectLoopPrevention(false);

			_showNotification(
				'New Zotero Proxy Host',
				`Zotero automatically associated ${host} with a previously defined proxy. Future requests to this site will be redirected through ${proxy.toDisplayName()}.`,
				["✕", "Proxy Settings", "Don’t Proxy This Site"],
				details.tabId
			)
			.then(function(response) {
				if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
				if (response == 2) {

					proxy.hosts = proxy.hosts.filter((h) => h != host);
					Zotero.Proxies.save(proxy);
					return browser.tabs.update(details.tabId, {url: proxy.toProper(details.url)})
				}
			});
		}	
	};
	
	this.notifyNewProxy = async function(proxy, tabId) {
		let response = await _showNotification(
			'New Zotero Proxy',
			`Zotero detected that you are accessing ${proxy.hosts[proxy.hosts.length-1]} through a proxy. Would you like to automatically redirect future requests to ${proxy.hosts[proxy.hosts.length-1]} through ${proxy.toDisplayName()}?`,
			['✕', 'Proxy Settings', 'Accept'],
			tabId
		);
		if (response == 2) {
			let result = await Zotero.Messaging.sendMessage('confirm', {
				title: 'Only add proxies linked from your library, school, or corporate website',
				message: 'Adding other proxies allows malicious sites to masquerade as sites you trust.<br/></br>'
				+ 'Adding this proxy will allow Zotero to recognize items from proxied pages and will automatically '
				+ `redirect future requests to ${proxy.hosts[proxy.hosts.length - 1]} through ${proxy.toDisplayName()}.`,
				button1Text: 'Add Proxy',
				button2Text: 'Cancel'
			});
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
				
				this.notifyNewProxy(proxy, details.tabId);
				
				break;
			}
		});
	};

	this._maybeRedirect = function(details) {
		var proxied = Zotero.Proxies.properToProxy(details.url, true);
		if (!proxied
			// Don't redirect https websites via http proxies
			|| details.url.substr(0, 5) == 'https' && proxied.substr(0, 5) != 'https') return;
		
		var proxiedURI = new URL(proxied);
		if (details.requestHeadersObject['referer']) {
			// If the referrer is a proxiable host, we already have access (e.g., we're
			// on-campus) and shouldn't redirect
			if (Zotero.Proxies.properToProxy(details.requestHeadersObject['referer'], true)) {
				Zotero.debug("Proxies: skipping redirect; referrer was proxiable");
				return;
			}
			// If the referrer is the same host as we're about to redirect to, we shouldn't
			// or we risk a loop
			if (new URL(details.requestHeadersObject['referer']).hostname == proxiedURI.hostname) {
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
			if (new URL(details.originUrl).hostname == proxiedURI.hostname) {
				Zotero.debug("Proxies: skipping redirect; redirect URI and original URI have same host");
				return;
			}
		}

		// parse the original request's URL so that we can extract host, etc.
		let uri = new URL(details.url);

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
		if (Zotero.Proxies.showRedirectNotification && details.type === 'main_frame') {
			let proxy = Zotero.Proxies.hosts[uri.host];
			_showNotification(
				'Zotero Proxy Redirection',
				`Zotero automatically redirected your request to ${uri.host} through the proxy at ${proxy.toDisplayName()}.`,
				['✕', 'Proxy Settings', "Don’t Proxy This Site"],
				details.tabId
			).then(function(response) {
				if (response == 1) Zotero.Connector_Browser.openPreferences("proxies");
				if (response == 2) {
					proxy.hosts = proxy.hosts.filter((h) => h != uri.host);
					Zotero.Proxies.save(proxy);
					// Don't redirect for hosts associated with frames
					return browser.tabs.update(details.tabId, {url: details.url})
				}
			});
		}

		return {redirectUrl: proxied};
	}


	/**
	 * Update proxy and host maps and store proxy settings in storage
	 */
	this.save = function(proxy) {
		proxy.toProxyScheme = (proxy.toProxyScheme || "").trim();
		proxy.toProperScheme = (proxy.toProperScheme || proxy.scheme || "").trim();
		proxy.hosts = proxy.hosts.map(host => host.trim()).filter(host => host);
		
		// If empty or default scheme
		var invalid = Zotero.Proxies.validate(proxy);
		if (invalid) {
			Zotero.debug(`Proxy  ${proxy.toProperScheme} : ${proxy.toProxyScheme} invalid with reason ${JSON.stringify(invalid)}`);
			return Zotero.Proxies.remove(proxy);
		}
		
		// If no %h or %u present, then only a single host can be supported and we drop all but the first one.
		let multiHost = proxy.toProperScheme.includes('%h') || proxy.toProperScheme.includes('%u');
		if (!multiHost) {
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
		if (
			// Scheme very short
			proxy.toProperScheme.length <= "%h.-.--/%p".length 
				// Unmodified
				|| proxy.toProperScheme == '%h.example.com/%p'
				|| proxy.toProxyScheme == 'proxy.example.com/login?qurl=%s'
				// Host is at the end of the domain part of the scheme
				|| proxy.toProperScheme.includes('%h/')
		) {
			return ["scheme.invalid"];
		}
		
		for (let p of Zotero.Proxies.proxies) {
			if ((proxy.toProxyScheme == p.toProxyScheme || proxy.toProperScheme == p.toProperScheme) && p.id != proxy.id) {
				return ["scheme.alreadyExists"]
			}
		}
		
		if (!Zotero_Proxy_schemeParameterRegexps["%p"].test(proxy.toProperScheme)) {
			return ["scheme.noPath"];
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
				toProxyScheme: p.toProxyScheme,
				toProperScheme: p.toProperScheme || p.scheme,
				hosts: p.hosts,
			};
		});
		
		Zotero.Prefs.set('proxies.proxies', proxies);
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
						urlToProxy[properURL] = {toProperScheme: scheme, scheme, dotsToHyphens: true};
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
	function _showNotification(title, message, actions, tabId, timeout) {
		// browser.notifications.create({
		// 	type: 'basic',
		// 	title,
		// 	message,
		// 	iconUrl: 'Icon-128.png'
		// });
		Zotero.debug(`NOTIFICATION: ${message}`);
		actions = actions && actions.map((a) => {return {title: a, dismiss: true}});
		return Zotero.Connector_Browser.notify(message, actions, timeout, tabId);
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
	this.autoAssociate = json.autoAssociate == undefined ? true : !!json.autoAssociate;
	this.toProperScheme = json.toProperScheme || json.scheme;
	// Proxy login URL with %u where the URL to-be-proxied should be inserted
	this.toProxyScheme = json.toProxyScheme;
	this.hosts = json.hosts || [];
	this.dotsToHyphens = true;
	if (this.toProperScheme) {
		// Loading from storage or new
		this.compileRegexp();
	}
};

/**
 * Convert the proxy to JSON compatible object
 * @returns {Object}
 */
Zotero.Proxy.prototype.toJSON = function() {
	if (!this.toProperScheme) {
		throw Error('Cannot convert proxy to JSON - no scheme');
	}
	return {id: this.id, dotsToHyphens: true, scheme: this.toProperScheme, toProperScheme: this.toProperScheme, toProxy: this.toProxyScheme};
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
 * Compiles the regular expression against which we match URLs to determine if this proxy is in use
 * and saves it in this.regexp
 */
Zotero.Proxy.prototype.compileRegexp = function() {
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
 * Converts a proxied URL to an unproxied URL using this proxy
 *
 * @param m {Array} The match from running this proxy's regexp against a URL spec
 * @type String
 */
Zotero.Proxy.prototype.toProper = function(m) {
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
Zotero.Proxy.prototype.toProxy = function(uri) {
	if (typeof uri == "string") {
		uri = new URL(uri);
		// If there's no path it is set to null, but we need
		// at least an empty string to avoid doing many checks
		uri.pathname = uri.pathname || '';
	}
	if (this.regexp.exec(uri.href) || Zotero.Proxies._isBlacklisted(uri.hostname)) {
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
			value = uri.pathname.substr(1);
		} else if (param == "%d") {
			value = uri.pathname.substr(0, uri.path.lastIndexOf("/"));
		} else if (param == "%f") {
			value = uri.pathname.substr(uri.path.lastIndexOf("/")+1)
		}

		proxyURL = proxyURL.substr(0, this.indices[param])+value+proxyURL.substr(this.indices[param]+2);
	}

	if (proxyURL.includes('://')) {
		return proxyURL;
	}
	return uri.protocol + '//' + proxyURL;
}

/**
 * Generate a display name for the proxy (e.g., "proxy.example.edu (HTTPS)")
 *
 * @return {String}
 */
Zotero.Proxy.prototype.toDisplayName = function () {
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
			isExisting = proxy.regexp.test(details.url)
			if (isExisting) {
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
			Zotero.Proxies.notifyNewProxy(proxy, details.tabId)
		}
		this.deregister();
	}
};

/**
 * Detector for Juniper Networks WebVPN
 * @param {Object} details
 * @type Boolean|Zotero.Proxy
 */
Zotero.Proxies.Detectors.Juniper = function(details) {
	const juniperRe = /^https?:\/\/([^\/:]+(?:\:[0-9]+)?)\/(.*),DanaInfo=([^+,]*)([^+]*)(?:\+(.*))?$/;
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
