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
const VERSION = "1.0a2";

const ZOTERO_CONFIG = {
	REPOSITORY_URL: 'https://repodev.zotero.org/repo',
	REPOSITORY_CHECK_INTERVAL: 86400, // 24 hours
	REPOSITORY_RETRY_INTERVAL: 3600, // 1 hour
	REPOSITORY_CHANNEL: 'trunk',
	BASE_URI: 'http://zotero.org/',
	WWW_BASE_URL: 'http://www.zotero.org/',
	API_URL: 'https://api.zotero.org/',
	OAUTH_REQUEST_URL: 'https://www.zotero.org/oauth/request',
	OAUTH_ACCESS_URL: 'https://www.zotero.org/oauth/access',
	OAUTH_AUTHORIZE_URL: 'https://www.zotero.org/oauth/authorize',
	OAUTH_CALLBACK_URL: 'http://www.zotero.org/support/connector_auth_complete',
	OAUTH_CLIENT_KEY: '91a6767411840e7fb6ed',
	OAUTH_CLIENT_SECRET: '9ec47d3f24d6dff3bdaa'
};

var Zotero = new function() {
	this.isConnector = true;
	this.isChrome = !!window.chrome;
	this.isSafari = !!window.safari;
	this.browser = (window.chrome ? "c" : "s");
	
	this.initGlobal = function() {
		Zotero.Debug.init();
		Zotero.Messaging.init();
		Zotero.Connector_Types.init();
		Zotero.Repo.init();
	};
	
	this.initInject = function() {
		// We have to load AJAW into global namespace, so move it to local
		if(window.RDFIndexedFormula) {
			Zotero.RDF = {
				"AJAW":{
					"RDFIndexedFormula":RDFIndexedFormula,
					"RDFSymbol":RDFSymbol
				}
			};
		}
		
		Zotero.Debug.init();
		Zotero.Messaging.init();
	};
	
	this.getSystemInfo = function() {
		var info = {
			connector: "true",
			version: VERSION,
			platform: navigator.platform,
			locale: navigator.language,
			appName: (this.isChrome ? "Chrome" : "Safari"),
			appVersion: navigator.appVersion
		};
		
		var str = '';
		for (var key in info) {
			str += key + ' => ' + info[key] + ', ';
		}
		str = str.substr(0, str.length - 2);
		return str;
	};
	
	this.debug = function(message, level) {
		Zotero.Debug.log(message, level);
	};
	
	this.logError = function(err) {
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
		
		if(fileName && lineNumber) {
			console.error(err+" at "+fileName+":"+lineNumber);
		} else {
			console.error(err);
		}
		
		Zotero.Errors.log(err.message ? err.message : err.toString(), fileName, lineNumber);
	};
	
	/**
	 * PHP var_dump equivalent for JS
	 *
	 * Adapted from http://binnyva.blogspot.com/2005/10/dump-function-javascript-equivalent-of.html
	 */
	this.varDump = function(arr,level) {
		var dumped_text = "";
		if (!level){
			level = 0;
		}
		
		// The padding given at the beginning of the line.
		var level_padding = "";
		for (var j=0;j<level+1;j++){
			level_padding += "    ";
		}
		
		if (typeof(arr) == 'object') { // Array/Hashes/Objects
			for (var item in arr) {
				var value = arr[item];
				
				if (typeof(value) == 'object') { // If it is an array,
					dumped_text += level_padding + "'" + item + "' ...\n";
					dumped_text += arguments.callee(value,level+1);
				}
				else {
					if (typeof value == 'function'){
						dumped_text += level_padding + "'" + item + "' => function(...){...} \n";
					}
					else if (typeof value == 'number') {
						dumped_text += level_padding + "'" + item + "' => " + value + "\n";
					}
					else {
						dumped_text += level_padding + "'" + item + "' => \"" + value + "\"\n";
					}
				}
			}
		}
		else { // Stings/Chars/Numbers etc.
			dumped_text = "===>"+arr+"<===("+typeof(arr)+")";
		}
		return dumped_text;
	}
}

Zotero.Prefs = new function() {
	const DEFAULTS = {
		"debug.log":true,
		"debug.store":false,
		"debug.store.limit":750000,
		"debug.level":5,
		"debug.time":false,
		"downloadAssociatedFiles":false,
		"automaticSnapshots":false,
		"connector.repo.lastCheck.localTime":0,
		"connector.repo.lastCheck.repoTime":0,
		"capitalizeTitles":true
	};
	
	this.get = function(pref) {
		if(localStorage["pref-"+pref]) return JSON.parse(localStorage["pref-"+pref]);
		if(DEFAULTS.hasOwnProperty(pref)) return DEFAULTS[pref];
		throw "Zotero.Prefs: Invalid preference "+pref;
	};
	
	this.getCallback = function(pref, callback) {
		callback(Zotero.Prefs.get(pref));
	};
	
	this.set = function(pref, value) {
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value));
		localStorage["pref-"+pref] = JSON.stringify(value);
	};
}