/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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
window.TRANSLATOR_TYPES = {"import":1, "export":2, "web":4, "search":8};

window.TRANSLATOR_CACHING_PROPERTIES = TRANSLATOR_REQUIRED_PROPERTIES.concat(["browserSupport", "targetAll"]);

/**
 * Singleton to handle loading and caching of translators
 * @namespace
 */
Zotero.Translators = new function() {
	var _cache, _translators;
	var _initialized = false;
	var _fullFrameDetectionWhitelist = ['resolver.ebscohost.com'];
	var _resetAttempted = false;
	
	/**
	 * Initializes translator cache, loading all relevant translators into memory
	 * @param {Zotero.Translate[]} [translators] List of translators. If not specified, it will be
	 *                                           retrieved from storage.
	 */
	this.init = function(translators) {
		if(!translators) {
			translators = [];
			if((Zotero.isBrowserExt || Zotero.isSafari) && Zotero.Prefs.get("translatorMetadata")) {
				try {
					translators = Zotero.Prefs.get("translatorMetadata");
					if(typeof translators !== "object") {
						translators = [];
					}
				} catch(e) {}
			}
		}
		
		_cache = {"import":[], "export":[], "web":[], "search":[]};
		_translators = {};
		_initialized = true;
		
		// Build caches
		for(var i=0; i<translators.length; i++) {
			try {
				var translator = new Zotero.Translator(translators[i]);
				_translators[translator.translatorID] = translator;
				
				for(var type in TRANSLATOR_TYPES) {
					if(translator.translatorType & TRANSLATOR_TYPES[type]) {
						_cache[type].push(translator);
					}
				}
			} catch(e) {
				Zotero.logError(e);
				try {
					Zotero.logError("Could not load translator "+JSON.stringify(translators[i]));
				} catch(e) {}
			}
		}
		
		// Huge number of translator metadata missing. Attempt to reset.
		// NOTE: If the number of translators significantly decreases (currently at 450ish)
		// then this will trigger on every translator init.
		if (Object.keys(_translators).length < 400 && !_resetAttempted) {
			_resetAttempted = true;
			Zotero.logError(new Error(`Only ${Object.keys(_translators).length} translators present in cache. Resetting`));
			Zotero.Prefs.clear("connector.repo.lastCheck.repoTime");
			Zotero.Prefs.clear("connector.repo.lastCheck.localTime");
			return Zotero.Repo.init();
		}
		
		// Sort by priority
		var cmp = function (a, b) {
			if (a.priority > b.priority) {
				return 1;
			}
			else if (a.priority < b.priority) {
				return -1;
			}
		}
		for(var type in _cache) {
			_cache[type].sort(cmp);
		}
	}
	
	/**
	 * Gets the translator that corresponds to a given ID, without attempting to retrieve code
	 * @param {String} id The ID of the translator
	 */
	this.getWithoutCode = function(id) {
		if(!_initialized) Zotero.Translators.init();
		return _translators[id] ? _translators[id] : false;
	}
	
	/**
	 * Gets the translator that corresponds to a given ID
	 *
	 * @param {String} id The ID of the translator
	 */
	this.get = Zotero.Promise.method(function (id) {
		if(!_initialized) Zotero.Translators.init();
		var translator = _translators[id];
		if(!translator) {
			return false;
		}
		
		// only need to get code if it is of some use
		if(translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER
				&& !translator.hasOwnProperty("code")) {
			return translator.getCode().then(() => translator);
		} else {
			return translator;
		}
	});
	
	/**
	 * Gets all translators for a specific type of translation
	 * @param {String} type The type of translators to get (import, export, web, or search)
	 * @param {Boolean} [debugMode] Whether to assume debugging mode. If true, code is included for 
	 *                              unsupported translators, and code originally retrieved from the
	 *                              repo is re-retrieved from Zotero Standalone.
	 */
	this.getAllForType = Zotero.Promise.method(function (type, debugMode) {
		if(!_initialized) Zotero.Translators.init()
		var translators = _cache[type].slice(0);
		var codeGetter = new Zotero.Translators.CodeGetter(translators, debugMode);
		return codeGetter.getAll().then(function() {
			return translators;
		});;
	});
	
	/**
	 * Gets web translators for a specific location
	 *
	 * NOTE: Keep in sync with the bookmarklet version
	 *
	 * @param {String} uri The URI for which to look for translators
	 * @return {Promise<Array[]>} - A promise for a 2-item array containing an array of translators and
	 *     an array of functions for converting URLs from proper to proxied forms
	 */
	this.getWebTranslatorsForLocation = Zotero.Promise.method(function (URI, rootURI, callback) {
		if (callback) {
			// If callback is present then this call is coming from an injected frame,
			// so we may as well treat it as if it's a root-frame
			rootURI = URI;
		} else {
			// Hopefully a temporary hard-coded list
			for (let str of _fullFrameDetectionWhitelist) {
				if (URI.includes(str)) {
					rootURI = URI;
					break;
				}
			}
		}
		var isFrame = URI !== rootURI;
		if(!_initialized) Zotero.Translators.init();
		var allTranslators = _cache["web"];
		var potentialTranslators = [];
		var proxies = [];
		
		var rootSearchURIs = Zotero.Proxies.getPotentialProxies(rootURI);
		var frameSearchURIs = isFrame ? Zotero.Proxies.getPotentialProxies(URI) : rootSearchURIs;

		Zotero.debug("Translators: Looking for translators for "+Object.keys(frameSearchURIs).join(', '));

		for(var i=0; i<allTranslators.length; i++) {
			var translator = allTranslators[i];
			if (isFrame && !translator.webRegexp.all) {
				continue;
			}
			rootURIsLoop:
			for(var rootSearchURI in rootSearchURIs) {
				var isGeneric = !allTranslators[i].webRegexp.root;
				// don't attempt to use generic translators that can't be run in this browser
				// since that would require transmitting every page to Zotero host
				if(isGeneric && allTranslators[i].runMode !== Zotero.Translator.RUN_MODE_IN_BROWSER) {
					continue;
				}

				var rootURIMatches = isGeneric || rootSearchURI.length < 8192 && translator.webRegexp.root.test(rootSearchURI);
				if (translator.webRegexp.all && rootURIMatches) {
					for (var frameSearchURI in frameSearchURIs) {
						var frameURIMatches = frameSearchURI.length < 8192 && translator.webRegexp.all.test(frameSearchURI);
							
						if (frameURIMatches) {
							potentialTranslators.push(translator);
							proxies.push(frameSearchURIs[frameSearchURI]);
							// prevent adding the translator multiple times
							break rootURIsLoop;
						}
					}
				} else if(!isFrame && (isGeneric || rootURIMatches)) {
					potentialTranslators.push(translator);
					proxies.push(rootSearchURIs[rootSearchURI]);
					break;
				}
			}
		}
		
		var codeGetter = new Zotero.Translators.CodeGetter(potentialTranslators);
		return codeGetter.getAll().then(function () {
			return [potentialTranslators, proxies];
		});
	});

	/**
	 * Converts translators to JSON-serializable objects
	 */
	this.serialize = function(translator, properties) {
		// handle translator arrays
		if(translator.length !== undefined) {
			var newTranslators = new Array(translator.length);
			for(var i in translator) {
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
	
	/**
	 * Saves all translator metadata to localStorage
	 * @param {Object[]} newMetadata Metadata for new translators
	 * @param {Boolean} reset Whether to clear all existing translators and overwrite them with
	 *                        the specified translators.
	 */
	this.update = function(newMetadata, reset) {
		if (!_initialized) Zotero.Translators.init();
		if (!newMetadata.length) return;
		var serializedTranslators = [];
		
		if (reset) {
			serializedTranslators = newMetadata.map((t) => new Zotero.Translator(t));
		}
		else {
			var hasChanged = false;
			
			// Update translators with new metadata
			for(var i in newMetadata) {
				var newTranslator = newMetadata[i];
				
				if (newTranslator.deleted) continue;
				
				if(_translators.hasOwnProperty(newTranslator.translatorID)) {
					var oldTranslator = _translators[newTranslator.translatorID];
					
					// check whether translator has changed
					if(oldTranslator.lastUpdated !== newTranslator.lastUpdated) {
						// check whether newTranslator is actually newer than the existing
						// translator, and if not, don't update
						if(Zotero.Date.sqlToDate(newTranslator.lastUpdated) < Zotero.Date.sqlToDate(oldTranslator.lastUpdated)) {
							continue;
						}
						
						Zotero.debug(`Translators: Updating ${newTranslator.label}`);
						oldTranslator.init(newTranslator);
						hasChanged = true;
					}
				} else {
					Zotero.debug(`Translators: Adding ${newTranslator.label}`);
					_translators[newTranslator.translatorID] = new Zotero.Translator(newTranslator);
					hasChanged = true;
				}
			}
			
			let deletedTranslators = newMetadata
				.filter(translator => translator.deleted)
				.map(translator => translator.translatorID);
				
			for (let id of deletedTranslators) {
				// Already deleted
				if (! _translators.hasOwnProperty(id)) continue;
				
				hasChanged = true;
				Zotero.debug(`Translators: Removing ${_translators[id].label}`);
				delete _translators[id];
			}
			
			if(!hasChanged) return;
			
			// Serialize translators
			for(var i in _translators) {
				var serializedTranslator = this.serialize(_translators[i], TRANSLATOR_CACHING_PROPERTIES);
				
				// don't save run mode
				delete serializedTranslator.runMode;
				
				serializedTranslators.push(serializedTranslator);
			}
		}
		
		// Store
		if (Zotero.isBrowserExt || Zotero.isSafari) {
			Zotero.Prefs.set('translatorMetadata', serializedTranslators);
			Zotero.debug("Translators: Saved updated translator list ("+serializedTranslators.length+" translators)");
		}
		
		// Reinitialize
		Zotero.Translators.init(serializedTranslators);
	}
}

/**
 * A class to get the code for a set of translators at once
 *
 * @param {Zotero.Translator[]} translators Translators for which to retrieve code
 * @param {Boolean} [debugMode] If true, include code for unsupported translators
 */
Zotero.Translators.CodeGetter = function(translators, debugMode) {
	this._translators = translators;
	this._debugMode = debugMode;
	this._concurrency = 1;
};

Zotero.Translators.CodeGetter.prototype.getCodeFor = Zotero.Promise.method(function(i) {
	let translator = this._translators[i];
	// retrieve code if no code and translator is supported locally
	if (translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER
			// or if in debug mode and the code we have came from the repo (which doesn't
			// include test cases)
			|| (this._debugMode && Zotero.Repo && translator.codeSource === Zotero.Repo.SOURCE_REPO)) {
		// get code
		return translator.getCode().catch((e) => Zotero.debug(`Failed to retrieve code for ${translator.translatorID}`));
	}
});

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
