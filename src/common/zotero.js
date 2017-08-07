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

var Zotero = new function() {
	this.version = "5.0";
	this.isConnector = true;
	this.isFx = false;

	// Browser check adopted from:
	// http://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
	// Firefox 1.0+
	this.isFirefox = typeof InstallTrigger !== 'undefined';
	// At least Safari 10+
	this.isSafari = typeof safari !== 'undefined';
	// Internet Explorer 6-11
	this.isIE = /*@cc_on!@*/false || !!document.documentMode;
	// Edge 20+
	this.isEdge = !this.isIE && !!window.StyleMedia;
	// Chrome and Chromium
	this.isChrome = window.navigator.userAgent.indexOf("Chrome") !== -1 || window.navigator.userAgent.indexOf("Chromium") !== -1;
	this.isBrowserExt = this.isFirefox || this.isEdge || this.isChrome;

	if (this.isFirefox) {
		this.browser = "g";
		this.clientName = 'Firefox Connector';
	} else if (this.isSafari) {
		this.browser = "s";
		this.clientName = 'Safari Connector';
	} else if (this.isIE) {
		this.browser = "i";
		this.clientName = 'Internet Explorer';
	} else if (this.isEdge) {
		this.browser = "c";
		this.clientName = 'Edge Connector';
	} else if (this.isChrome) {
		this.browser = "c";
		this.clientName = 'Chrome Connector';
	} else {
		// Assume this is something with no more capabilities than IE
		this.browser = "i";
		this.clientName = window.navigator.appName;
	}
	
	if (this.isBrowserExt) {
		this.version = chrome.runtime.getManifest().version;
	} else if (this.isSafari) {
		this.version = safari.extension.bundleVersion;
	}
	
	// window.Promise and Promise differ (somehow) in Firefox and when certain
	// async promise resolution conditions arise upon calling Zotero.Promise.all().then(result => )
	// somehow the result array doesn't properly have result[1] bound, even though
	// Array.from(result)[1] is there. Magic of code.
	// this.Promise = window.Promise;
	this.Promise = Promise;
	
	/**
	 * Initializes Zotero services for the global page in Chrome or Safari
	 */
	this.initGlobal = function() {
		Zotero.isBackground = true;
		
		if (Zotero.isBrowserExt) {
			chrome.runtime.getPlatformInfo(function (info) {
				switch (info.os) {
					case 'mac':
					case 'win':
						this.platform = info.os;
						break;

					default:
						this.platform = 'unix';
				}
			}.bind(this));
		} else if (Zotero.isSafari) {
			this.platform = 'mac';
		} else {
			// IE and the likes? Who knows
			this.platform = 'win';
		}

		return Zotero.Prefs.init().then(function() {
			Zotero.Debug.init();
			Zotero.Messaging.init();
			Zotero.Connector_Types.init();
			Zotero.Repo.init();
			if (Zotero.isBrowserExt) {
				Zotero.WebRequestIntercept.init();
				Zotero.Proxies.init();
			}
		});
	};
	
	/**
	 * Initializes Zotero services for injected pages and the inject side of the bookmarklet
	 */
	this.initInject = function() {
		Zotero.isInject = true;
		Zotero.Messaging.init();
		Zotero.Connector_Types.init();
		Zotero.Prefs.loadNamespace(['translators.', 'downloadAssociatedFiles', 'automaticSnapshots',
			'reportTranslationFailure', 'capitalizeTitles']);
		return Zotero.Prefs.loadNamespace('debug').then(function() {
			Zotero.Debug.init();
		});
	};
	
	
	/**
	 * Get versions, platform, etc.
	 */
	this.getSystemInfo = function() {
		var info = {
			connector: "true",
			version: this.version,
			platform: navigator.platform,
			locale: navigator.language,
			userAgent: navigator.userAgent
		};
		
		info.appName = Zotero.clientName;
		info.zoteroAvailable = Zotero.Connector.isOnline;
		
		var str = '';
		for (var key in info) {
			str += key + ' => ' + info[key] + ', ';
		}
		str = str.substr(0, str.length - 2);
		return Promise.resolve(str);
	};
	
	/**
	 * Writes a line to the debug console
	 */
	this.debug = function(message, level) {
		Zotero.Debug.log(message, level);
	};
	
	this.logError = function(err) {
		if(!window.console) return;
		
		// Firefox uses this
		var fileName = (err.fileName ? err.fileName : null);
		var lineNumber = (err.lineNumber ? err.lineNumber : null);
		
		// Safari uses this
		if(!fileName && err.sourceURL) fileName = err.sourceURL;
		if(!lineNumber && err.line) lineNumber = err.line;
		
		// Chrome only gives a stack
		if(!fileName && !lineNumber && err.stack) {
			const stackRe = /^\s+at (?:[^(\n]* \()?([^\n]*):([0-9]+):([0-9]+)\)?$/m;
			var m = stackRe.exec(err.stack);
			if(m) {
				fileName = m[1];
				lineNumber = m[2];
			}
		}
		
		if(!fileName && !lineNumber && Zotero.isIE && typeof err === "object") {
			// IE can give us a line number if we re-throw the exception, but we wrap this in a
			// setTimeout call so that we won't throw in the middle of a function
			window.setTimeout(function() {
				window.onerror = function(errmsg, fileName, lineNumber) {
					try {
						Zotero.Errors.log("message" in err ? err.message : err.toString(), fileName, lineNumber);
					} catch(e) {};
					return true;
				};
				throw err;
				window.onerror = undefined;
			}, 0);
			return;
		}
		
		if(fileName && lineNumber) {
			console.error(err+" at "+fileName+":"+lineNumber);
		} else {
			console.error(err);
		}
		
		Zotero.Errors.log(err.message ? err.message : err.toString(), fileName, lineNumber);
	};
}

Zotero.Prefs = new function() {
	const DEFAULTS = {
		"debug.log": false,
		"debug.stackTrace": false,
		"debug.store": false,
		"debug.store.limit": 750000,
		"debug.level": 5,
		"debug.time": false,
		"downloadAssociatedFiles": true,
		"automaticSnapshots": true, // only affects saves to zotero.org. saves to client governed by pref in the client
		"connector.repo.lastCheck.localTime": 0,
		"connector.repo.lastCheck.repoTime": 0,
		"connector.url": ZOTERO_CONFIG.CONNECTOR_SERVER_URL,
		"capitalizeTitles": false,
		"interceptKnownFileTypes": true,
		"allowedInterceptHosts": [],
		"firstUse": true,
		"firstSaveToServer": true,
		"reportTranslationFailure": true,
		"translatorMetadata": [],
		
		"proxies.transparent": true,
		"proxies.autoRecognize": true,
		"proxies.showRedirectNotification": true,
		"proxies.disableByDomain": false,
		"proxies.disableByDomainString": '.edu',
		"proxies.proxies": [],
		"proxies.clientChecked": false,
	};
	
	this.syncStorage = {};

	/**
	 * Should override per browser and load data into this.syncStorage
	 */
	this.init = function() {throw new Error("Prefs initialization not overriden");};
	
	this.get = function(pref) {
		try {
			if (!(pref in this.syncStorage)) throw new Error(`Prefs.get: ${pref} not preloaded`);
			return this.syncStorage[pref];
		} catch (e) {
			if (DEFAULTS.hasOwnProperty(pref)) return DEFAULTS[pref];
			if (Zotero.isBackground) {
				throw new Error("Zotero.Prefs: Invalid preference "+pref);
			} else {
				throw e;
			}
		}
	};
	
	this.getAll = function() {
		let prefs = Object.assign({}, DEFAULTS, this.syncStorage);
		delete prefs['translatorMetadata'];
		return Zotero.Promise.resolve(prefs);
	};
	
	this.getAsync = function(pref) {
		return new Zotero.Promise(function(resolve, reject) {
			try {
				if (typeof pref === "object") {
					var prefData = {};
					for(var i=0; i<pref.length; i++) {
						prefData[pref[i]] = Zotero.Prefs.get(pref[i]);
					}
					resolve(prefData);
				} else {
					resolve(Zotero.Prefs.get(pref));
				}	
			} catch (e) {
				reject(e);
			}
		});
	};

	/**
	 * Pre-load a namespace of prefs that can then be accessed synchronously.
	 * Only needed in injected code
	 *
	 * @param namespace {String|String[]}
	 */
	this.loadNamespace = function(namespaces) {
		if (Zotero.isBackground) throw new Error('trying to load namespace in background. all prefs are available via the sync API');
		if (! Array.isArray(namespaces)) namespaces = [namespaces];
		return this.getAll().then(function(prefs) {
			let keys = Object.keys(prefs);
			for (let namespace of namespaces) {
				keys.filter((key) => key.indexOf(namespace) === 0)
					.forEach((key) => this.syncStorage[key] = prefs[key]);
			}
		}.bind(this));
	};

	/**
	 * Should override per browser
	 * @param pref
	 * @param value
	 */
	this.set = function(pref, value) {
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value));
		this.syncStorage[pref] = value;
	};

	/**
	 * Should override per browser
	 * @param pref
	 */
	this.clear = function(pref) {
		if (Array.isArray(pref)) return pref.forEach((p) => this.clear(p));
		delete this.syncStorage[pref];
	}
}