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
	this.isConnector = true;
	this.isChrome = !!window.chrome;
	this.isSafari = !!window.safari;
	this.isIE = window.navigator.appName === "Microsoft Internet Explorer";
	this.version = "2.999.1";
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
			version: this.version,
			platform: navigator.platform,
			locale: navigator.language,
			appVersion: navigator.appVersion
		};
		
		if(this.isChrome) {
			info.appName = "Chrome";
		} else if(this.isSafari) {
			info.appName = "Safari";
		} else if(this.isIE) {
			info.appName = "Internet Explorer";
		} else {
			info.appName = window.navigator.appName;
		}
		
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
		"debug.log":true,
		"debug.stackTrace":false,
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