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
	
	this.Promise = window.Promise;
	
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
		
		
		Zotero.Debug.init();
		Zotero.Messaging.init();
		Zotero.Connector_Types.init();
		Zotero.Repo.init();
	};
	
	/**
	 * Initializes Zotero services for injected pages and the inject side of the bookmarklet
	 */
	this.initInject = function() {
		Zotero.isInject = true;
		Zotero.Debug.init();
		Zotero.Messaging.init();
		Zotero.Connector_Types.init();
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
		"automaticSnapshots": true,
		"connector.repo.lastCheck.localTime": 0,
		"connector.repo.lastCheck.repoTime": 0,
		"connector.url": ZOTERO_CONFIG.CONNECTOR_SERVER_URL,
		"capitalizeTitles": false,
		"interceptKnownFileTypes": true,
		"allowedInterceptHosts": [],
		"firstUse": true,
		"firstSaveToServer": true,
		"reportTranslationFailure": true,
		
		"proxies.transparent": true,
		"proxies.autoRecognize": true,
		"proxies.showRedirectNotification": true,
		"proxies.disableByDomain": false,
		"proxies.disableByDomainString": '.edu',
		"proxies.proxies": []
	};
	
	
	this.get = function(pref) {
		try {
			if("pref-"+pref in localStorage) return JSON.parse(localStorage["pref-"+pref]);
		} catch(e) {}
		if (DEFAULTS.hasOwnProperty(pref)) return DEFAULTS[pref];
		throw "Zotero.Prefs: Invalid preference "+pref;
	};
	
	this.getAll = function() {
		let prefs = Object.assign({}, localStorage);
		for (let k of Object.keys(prefs)) {
			if (k.substr(0, 'pref-'.length) == 'pref-') {
				prefs[k.substr('pref-'.length)] = prefs[k];
			}
			delete prefs[k];
		}
		return Zotero.Promise.resolve(Object.assign({}, DEFAULTS, prefs));
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
	
	this.set = function(pref, value) {
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value));
		localStorage["pref-"+pref] = JSON.stringify(value);
	};
}