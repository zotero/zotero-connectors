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

Zotero.Errors = new function() {
	var _output = [];
	
	this.init = async function() {
		if (Zotero.isManifestV3) {
			let storedData = await browser.storage.session.get({'loggedErrors': []});
			_output = storedData.loggedErrors.concat(_output);
			if (!_output.length) {
				_output.push('Info: Service worker starts: ');
			}
		}
	}
	
	this.logServiceWorkerStarts = function(time) {
		_output[0] = _output[0] += ` ${time}`
	}
	
	/**
	 * Error handler
	 * @param {String} string Error string
	 * @param {String} url URL of error
	 * @param {Number} line Line where error occurred
	 */
	this.log = function(string, url, line) {
		// Special case for MV3 service worker restart info logging
		var err;
		err = [`[JavaScript Error: "${string}"`];
		if(url || line) {
			var info = [];
			if(url) info.push('file: "'+url+'"');
			if(line) info.push('line: '+line);
			err.push(" {"+info.join(" ")+"}");
		}
		err.push("]");
		err = err.join("");
		_output.push(err);
		if (Zotero.isManifestV3) {
			browser.storage.session.set({'loggedErrors': _output});
		}
	}
	
	/**
	 * Gets errors as an array of strings
	 */
	this.getErrors = async function() {
		return _output.slice();
	}

	/**
	 * Get versions, platform, etc.
	 */
	this.getSystemInfo = async function () {
		var info;
		if (Zotero.isSafari && Zotero.isBackground) {
			info = {
				connector: "true",
				version: Zotero.version,
				platform: "Safari App Extension",
			};
		} else {
			info = {
				connector: "true",
				version: Zotero.version,
				platform: navigator.platform,
				locale: navigator.language,
				userAgent: navigator.userAgent,
				isManifestV3: Zotero.isManifestV3
			};
		}
		
		info.appName = Zotero.appName;
		info.zoteroAvailable = !!(await Zotero.Connector.checkIsOnline());
		
		
		if (Zotero.isBackground && Zotero.isBrowserExt) {
			let granted = await browser.permissions.contains({permissions: ['management']});
			if (granted) {
				// See https://github.com/zotero/zotero-connectors/issues/476
				if (!Zotero.isChromium || chrome.management.getAll) {
					let extensions = await browser.management.getAll();
					info.extensions = extensions
						.filter(extension => extension.enabled && extension.name != Zotero.appName)
						.map(extension => {
							return `${extension.name}: ${extension.version}, ${extension.type}`;
						}).join(', ')
				}
			}
		}
		return JSON.stringify(info, null, 2);
	}
	
	/**
	 * Sends an error report to the server
	 * NB: Runs on the prefs injected page on Safari
	 * since responseXML or DOMParser are unavailable
	 * in the global page
	 */
	this.sendErrorReport = async function() {
		var info = await this.getSystemInfo();
		var parts = {
			error: "true",
			errorData: (await this.getErrors()).join('\n'),
			extraData: '',
			diagnostic: info
		};
		
		var body = '';
		for (var key in parts) {
			body += key + '=' + encodeURIComponent(parts[key]) + '&';
		}
		body = body.substr(0, body.length - 1);
		let headers = {'Content-Type': 'application/x-www-form-urlencoded'};
		let options = {body, headers};
		var xmlhttp = await Zotero.HTTP.request("POST", "https://www.zotero.org/repo/report", options);
		let responseXML;
		try {
			let parser = new DOMParser();
			responseXML = parser.parseFromString(xmlhttp.responseText, "text/xml");
		}
		catch (e) {
			throw new Error('Invalid response from repository');
		}
		var reported = responseXML.getElementsByTagName('reported');
		if (reported.length != 1) {
			throw new Error('Invalid response from repository');
		}
		return reported[0].getAttribute('reportID');
	}
}

if (typeof Zotero.Debug != "undefined") {
	Zotero.Debug.bgInit = Zotero.Debug.init;
}
