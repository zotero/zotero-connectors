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
var TRANSLATOR_TYPES = Zotero.Translator.TRANSLATOR_TYPES;

/**
 * Singleton to handle loading and caching of translators
 * @namespace
 */
Zotero.Translators = new function() {
	this.PREFS_TRANSLATOR_CODE_PREFIX = 'translatorCode_';
	var _cache, _translators;
	var _initializedPromise;
	var _fullFrameDetectionWhitelist = ['resolver.ebscohost.com'];
	
	this._translatorsHash = null;
	this._sortedTranslatorHash = null;
	
	/**
	 * Initializes translator cache, loading all relevant translators into memory
	 * and setting up regular repo checks for translator updates
	 */
	this.init = async function() {
		if (_initializedPromise) return _initializedPromise;
		_cache = {"import":[], "export":[], "web":[], "search":[]};
		_translators = {};
		_initializedPromise = new Promise(async (resolve, reject) => {
			try {
				let translators = Zotero.Prefs.get("translatorMetadata");
				// No stored translators
				if (typeof translators !== "object" || !translators.length) {
					Zotero.debug(`Translators: First time launch, getting all translators.`);
					await this.updateFromRemote(true);
				}
				else {
					this._load(translators);
				}
				this.keepTranslatorsUpdated();
				resolve();
			}
			catch (e) {
				_initializedPromise = null;
				reject(e);
			}
		})
		
	}
	
	this._load = function(jsonTranslators) {
		_cache = {"import":[], "export":[], "web":[], "search":[]};
		_translators = {};

		// Build caches
		for (let jsonTranslator of jsonTranslators) {
			let translator = new Zotero.Translator(jsonTranslator);
			this._loadTranslator(translator, false);
		}
		
		// Sort by priority
		for (const type in _cache) {
			_cache[type].sort((a, b) => a.priority - b.priority);
		}
		Zotero.debug(`Translators: Saved ${Object.keys(jsonTranslators).length} translators.`);
	}
	
	this._loadTranslator = function (translator, sort=true) {
		try {
			_translators[translator.translatorID] = translator;

			for (const type in TRANSLATOR_TYPES) {
				if (translator.translatorType & TRANSLATOR_TYPES[type]) {
					_cache[type].push(translator);
					if (sort) {
						_cache[type].sort((a, b) => a.priority - b.priority);
					}
				}
			}
		} catch(e) {
			Zotero.logError(e);
			try {
				Zotero.logError("Could not load translator "+JSON.stringify(jsonTranslator));
			} catch(e) {}
		}
	}
	
	this._removeTranslator = function (translatorID) {
		const translator = _translators[translatorID];
		this.deleteTranslatorCode(translatorID)
		delete _translators[translatorID];
		for (const type in TRANSLATOR_TYPES) {
			if (translator.translatorType & TRANSLATOR_TYPES[type]) {
				const idx = _cache[type].findIndex(t => t.translatorID === translator.translatorID);
				_cache[type].splice(idx, 1);
			}
		}
	}
	
	this.keepTranslatorsUpdated = async function() {
		// We always get translator metadata from Zotero first. If it was successfully checked in the last 24 hours
		// then there is nothing to do. If it hasn't been checked for 24 hours, then either Zotero was online
		// and no changes to translators in the client caused an update, or Zotero was offline.
		// Either way no harm in checking for updates every 24hr.
		const nextCascadeToRepo = Zotero.Prefs.get("connector.repo.lastCheck.localTime")
			+ZOTERO_CONFIG.REPOSITORY_CHECK_INTERVAL*1000;
		const now = Date.now();
		const repoCheckIntervalHasExpired = nextCascadeToRepo <= now;
		let repoCheckFailed = false;
		if (repoCheckIntervalHasExpired) {
			try {
				await this.updateFromRemote();
			}
			catch (e) {
				repoCheckFailed = true;
			}
		}
		
		// If e.g. Zotero was last checked 6 hours ago when this runs, then we schedule the next
		// check in 24hr - 6hr = 18hr to make sure one check occurs at least every 24hr.
		let nextCheckIn = Math.max(0, nextCascadeToRepo - now);
		if (repoCheckIntervalHasExpired && repoCheckFailed) {
			// We failed to get metadata and repo check interval expired,
			// so schedule a check soon (in 1hr) in hopes repo comes back alive
			nextCheckIn = ZOTERO_CONFIG.REPOSITORY_RETRY_INTERVAL * 1000;
		}
		Zotero.debug(`Repo: Next check in ${nextCheckIn/1000}s`);
		await Zotero.Promise.delay(nextCheckIn);
		return this.keepTranslatorsUpdated();
	}

	/**
	 * Update translator metadata
	 *
	 * Called:
	 * - If Zotero.Translators._translatorHash differs from the one returned by Zotero /ping response
	 * - When Reset Translators button in Preferences is clicked (with reset=true).
	 * - Every REPOSITORY_CHECK_INTERVAL (24hrs) (when Zotero is unavailable)
	 *
	 * If a browser is closed and reopened then Repo will not be checked unless 24hrs have passed
	 * since last check.
	 *
	 * @param reset {Boolean} Fetches all metadata from repo instead of just the diff since last checked
	 */
	this.updateFromRemote = async function(reset=false) {
		Zotero.debug('Retrieving translators from Zotero Client');
		let translatorMetadata;
		try {
			translatorMetadata = await Zotero.Repo.getTranslatorMetadataFromZotero();
			return this.loadNewMetadata(translatorMetadata, reset, false)
		}
		catch (e) {
			Zotero.debug('Failed to retrieve translators from Zotero Client, attempting Repo');
			try {
				translatorMetadata = await Zotero.Repo.getTranslatorMetadataFromServer(reset);
				return this.loadNewMetadata(translatorMetadata, reset, true)
			}
			catch (e) {
				Zotero.logError('Failed to retrieve translators from Zotero Client and Zotero Repo ' + e);
				throw e;
			}	
		}
	}

	/**
	 * Merge stored translator metadata with newly fetched from repo
	 * @param {Object[]} newMetadata Metadata for new translators
	 * @param {Boolean} reset Whether this is an update for the full list of translators
	 * @param {Boolean} fromRepo Whether this is an update from the repo or not
	 */
	this.loadNewMetadata = async function(newMetadata, reset=false, fromRepo=false) {
		if (!newMetadata.length) return;
		Zotero.debug('Loading new translator metadata');
		let updatedTranslators = [];
		let newTranslators = [];
		let deletedTranslators = new Set();
		
		if (reset) {
			await Zotero.Prefs.removeAllCachedTranslators();
			this._load(newMetadata);
			await this._storeTranslatorMetadata();
			
			// Reset translator hash
			this._translatorsHash = null;
			this._sortedTranslatorHash = null;
			return;
		}

		if (!fromRepo) {
			deletedTranslators = new Set(Object.keys(_translators));
			for (const translatorMetadata of newMetadata) {
				if (translatorMetadata.deleted) continue;
				if (_translators[translatorMetadata.translatorID]) {
					updatedTranslators.push(translatorMetadata);
				} else {
					newTranslators.push(translatorMetadata);
				}
				deletedTranslators.delete(translatorMetadata.translatorID);
			}
		}
		else {
			for (const translatorMetadata of newMetadata) {
				if (translatorMetadata.deleted) {
					deletedTranslators.add(translatorMetadata.translatorID);
				}
				else if(_translators.hasOwnProperty(translatorMetadata.translatorID)) {
					updatedTranslators.push(translatorMetadata);
				}
				else {
					newTranslators.push(translatorMetadata);
				}
			}
		}
		
		if (!newTranslators.length && !updatedTranslators.length && !deletedTranslators.size) return;

		// Load new translators
		for (const translatorMetadata of newTranslators) {
			Zotero.debug(`Translators: Adding ${translatorMetadata.label}`);
			this._loadTranslator(new Zotero.Translator(translatorMetadata));
		}

		// Update existing translators and remove cached code
		updatedTranslators = updatedTranslators.filter((translatorMetadata) => {
			let translator = _translators[translatorMetadata.translatorID]
			// check whether translatorMetadata is actually newer than the existing translator
			if (translator.lastUpdated === translatorMetadata.lastUpdated) {
				return false;
			}
			Zotero.debug(`Translators: Updating ${translatorMetadata.label}`);
			translator.init(translatorMetadata)
			this.deleteTranslatorCode(translator.translatorID)
			return true;
		});

		// Remove deleted translators and their cached codes
		for (const translatorID of deletedTranslators.keys()) {
			// Remove storage cached code
			Zotero.Prefs.clear(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translatorID);
			this._removeTranslator(translatorID)
		}

		// Serialize and store translators
		await this._storeTranslatorMetadata();
		Zotero.debug(`Translators: Saved (${Object.keys(_translators).length} translators. New ${newTranslators.length}, deleted ${deletedTranslators.size}, updated ${updatedTranslators.length})`);

		// Reset translator hash
		this._translatorsHash = null;
		this._sortedTranslatorHash = null;
	}
	
	this.updateTranslator = async function(translatorMetadata) {
		let translator = _translators[translatorMetadata.translatorID]
		translator.init(translatorMetadata)
		await this._storeTranslatorMetadata();
	}
	
	this._storeTranslatorMetadata = async function() {
		let serializedTranslators = this.serialize(Object.values(_translators), Zotero.Translator.TRANSLATOR_CACHING_PROPERTIES);
		return Zotero.Prefs.set('translatorMetadata', serializedTranslators);
	}
	
	/**
	 * Gets a hash of all translators (to check whether Connector needs an update)
	 */
	this.getTranslatorsHash = async function (sorted) {
		let prop = sorted ? "_sortedTranslatorHash" : "_translatorsHash";
		if (this[prop]) return this[prop];
		await this.init();
		let translators = Object.keys(_translators).map(id => _translators[id]);
		if (sorted) {
			translators.sort((a, b) => a.translatorID.localeCompare(b.translatorID));
		}

		let hashString = "";
		for (let translator of translators) {
			hashString += `${translator.translatorID}:${translator.lastUpdated},`;
		}
		this[prop] = Zotero.Utilities.Connector.md5(hashString);
		return this[prop];
	}
	
	this.deleteTranslatorCode = async function (id) {
		let translator = _translators[id];
		if (translator) delete translator.code;
		return Zotero.Prefs.clear(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + id);
	}
	
	/**
	 * Gets the translator that corresponds to a given ID, without attempting to retrieve code
	 * @param {String} id The ID of the translator
	 */
	this.getWithoutCode = async function(id) {
		await Zotero.Translators.init();
		return _translators[id] ? _translators[id] : false;
	}

	/**
	 * Load code for a translator
	 */
	this.getCodeForTranslator = async function (translator) {
		if (translator.code) return translator.code;
		
		let code;
		try {
			code = Zotero.Prefs.get(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translator.translatorID);
		}
		catch (e) {
			code = await Zotero.Repo.getTranslatorCode(translator.translatorID);
			// Store in prefs for future retrieval
			Zotero.Prefs.set(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translator.translatorID, code);
		}

		translator.code = code;
		return code;
	}

	/**
	 * Gets the translator that corresponds to a given ID
	 *
	 * @param {String} id The ID of the translator
	 */
	this.get = async function (id) {
		await Zotero.Translators.init();
		var translator = _translators[id];
		if (!translator) {
			return false;
		}
		
		// only need to get code if it is of some use
		if(translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER
				&& !translator.hasOwnProperty("code")) {
			await Zotero.Translators.getCodeForTranslator(translator);
		}
		return translator;
	};
	
	/**
	 * Gets all translators for a specific type of translation
	 * @param {String} type The type of translators to get (import, export, web, or search)
	 * @param {Boolean} [debugMode] Whether to assume debugging mode. If true, code is included for 
	 *                              unsupported translators, and code originally retrieved from the
	 *                              repo is re-retrieved from Zotero Standalone.
	 */
	this.getAllForType = async function (type, debugMode) {
		await Zotero.Translators.init();
		var translators = _cache[type].slice(0);
		var codeGetter = new Zotero.Translators.CodeGetter(translators, debugMode);
		await codeGetter.getAll();
		return translators;
	};
	
	/**
	 * Gets web translators for a specific location
	 *
	 * @param {String} uri The URI for which to look for translators
	 * @return {Promise<Array[]>} - A promise for a 2-item array containing an array of translators and
	 *     an array of functions for converting URLs from proper to proxied forms
	 */
	this.getWebTranslatorsForLocation = async function (URI, rootURI, callback) {
		await Zotero.initDeferred.promise;
		await Zotero.Translators.init();
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
		await codeGetter.getAll();
		return [potentialTranslators, proxies];
	};

	/**
	 * Converts translators to JSON-serializable objects
	 */
	this.serialize = function(translator, properties) {
		// handle translator arrays
		if (Array.isArray(translator)) {
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
}

/**
 * A class to get the code for a set of translators at once
 *
 * @param {Zotero.Translator[]} translators Translators for which to retrieve code
 */
Zotero.Translators.CodeGetter = function(translators) {
	this._translators = translators;
	this._concurrency = 2;
};

Zotero.Translators.CodeGetter.prototype.getCodeFor = async function(i) {
	let translator = this._translators[i];
	try {
		translator.code = await Zotero.Translators.getCodeForTranslator(translator);
	} catch (e) {
		Zotero.debug(`Failed to retrieve code for ${translator.translatorID}`)
	}
	return translator.code;
};

Zotero.Translators.CodeGetter.prototype.getAll = async function () {
	let codes = [];
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
