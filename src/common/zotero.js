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

var global = typeof window == "undefined" ? self : window;

var Zotero = global.Zotero = new function() {
	this.version = "5.0";
	this.locale = typeof navigator != "undefined" ? navigator.languages[0] : 'en';
	this.isConnector = true;
	// Old flag for 4.0 connector, probably not used anymore
	this.isFx = false;
	this.isDebug = false;
	
	// For autocomplete in IDEs
	this.allowRepoTranslatorTester = this.isManifestV3
		= this.isFirefox = this.isSafari = this.isBrowserExt = null;
	/* this.allowRepoTranslatorTester = SET IN BUILD SCRIPT */;
	/* this.isManifestV3 = SET IN BUILD SCRIPT */;

	this.initialized = false;
	this.initDeferred = {};
	this.initDeferred.promise = new Promise(function(resolve, reject) {
		this.initDeferred.resolve = resolve;
		this.initDeferred.reject = reject;
	}.bind(this));
	
	// Safari  global page detection
	if (typeof globalThis !== "undefined" && typeof window !== 'undefined' && window === globalThis && typeof browser === "undefined" && typeof chrome === "undefined") {
		this.isSafari = true;
		this.isMac = true;
	}
	else {
		// Browser check adopted from:
		// http://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
		/* this.isFirefox = SET IN BUILD SCRIPT */;
		/* this.isSafari = SET IN BUILD SCRIPT */;
		/* this.isBrowserExt = SET IN BUILD SCRIPT */;

		this.isChrome = this.isEdge = false;
		if (this.isBrowserExt && !this.isFirefox) {
			this.isChromium = true;
			if (global.navigator.userAgent.includes("Edg/")) {
				this.isEdge = true;
			} else {
				// If browser ext is not fx or edge then treat it as Chrome
				// since it's probably installed with compatible browsers such as Opera from the
				// Chrome extension store
				this.isChrome = true;
			}
		}
		this.isOffscreen = typeof document != 'undefined' && document.location.href.endsWith('offscreenSandbox.html');

		this.isMac = (global.navigator.platform.substr(0, 3) == "Mac");
		this.isWin = (global.navigator.platform.substr(0, 3) == "Win");
		this.isLinux = (global.navigator.platform.substr(0, 5) == "Linux");
	}

	if (this.isFirefox) {
		this.browser = "g";
		this.clientName = 'Firefox';
	} else if (this.isSafari) {
		this.browser = "s";
		this.clientName = 'Safari';
	} else if (this.isEdge) {
		this.browser = "c";
		this.clientName = 'Edge';
	} else if (this.isChrome) {
		this.browser = "c";
		this.clientName = 'Chrome';
	} else {
		// Assume this is something with no more capabilities than IE
		this.browser = "i";
		this.clientName = global.navigator.appName;
	}
	this.appName = `${ZOTERO_CONFIG.CLIENT_NAME} Connector for ${this.clientName}`;
	
	if (this.isBrowserExt) {
		if (!this.isOffscreen) {
			this.version = browser.runtime.getManifest().version;
		}
	}
	
	// window.Promise and Promise differ (somehow) in Firefox and when certain
	// async promise resolution conditions arise upon calling Zotero.Promise.all().then(result => )
	// somehow the result array doesn't properly have result[1] bound, even though
	// Array.from(result)[1] is there. Magic of code.
	// this.Promise = window.Promise;
	this.Promise = Promise;
	
	this.migrate = async function() {
		let lastVersion = Zotero.Prefs.get('lastVersion') || Zotero.version;
		// Skip first-use dialog for existing users when enabled for non-Firefox browsers
		if (Zotero.Utilities.semverCompare(lastVersion, "5.0.87") < 0 && !this.isFirefox) {
			Zotero.Prefs.set('firstUse', false);
		}
		if (Zotero.Utilities.semverCompare(lastVersion, "5.0.110") < 0) {
			Zotero.Prefs.set('integration.googleDocs.useGoogleDocsAPI', false)
		}
		if (Zotero.Utilities.semverCompare(lastVersion, "5.0.168") < 0 && Zotero.isFirefox) {
			// We were setting DNR header replacement rules on Firefox http.js without
			// removing them, and this breaks translation sometimes
			// See https://github.com/zotero/translate/issues/41
			const rules = await browser.declarativeNetRequest.getDynamicRules({});
			let ruleIDs = [];
			for (const rule of rules) {
				if (rule.action.type === 'modifyHeaders') {
					ruleIDs.push(rule.id);
				}
			}
			if (ruleIDs.length) {
				await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIDs });
			}
		}
		Zotero.Prefs.set('lastVersion', Zotero.version);
	};

	/**
	 * Gets Connector version. Used in API restricted JS environments (offscreen, sandbox).
	 * @returns {string|*}
	 */
	this.getVersion = function() {
		return Zotero.version;
	}
	
	/**
	 * Initializes Zotero services for the global page in Chrome or Safari
	 */
	this.initGlobal = async function() {
		await Zotero.Errors.init();
		if (Zotero.isManifestV3) {
			Zotero.Errors.logServiceWorkerStarts(Zotero.Date.dateToSQL(new Date()));
		}
		Zotero.isBackground = true;
		
		if (Zotero.isBrowserExt) {
			browser.runtime.getPlatformInfo().then(function (info) {
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
		
		// Add browser version info
		if (this.isFirefox) {
			browser.runtime.getBrowserInfo().then(info => {
				this.browserVersion = info.version;
				this.browserMajorVersion = parseInt(info.version.match(/^[0-9]+/)[0]);
			});
		}

		Zotero.Messaging.init();
		if (Zotero.isSafari) {
			this.version = await Zotero.Connector_Browser.getExtensionVersion();
			window.safari = {extension: {baseURI: await Zotero.Messaging.sendMessage('Swift.getBaseURI')}};
		}
		Zotero.Connector_Types.init();
		await Zotero.Prefs.init();
		
		Zotero.Debug.init();
		let storingDebugOnRestart = Zotero.Prefs.get('debug.store');
		if (storingDebugOnRestart) Zotero.Debug.setStore(storingDebugOnRestart);
		Zotero.Prefs.set('debug.store', false);
		if (Zotero.isBrowserExt) {
			Zotero.WebRequestIntercept.init();
			Zotero.ContentTypeHandler.init();
			await Zotero.Connector_Browser.init();
		}
		await Zotero.i18n.init();
		Zotero.Translators.init();
		Zotero.Proxies.init();
		await this._initDateFormatsJSON();
		Zotero.initDeferred.resolve();
		if (Zotero.GoogleDocs.API.init) {
			await Zotero.GoogleDocs.API.init();
		}
		Zotero.initialized = true;

		await Zotero.migrate();
	};
	
	/**
	 * Initializes Zotero services for injected pages
	 */
	this.initInject = async function() {
		Zotero.isInject = true;
		Zotero.Messaging.init();
		if (Zotero.isSafari) {
			await Zotero.i18n.init();
		}
		Zotero.ConnectorIntegration.init();
		Zotero.Connector_Types.init();
		Zotero.Schema.init();
		await this._initDateFormatsJSON();
		Zotero.Prefs.loadNamespace(['translators.', 'downloadAssociatedFiles', 'automaticSnapshots',
			'reportTranslationFailure', 'capitalizeTitles']);
		await Zotero.Prefs.loadNamespace('debug');
		
		Zotero.Debug.init();
		Zotero.initDeferred.resolve();
		Zotero.initialized = true;
	};

	this.initOffscreen = async function() {
		this.version = await Zotero.getVersion();
		Zotero.Schema.init();
		await this._initDateFormatsJSON();
		await Zotero.Prefs.loadNamespace(['translators.', 'downloadAssociatedFiles', 'automaticSnapshots',
			'reportTranslationFailure', 'capitalizeTitles']);
	};

	this._initDateFormatsJSON = async function() {
		let dateFormatsJSON;
		if (Zotero.isSafari) {
			dateFormatsJSON = await Zotero.Messaging.sendMessage('Swift.getDateFormatsJSON');
		}
		else {
			let url = Zotero.getExtensionURL('utilities/resource/dateFormats.json');
			if (Zotero.isOffscreen) {
				url = await url;
			}
			let xhr = await Zotero.HTTP.request('GET', url, {responseType: 'json'});
			dateFormatsJSON = xhr.response;
		}
		Zotero.Date.init(dateFormatsJSON);
	};

	this.getSystemInfo = (...args) => Zotero.Errors.getSystemInfo(...args);
	
	/**
	 * Writes a line to the debug console
	 */
	this.debug = function(message, level) {
		Zotero.Debug.log(message, level);
	};
	
	this.logError = function(err) {
		Zotero.debug(err, 1);
		if(!global.console) return;
		
		// Firefox uses this
		var fileName = (err.fileName ? err.fileName : null);
		var lineNumber = (err.lineNumber ? err.lineNumber : null);
		
		// Safari uses this
		if(!fileName && err.sourceURL) fileName = err.sourceURL;
		if(!lineNumber && err.line) lineNumber = err.line;
		
		if (!fileName && !lineNumber) {
			let stack = err.stack || new Error().stack;
			const stackRe = /^\s+at (?:[^(\n]* \()?([^\n]*):([0-9]+):([0-9]+)\)?$/m;
			var m = stackRe.exec(stack);
			if(m) {
				fileName = m[1];
				lineNumber = m[2];
			}
		}
		
		let message = err;
		if (typeof message != 'string') {
			message = err.message;
			if (typeof message != 'string' && typeof err == 'object') {
				message = err.toJSON();
			}
		}
		
		if(fileName && lineNumber) {
			console.error(message+" at "+fileName+":"+lineNumber);
		} else {
			console.error(err);
		}
		
		if (err.stack) {
			if (!Zotero.isChrome) {
				Zotero.Errors.log(err.message + '\n' + err.stack);
			} else {
				Zotero.Errors.log(err.stack);
			}
		} else {
			Zotero.Errors.log(err.message ? err.message : err.toString(), fileName, lineNumber);
		}
	};
	
	this.getString = function() {
		return Zotero.i18n.getString(...arguments);
	};
	
	this.getExtensionURL = function(path) {
		if (Zotero.isSafari) {
			return `${safari.extension.baseURI}safari/` + path;
		}
		else {
			return browser.runtime.getURL(path);
		}
	}
}

Zotero.Prefs = new function() {
	const DEFAULTS = {
		"debug.stackTrace": false,
		"debug.store": false,
		"debug.store.limit": 750000,
		"debug.level": 5,
		"debug.time": false,
		"lastVersion": "",
		"downloadAssociatedFiles": true,
		"automaticSnapshots": true, // only affects saves to zotero.org. saves to client governed by pref in the client
		"connector.repo.lastCheck.localTime": 0,
		"connector.repo.lastCheck.repoTime": 0,
		"connector.url": 'http://127.0.0.1:23119/',
		"capitalizeTitles": false,
		"interceptKnownFileTypes": true,
		"allowedCSLExtensionHosts": ["^https://raw\\.githubusercontent\\.com/", "^https://gitee\\.com/.+/raw/"],
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
		"proxies.loopPreventionTimestamp": 0,
		
		"integration.googleDocs.enabled": true,
		"integration.googleDocs.useV2API": false,
		"integration.googleDocs.forceDisableV2API": false,
		
		"shortcuts.cite": {ctrlKey: true, altKey: true, key: 'c'}
	};

	if (Zotero.isMac) {
		DEFAULTS['shortcuts.cite'] = {metaKey: true, ctrlKey: true, key: 'c'}
	}
	
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
			if (DEFAULTS.hasOwnProperty(pref)) {
				if (Zotero.isInject) {
					Zotero.logError(new Error(`Prefs.get(${pref}) in injected script is getting a default value. `
						`This may be a bug. Either preload prefs or use getAsync()`));
				}
				return DEFAULTS[pref];
			}
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
		// Do not return translator code from storage as they are not prefs to be edited
		for (const key of Object.keys(prefs)) {
			if (key.startsWith(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX)) delete prefs[key];
		}
		return Zotero.Promise.resolve(prefs);
	};
	
	this.getDefault = function() {
		return Object.assign({}, DEFAULTS);
	}
	
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
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value).substr(0, 100));
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

	this.removeAllCachedTranslators = function() {
		Zotero.debug('Removing all cached translators');
		let cachedTranslators = Object.keys(this.syncStorage).filter(key => key.startsWith(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX));
		return this.clear(cachedTranslators);
	}
}