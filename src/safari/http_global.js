/*
    ***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2019 Center for History and New Media
					 George Mason University, Fairfax, Virginia, USA
					 http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	
	You should have received a copy of the GNU General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

Zotero.HTTP.request = async function(method, url, options={}) {
	let args = { method, url };
	// Default options
	options = Object.assign({
		body: null,
		headers: {},
		debug: false,
		logBodyLength: 1024,
		timeout: 15000,
		responseType: '',
		responseCharset: null,
		successCodes: null
	}, options);
	options.method = method;
	
	let logBody = '';
	if (['GET', 'HEAD'].includes(method)) {
		if (!(typeof options.body == 'undefined' || options.body == null)) {
			throw new Error(`HTTP ${method} cannot have a request body (${options.body})`)
		}
	} else if (options.body) {
		options.body = typeof options.body == 'string' ? options.body : JSON.stringify(options.body);
		
		if (!options.headers) options.headers = {};
		if (!options.headers["Content-Type"]) {
			options.headers["Content-Type"] = "application/x-www-form-urlencoded";
		}
		else if (options.headers["Content-Type"] == 'multipart/form-data') {
			// Allow XHR to set Content-Type with boundary for multipart/form-data
			delete options.headers["Content-Type"];
		}
				
		logBody = `: ${options.body.substr(0, options.logBodyLength)}` +
			(options.body.length > options.logBodyLength ? '...' : '');
		// TODO: make sure below does its job in every API call instance
		// Don't display password or session id in console
		logBody = logBody.replace(/password":"[^"]+/, 'password":"********');
		logBody = logBody.replace(/password=[^&]+/, 'password=********');
	}
	Zotero.debug(`HTTP ${method} ${url}${logBody}`);
	args.options = options;
	
	try {
		var response = await Zotero.Messaging.sendMessage('HTTP.request', args);
		var [status, responseText, headers, responseURL] = response;
	} catch (err) {
		status = 0;
		headers = {};
		responseText = err.message;
	}
	let invalidDefaultStatus = options.successCodes === null &&
		(status < 200 || status >= 300);
	let invalidStatus = Array.isArray(options.successCodes) && !options.successCodes.includes(status);
	if (invalidDefaultStatus || invalidStatus) {
		throw new Zotero.HTTP.StatusError({status, responseText}, url);
	}
	
	let headerString = Object.keys(headers).map(key => `${key}: ${headers[key]}`).join("\n");
	Object.keys(headers).forEach(key => headers[key.toLowerCase()] = headers[key]);
	return {
		status, responseText,
		response: responseText,
		responseHeaders: headerString,
		responseURL,
		getAllResponseHeaders: () => headerString,
		getResponseHeader: name => headers[name.toLowerCase()]
	};
}

// Alias as COHTTP = Cross-origin HTTP; this is how we will call it from children
// For injected scripts, this get overwritten in messaging.js (see messages.js)
Zotero.COHTTP = {
	request: Zotero.HTTP.request
};

