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

	if (['GET', 'HEAD'].includes(method)) {
		if (!(typeof options.body == 'undefined' || options.body == null)) {
			throw new Error(`HTTP ${method} cannot have a request body (${options.body})`)
		}
	}
	
	let logBody = '';
	if (options.body && !(options.body instanceof ArrayBuffer)) {
		if (options.headers["Content-Type"] !== 'multipart/form-data') {
			options.body = typeof options.body == 'string' ? options.body : JSON.stringify(options.body);
			logBody = `: ${options.body.substr(0, options.logBodyLength)}` +
				(options.body.length > options.logBodyLength ? '...' : '');
			// TODO: make sure below does its job in every API call instance
			// Don't display password or session id in console
			logBody = logBody.replace(/password":"[^"]+/, 'password":"********');
			logBody = logBody.replace(/password=[^&]+/, 'password=********');
		}
	}
	Zotero.debug(`HTTP ${method} ${url}:\n${logBody}`);

	// Return a promise that will be resolved with the HTTP response
    let result = await new Promise((resolve, reject) => {
        // Call the Swift implementation through JSContext
        _httpRequest(method, url, options, (result) => {
            if (result[0] === "error") {
				reject(new Zotero.HTTP.StatusError({ status: 0, responseText: result[1].message.trim() }, url));
				return;
            }
            
            resolve(result);
        });
    });
	
	const status = result.status;
	let invalidDefaultStatus = options.successCodes === null &&
		(status < 200 || status >= 300);
	let invalidStatus = Array.isArray(options.successCodes) && !options.successCodes.includes(status);
	if (invalidDefaultStatus || invalidStatus) {
		throw new Zotero.HTTP.StatusError({status, responseText: result.responseText}, url);
	}

	let responseHeaders = {};
	Object.entries(result.responseHeaders).forEach(([key, value]) => {
		responseHeaders[key.toLowerCase()] = value;
	});
	result.getResponseHeader = name => responseHeaders[name.toLowerCase()];
	if (result.getResponseHeader('Content-Type') === 'application/json') {
		try {
			result.response = JSON.parse(result.response);
		}
		catch (e) {
			result.response = null;
		}
	}
	result.getAllResponseHeaders = () => {
		return Object.entries(responseHeaders).map(([key, value]) => `${key}: ${value}`).join('\n');
	};
	return result;
}

// Alias as COHTTP = Cross-origin HTTP; this is how we will call it from children
// For injected scripts, this get overwritten in messaging.js (see messages.js)
Zotero.COHTTP = {
	request: Zotero.HTTP.request
};

