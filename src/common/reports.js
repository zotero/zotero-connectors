/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
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

(function() {

if (typeof Zotero.Debug != 'undefined') {
	Zotero.Debug.bgInit = Zotero.Debug.init;
	
	var setStore = Zotero.Debug.setStore;
	Zotero.Debug.setStore = function(val, fetchFromClient) {
		if (typeof fetchFromClient != 'boolean') fetchFromClient = false;
		setStore.apply(this, arguments);
		if (fetchFromClient) {
			Zotero.Connector.callMethod('reports', {debug: {store: val}});
		}
	};

	var clear = Zotero.Debug.clear;
	Zotero.Debug.clear = function(fetchFromClient) {
		if (typeof fetchFromClient != 'boolean') fetchFromClient = false;
		clear.apply(this, arguments);
		if (fetchFromClient) {
			Zotero.Connector.callMethod('reports', {debug: {clear: true}});
		}
	};

	// Only there to expose the pref to injected pages
	Zotero.Debug.isStoring = function() {
		return Zotero.Debug.storing;
	};
		
	/**
	 * Submit data to the server
	 */
	Zotero.Debug.submitToZotero = async function() {
		return Zotero.Errors.submitToZotero(true);
	};
}

Zotero.Errors = new function() {
	var _output = [];
	
	/**
	 * Error handler
	 * @param {String} string Error string
	 * @param {String} url URL of error
	 * @param {Number} line Line where error occurred
	 */
	this.log = function(string, url, line) {
		var err = ['Error: ', string];
		if(url || line) {
			var info = [];
			if(url) info.push('file: "'+url+'"');
			if(line) info.push('line: '+line);
			err.push(" {"+info.join(" ")+"}");
		}
		err = err.join("");
		_output.push(err);
	};
	
	/**
	 * Gets errors as an array of strings
	 */
	this.getErrors = async function() {
		return _output.slice();
	};
	
	this.generateReport = async function() {
		let sysInfo = await Zotero.getSystemInfo();
		return sysInfo + "\n\n" + (await this.getErrors()).join('\n\n') + "\n\n"
	}
	
	/**
	 * Sends an error report to the server
	 * NB: Runs on the prefs injected page on Safari
	 * since responseXML or DOMParser are unavailable
	 * in the global page
	 */
	this.submitToZotero = async function(debug) {
		var connectorBody, zoteroBody, url;
		if (debug) {
			url = ZOTERO_CONFIG.REPOSITORY_URL + "report?debug=1";
			connectorBody = await Zotero.Debug.get();
		} else {
			url = ZOTERO_CONFIG.REPOSITORY_URL + "report?debug=1";
			connectorBody = await this.generateReport();
		}
		
		// If zotero unavailable -- ignore
		try {
			if (debug) {
				zoteroBody = await Zotero.Connector.callMethod('reports', {debug: {get: true}});
			} else {
				zoteroBody = await Zotero.Connector.callMethod('reports', {errors: {get: true}});
			}
		} catch (e) {}

		let date = (new Date()).toUTCString();
		let type = debug ? "Debug" : "Report";
		let body = `----------------------------- Connector ${type}: ${date} --------------------------------\n\n`;
		body += connectorBody;
		if (zoteroBody) {
			body += `\n\n----------------------------- Zotero ${type} --------------------------------\n\n`;
			body += zoteroBody;
		}
		let headers = { 'Content-Type': 'text/plain' };
		let xmlhttp = await Zotero.HTTP.request("POST", url, { body, headers });
		
		let responseXML;
		try {
			let parser = new DOMParser();
			responseXML = parser.parseFromString(xmlhttp.responseText, "text/xml");
		}
		catch (e) {
			throw new Error('Invalid response from server');
		}
		
		var reported = responseXML.getElementsByTagName('reported');
		if (reported.length != 1) {
			throw new Error('The server returned an error. Please try again.');
		}
		if (debug) {
			return 'D' + reported[0].getAttribute('reportID');
		}
		return 'D' + reported[0].getAttribute('reportID');
	}
};

}());