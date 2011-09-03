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
const TRANSLATOR_TYPES = {"import":1, "export":2, "web":4, "search":8};

/**
 * Singleton to handle loading and caching of translators
 * @namespace
 */
Zotero.Translators = new function() {
	const infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	
	/**
	 * Gets translator code; only in this implementation
	 */
	this._getCode = function(translatorID, callback) {
		// try standalone
		Zotero.Connector.callMethod("getTranslatorCode", {"translatorID":translatorID}, function(result) {
			if(result) {
				callback(result);
				return;
			}
			
			// then try repo
			Zotero.HTTP.doGet(ZOTERO_CONFIG.REPOSITORY_URL+"/code/"+ZOTERO_CONFIG.REPOSITORY_CHANNEL+"/"+translatorID, function(xmlhttp) {
				if(xmlhttp.status !== 200) {
					Zotero.logError(new Error("Translator " + translatorID + " could not be retrieved"));
					callback(false);
					return;
				}
				
				callback(xmlhttp.responseText);
			});
		});
	}
	
	function _haveCode(code, callback) {
		var m = infoRe.exec(code);
		if (!m) {
			Zotero.logError(new Error("Invalid or missing translator metadata JSON object for " + translatorID));
			callback(false);
			return;
		}
		
		try {
			var metadata = JSON.parse(m[0]);
		} catch(e) {
			Zotero.logError(new Error("Invalid or missing translator metadata JSON object for " + translatorID));
			callback(false);
			return;
		}
		metadata.code = code;
		
		callback(new Zotero.Translator(metadata));
	}
	
	/**
	 * Gets the translator that corresponds to a given ID
	 * @param {String} translatorID The ID of the translator
	 * @param {Function} [callback] An optional callback to be executed when translators have been
	 *                              retrieved. If no callback is specified, translators are
	 *                              returned.
	 */
	this.get = function(translatorID, callback) {
		this._getCode(translatorID, function(result) {
			if(result) {
				_haveCode(result, callback);
			} else {
				callback(false);
			}
		});
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
	this.getAllForType = function(type, callback, debugMode) {
		Zotero.logError(new Error("Not implemented"));
		callback(false);
	}
	
	/**
	 * Gets web translators for a specific location
	 * @param {String} uri The URI for which to look for translators
	 * @param {Function} [callback] An optional callback to be executed when translators have been
	 *                              retrieved. If no callback is specified, translators are
	 *                              returned. The callback is passed a set of functions for
	 *                              converting URLs from proper to proxied forms as the second
	 *                              argument.
	 */
	this.getWebTranslatorsForLocation = function(uri, callback) {
		var searchURIs = [uri], fetchURIs,
			m = /^(https?:\/\/)([^\/]+)/i.exec(uri),
			properHosts = [];
			proxyHosts = [];
		
		Zotero.debug("Translators: Looking for translators for "+uri);
		
		// if there is a subdomain that is also a TLD, also test against URI with the domain
		// dropped after the TLD
		// (i.e., www.nature.com.mutex.gmu.edu => www.nature.com)
		if(m) {
			var hostnames = m[2].split(".");
			for(var i=1; i<hostnames.length-2; i++) {
				if(TLDS[hostnames[i].toLowerCase()]) {
					var properHost = hostnames.slice(0, i+1).join(".");
					searchURIs.push(m[1]+properHost+uri.substr(m[0].length));
					properHosts.push(properHost);
					proxyHosts.push(hostnames.slice(i+1).join("."));
				}
			}
		}
		
		var translators = [];
		var converterFunctions = [];
		var needCodeFor = 0;
		
		/**
		 * Gets translators for each search URI
		 */
		function getTranslatorsFromRepo() {
			var searchURI = fetchURIs.shift();
			Zotero.HTTP.doPost(ZOTERO_CONFIG.REPOSITORY_URL+"/metadata",
				"url="+encodeURIComponent(searchURI), function(xmlhttp) {
					if(xmlhttp.status !== 200) {
						Zotero.logError(new Error("Translators could not be retrieved for "+searchURI));
						callback([[], []]);
						return;
					}
							
					try {
						var foundTranslators = JSON.parse(xmlhttp.responseText);
					} catch(e) {
						Zotero.logError(new Error("Translator metadata was invalid"));
						callback([[], []]);
						return;
					}
					translators = translators.concat(foundTranslators);
						
					if(fetchURIs.length) {	// More URLs to try
						getTranslatorsFromRepo();
					} else {				// Have all translators
						haveAllMetadata();
					}
				});
		}
		
		/**
		 * Called when metadata has been retrieved for all translators
		 */
		function haveAllMetadata() {
			// Get unique translators
			var translatorIDs = {};
			var uniqueTranslatorsAndConverterFunctions = [];
			for(var i=0, n=translators.length; i<n; i++) {
				var translatorInfo = translators[i],
					translatorID = translatorInfo.translatorID;
				
				if(!translatorIDs[translatorID]) {
					translatorIDs[translatorID] = true;
					translator = new Zotero.Translator(translatorInfo);
					
					var converterInfo = false;
					for(var j=0, m=searchURIs.length; j<m; j++) {
						if(!translator.webRegexp || translator.webRegexp.test(searchURIs[j])) {
							if(j === 0) {
								converterInfo = null;
							} else {
								converterInfo = [properHosts[j-1], proxyHosts[j-1]];
							}
							break;
						}
					}
					
					if(converterInfo === false) {
						Zotero.logError("Server returned translator that did not match any page. "+
							"(Target: "+translator.target+", URIs: "+JSON.stringify(searchURIs)+")");
						continue;
					}
					uniqueTranslatorsAndConverterFunctions.push([translator, converterInfo]);
				}
			}
			
			// Sort translators
			uniqueTranslatorsAndConverterFunctions = uniqueTranslatorsAndConverterFunctions.sort(function(a, b) {
				return a[0].priority - b[0].priority;
			});
			
			var n = uniqueTranslatorsAndConverterFunctions.length,
				returnTranslators = new Array(n),
				returnConverterInfo = new Array(n);
			for(var i=0; i<n; i++) {
				returnTranslators[i] = uniqueTranslatorsAndConverterFunctions[i][0];
				returnConverterInfo[i] = uniqueTranslatorsAndConverterFunctions[i][1];
			}
			
			new Zotero.Translators.CodeGetter(returnTranslators, callback,
				[returnTranslators, returnConverterInfo]);
		}
		
		// First try Zotero Standalone
		Zotero.Connector.callMethod("getTranslators", {"url":uri}, function(result) {
			if(result) {
				translators = translators.concat(result);
				haveAllMetadata();
				return;
			} else {
				fetchURIs = searchURIs.slice();
				getTranslatorsFromRepo();
			}
		});
		return true;
	}
	
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
	 * Preprocesses code for a translator
	 */
	this.preprocessCode = function(code) {
		if(!Zotero.isFx) {
			const foreach = /^(\s*)for each\s*\((var )?([^ ]+) in (.*?)\)(\s*){/gm;
			code = code.replace(foreach, "$1var $3_zForEachSubject = $4; "+
				"for(var $3_zForEachIndex in $3_zForEachSubject)$5{ "+
				"$2$3 = $3_zForEachSubject[$3_zForEachIndex];", code);
		}
		return code;
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
Zotero.Translators.CodeGetter = function(translators, callback, callbackArgs, debugMode) {
	this._translators = translators;
	this._callbackArgs = callbackArgs;
	this._callback = callback;
	this._debugMode = debugMode;
	this.getCodeFor(0);
}

Zotero.Translators.CodeGetter.prototype.getCodeFor = function(i) {
	var me = this;
	while(true) {
		if(i === this._translators.length) {
			// all done; run callback
			this._callback(this._callbackArgs);
			return;
		}
		
		var translator = this._translators[i];
		
		// retrieve code if no code and translator is supported locally
		if((translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER && !translator.hasOwnProperty("code"))
				// or if debug mode is enabled (even if unsupported locally)
				|| (this._debugMode && (!translator.hasOwnProperty("code")
				// or if in debug mode and the code we have came from the repo (which doesn't
				// include test cases)
				|| (Zotero.Repo && translator.codeSource === Zotero.Repo.SOURCE_REPO)))) {
				// get next translator
			translator.getCode(function() { me.getCodeFor(i+1) });
			return;
		}
		
		// if we are not at end of list and there is no reason to retrieve the code, keep going
		// through the list of potential translators
		i++;
	}
}

const TRANSLATOR_REQUIRED_PROPERTIES = ["translatorID", "translatorType", "label", "creator", "target",
		"priority", "lastUpdated"];
var TRANSLATOR_PASSING_PROPERTIES = TRANSLATOR_REQUIRED_PROPERTIES.concat(["displayOptions", "configOptions",
		"browserSupport", "code", "runMode"]);
var TRANSLATOR_SAVE_PROPERTIES = TRANSLATOR_REQUIRED_PROPERTIES.concat(["browserSupport"]);
/**
 * @class Represents an individual translator
 * @constructor
 * @property {String} translatorID Unique GUID of the translator
 * @property {Integer} translatorType Type of the translator (use bitwise & with TRANSLATOR_TYPES to read)
 * @property {String} label Human-readable name of the translator
 * @property {String} creator Author(s) of the translator
 * @property {String} target Location that the translator processes
 * @property {String} minVersion Minimum Zotero version
 * @property {String} maxVersion Minimum Zotero version
 * @property {Integer} priority Lower-priority translators will be selected first
 * @property {String} browserSupport String indicating browser supported by the translator
 *     g = Gecko (Firefox)
 *     c = Google Chrome (WebKit & V8)
 *     s = Safari (WebKit & Nitro/Squirrelfish Extreme)
 *     i = Internet Explorer
 * @property {Object} configOptions Configuration options for import/export
 * @property {Object} displayOptions Display options for export
 * @property {Boolean} inRepository Whether the translator may be found in the repository
 * @property {String} lastUpdated SQL-style date and time of translator's last update
 * @property {String} code The executable JavaScript for the translator
 */
Zotero.Translator = function(info) {
	this.init(info);
}

/**
 * Initializes a translator from a set of info, clearing code if it is set
 */
Zotero.Translator.prototype.init = function(info) {
	// make sure we have all the properties
	for(var i in TRANSLATOR_REQUIRED_PROPERTIES) {
		var property = TRANSLATOR_REQUIRED_PROPERTIES[i];
		if(info[property] === undefined) {
			this.logError('Missing property "'+property+'" in translator metadata JSON object in ' + info.label);
			haveMetadata = false;
			break;
		} else {
			this[property] = info[property];
		}
	}
	
	this.browserSupport = info["browserSupport"] ? info["browserSupport"] : "g";
	
	if(this.browserSupport.indexOf(Zotero.browser) !== -1) {
		this.runMode = Zotero.Translator.RUN_MODE_IN_BROWSER;
	} else {
		this.runMode = Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE;
	}
	
	this.configOptions = info["configOptions"] ? info["configOptions"] : {};
	this.displayOptions = info["displayOptions"] ? info["displayOptions"] : {};
	
	if(this.translatorType & TRANSLATOR_TYPES["import"]) {
		// compile import regexp to match only file extension
		this.importRegexp = this.target ? new RegExp("\\."+this.target+"$", "i") : null;
	} else if(this.hasOwnProperty("importRegexp")) {
		delete this.importRegexp;
	}
	 
	if(this.translatorType & TRANSLATOR_TYPES["web"]) {
		// compile web regexp
		this.webRegexp = this.target ? new RegExp(this.target, "i") : null;
	} else if(this.hasOwnProperty("webRegexp")) {
		delete this.webRegexp;
	}
	
	if(info.code) {
		this.code = Zotero.Translators.preprocessCode(info.code);
	} else if(this.hasOwnProperty("code")) {
		delete this.code;
	}
}

/**
 * Retrieves code for this translator
 */
Zotero.Translator.prototype.getCode = function(callback) {
	var me = this;
	Zotero.Translators._getCode(this.translatorID,
		function(code) {
			if(!code) {
				callback(false);
			} else {
				// cache code for session only (we have standalone anyway)
				me.code = code;
				callback(true);
			}
		}
	);
}

/**
 * Log a translator-related error
 * @param {String} message The error message
 * @param {String} [type] The error type ("error", "warning", "exception", or "strict")
 * @param {String} [line] The text of the line on which the error occurred
 * @param {Integer} lineNumber
 * @param {Integer} colNumber
 */
Zotero.Translator.prototype.logError = function(message, type, line, lineNumber, colNumber) {
	Zotero.logError(message);
}

Zotero.Translator.RUN_MODE_IN_BROWSER = 1;
Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE = 2;
Zotero.Translator.RUN_MODE_ZOTERO_SERVER = 4;