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

// Enumeration of types of translators
var TRANSLATOR_TYPES = {"import":1, "export":2, "web":4, "search":8};

/**
 * Singleton to handle loading and caching of translators
 * @namespace
 */
Zotero.Translators = new function() {
	var infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	var cache = {};
	
	/**
	 * Gets translator code; only in this implementation
	 */
	this._getCode = async function(translatorID) {
		// try standalone
		
		try {
			return await Zotero.Connector.callMethod("getTranslatorCode", {"translatorID":translatorID});
		} catch(e) {}
		
			
		// then try repo
		let xmlhttp = await Zotero.HTTP.request('GET', 
			ZOTERO_CONFIG.REPOSITORY_URL+"/code/"+ZOTERO_CONFIG.REPOSITORY_CHANNEL+"/"+translatorID);
		
		
		return xmlhttp.responseText;
	}
	
	/**
	 * Gets the translator that corresponds to a given ID
	 * @param {String} translatorID The ID of the translator
	 * @param {Function} [callback] An optional callback to be executed when translators have been
	 *                              retrieved. If no callback is specified, translators are
	 *                              returned.
	 */
	this.get = async function(translatorID) {
		if (translatorID in cache) return cache[translatorID];
		let code = await this._getCode(translatorID);
		
		var m = infoRe.exec(code);
		if (!m) {
			throw new Error("Invalid or missing translator metadata JSON object for " + translatorID);
		}
		
		try {
			var metadata = JSON.parse(m[0]);
		} catch(e) {
			throw new Error("Invalid or missing translator metadata JSON object for " + translatorID);
		}
		metadata.code = code;
		
		cache[translatorID] = new Zotero.Translator(metadata);
		return cache[translatorID];
	};
	
	/**
	 * Gets all translators for a specific type of translation
	 * @param {String} type The type of translators to get (import, export, web, or search)
	 * @param {Function} callback A required callback to be executed when translators have been
	 *                            retrieved.
	 * @param {Boolean} [debugMode] Whether to assume debugging mode. If true, code is included for 
	 *                              unsupported translators, and code originally retrieved from the
	 *                              repo is re-retrieved from Zotero Standalone.
	 */
	this.getAllForType = function(type) {
		throw new Error("Not implemented");
	};
	
	/**
	 * Check the url for potential proxies and deproxify, providing a schema to build
	 * a proxy object.
	 * 
	 * @param URL
	 * @returns {Object} Unproxied url to proxy object
	 */
	this._getPotentialProxies = function(URL) {
		var urlToProxy = {};
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
			if (m[1] == 'https://') {
				// try replacing hyphens with dots for https protocol
				// to account for EZProxy HttpsHypens mode
				hostnameParts.push(host.split('.'));
				hostnameParts[1].splice(0, 1, ...(hostnameParts[1][0].replace(/-/g, '.').split('.')));
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
						urlToProxy[properURL] = {scheme: '%h.' + proxyHost + '/%p', dotsToHyphens};
					}
				}
			}
		}
		return urlToProxy;
	};

	/**
	 * Gets web translators for a specific location
	 * @param {String} uri The URI for which to look for translators
	 */
	this.getWebTranslatorsForLocation = async function(URI) {
		var searchURIs = this._getPotentialProxies(URI);

		Zotero.debug("Translators: Looking for translators for "+Object.keys(searchURIs).join(', '));
	
		var potentialTranslators = [];
		var proxies = [];
	
		try {
			// First try Zotero Standalone
			for (let uri in searchURIs) {
				let result = await Zotero.Connector.callMethod("getTranslators", {url: uri, rootUrl: uri});
				potentialTranslators = potentialTranslators.concat(result);
				proxies.push(searchURIs[uri]);
			}
		} catch (e) {
			// Then attempt the repo
			for (let uri in searchURIs) {
				try {
					var xmlhttp = await Zotero.HTTP.request("POST", ZOTERO_CONFIG.REPOSITORY_URL+"/metadata",
						{body: "url="+encodeURIComponent(uri)});
				} catch (e) {
					// If the repo call fails for whatever reason, try other search URIs
					continue;
				}
				try {
					var foundTranslators = JSON.parse(xmlhttp.responseText);
				} catch(e) {
					throw new Error("Translator metadata is invalid");
				}
				
				for(var i=0; i<foundTranslators.length; i++) {
					if(!(foundTranslators[i].translatorType & TRANSLATOR_TYPES.web)) {
						foundTranslators.splice(i, 1);
					}
				}
				potentialTranslators = potentialTranslators.concat(foundTranslators);
				proxies.push(searchURIs[uri]);
			}
		}
		
		let translatorIDs = {};
		for (let i =0 ; i < potentialTranslators.length; i++) {
			let translator = potentialTranslators[i],
				proxy = proxies[i];
			cache[translator.translatorID] = new Zotero.Translator(translator);
			translatorIDs[translator.translatorID] = [cache[translator.translatorID], proxy];
		}

		// Sort translators
		let translators = Object.values(translatorIDs).sort(function(a, b) {
			return a[0].priority - b[0].priority;
		});
		proxies = [];
		translators = translators.map(function(t) {
			proxies.push(t[1]);
			return t[0];
		});
		
		var codeGetter = new Zotero.Translators.CodeGetter(translators);
		return codeGetter.getAll().then(function () {
			return [translators, proxies];
		});
	}
	
	/**
	 * Converts translators to JSON-serializable objects
	 */
	this.serialize = function(translator, properties) {
		// handle translator arrays
		if(translator.length !== undefined) {
			var newTranslators = new Array(translator.length);
			for(var i=0, n=translator.length; i<n; i++) {
				newTranslators[i] = Zotero.Translators.serialize(translator[i], properties);
			}
			return newTranslators;
		}
		
		// handle individual translator
		var newTranslator = {};
		for(var i in properties) {
			var property = properties[i];
			newTranslator[property] = translator[property];
		}
		return newTranslator;
	}
}

/**
 * A class to get the code for a set of translators at once
 *
 * @param {Zotero.Translator[]} translators Translators for which to retrieve code
 * @param {Function} callback Callback to call once code has been retrieved
 * @param {Function} callbackArgs All arguments to be passed to callback (including translators)
 * @param {Boolean} [debugMode] If true, include code for unsupported translators
 */
Zotero.Translators.CodeGetter = function(translators, debugMode) {
	this._translators = translators;
	this._debugMode = debugMode;
	this._concurrency = 1;
}

Zotero.Translators.CodeGetter.prototype.getCodeFor = async function(i) {
	let translator = this._translators[i];
	
	// retrieve code if no code and translator is supported locally
	if((translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER && !translator.hasOwnProperty("code"))
			// or if debug mode is enabled (even if unsupported locally)
			|| (this._debugMode && (!translator.hasOwnProperty("code")
			// or if in debug mode and the code we have came from the repo (which doesn't
			// include test cases)
			|| (Zotero.Repo && translator.codeSource === Zotero.Repo.SOURCE_REPO)))) {
			// get next translator
		return translator.getCode().catch((e) => {
			Zotero.debug(`Failed to retrieve code for ${translator.translatorID}`);
			throw e;
		});
	}
}


Zotero.Translators.CodeGetter.prototype.getAll = function () {
	var codes = [];
	// Chain promises with some level of concurrency. If unchained, fires 
	// off hundreds of xhttprequests on connectors and crashes the extension
	for (let i = 0; i < this._translators.length; i++) {
		if (i < this._concurrency) {
			codes.push(this.getCodeFor(i));
		} else {
			codes.push(codes[i-this._concurrency].then(() => this.getCodeFor(i)));
		}
	}
	return Promise.all(codes);
};

window.TRANSLATOR_REQUIRED_PROPERTIES = ["translatorID", "translatorType", "label", "creator", "target",
		"priority", "lastUpdated"];
window.TRANSLATOR_PASSING_PROPERTIES = TRANSLATOR_REQUIRED_PROPERTIES.concat(["browserSupport", "code", "runMode"]);
window.TRANSLATOR_SAVE_PROPERTIES = TRANSLATOR_REQUIRED_PROPERTIES.concat(["browserSupport"]);

/**
 * Retrieves code for this translator
 */
Zotero.Translator.prototype.getCode = async function() {
	if (!this.code) {
		this.code = await Zotero.Translators._getCode(this.translatorID);
	}
	return this.code
}
