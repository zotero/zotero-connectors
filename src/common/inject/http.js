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

/**
 * Functions for performing HTTP requests, both via XMLHTTPRequest and using a hidden browser
 * @namespace
 */
if(!Zotero.HTTP) Zotero.HTTP = {};

/**
 * Determines whether the page to be loaded has the same origin as the current page
 */
Zotero.HTTP.isSameOrigin = function(url) {
	// Hack to deal with cross-origin redirect on Nature until we swit
	if (url.includes('www.nature.com/') || url.includes('www-nature-com.')) {
		return false;
	}
	
	const hostPortRe = /^([^:\/]+:)\/\/([^\/]+)/i;
	var m = hostPortRe.exec(url);
	if(!m) {
		return true;
	} else {
		var location = window.location;
		return m[1].toLowerCase() === location.protocol.toLowerCase() &&
			m[2].toLowerCase() === location.host.toLowerCase();
	}
}

/**
 * Determine if trying to load non-HTTPs URLs from HTTPS pages
 */
Zotero.HTTP.isLessSecure = function(url) {
	if (url.substr(0,8).toLowerCase() == 'https://') return false;
	
	var location = window.location;
	return location.protocol.toLowerCase() == 'https:';
}

Zotero.HTTP.addDefaultReferrer = function(url, options) {
	if (!options.headers) options.headers = {};
	if (options.referrer || options.headers['Referer']) {
		return;
	}
	let referrer = Zotero.HTTP.getDefaultReferrer(url);
	if (referrer) {
		options.referrer = referrer;
	}
}

Zotero.HTTP.getDefaultReferrer = function(url) {
	let sourceURL;
	let targetURL;
	try {
		sourceURL = new URL(document.location.href);
		// Use the current document URL as the base so relative request URLs are
		// resolved the same way they would be from the page.
		targetURL = new URL(url, sourceURL.href);
	}
	catch (e) {
		return '';
	}

	let policy = document.referrerPolicy || 'strict-origin-when-cross-origin';
	let sameOrigin = sourceURL.origin == targetURL.origin;
	let isDowngrade = sourceURL.protocol == 'https:' && targetURL.protocol != 'https:';
	let sourceOrigin = sourceURL.origin + '/';
	let sourceHref = sourceURL.href;

	switch (policy) {
		case 'no-referrer':
			return '';
		case 'origin':
			return sourceOrigin;
		case 'same-origin':
			return sameOrigin ? sourceHref : '';
		case 'strict-origin':
			return isDowngrade ? '' : sourceOrigin;
		case 'origin-when-cross-origin':
			return sameOrigin ? sourceHref : sourceOrigin;
		case 'unsafe-url':
			return sourceHref;
		case 'no-referrer-when-downgrade':
			return isDowngrade ? '' : sourceHref;
		case 'strict-origin-when-cross-origin':
		default:
			if (sameOrigin) return sourceHref;
			return isDowngrade ? '' : sourceOrigin;
	}
}
 
/**
 * Load one or more documents via XMLHttpRequest
 *
 * This should stay in sync with the equivalent function in the client
 *
 * @param {String|String[]} urls - URL(s) of documents to load
 * @param {Function} processor - Callback to be executed for each document loaded
 * @return {Promise<Array>} - A promise for an array of results from the processor runs
 */
Zotero.HTTP.processDocuments = async function (urls, processor, options = {}) {
	// Handle old signature: urls, processor, onDone, onError
	if (typeof arguments[2] == 'function' || typeof arguments[3] == 'function') {
		Zotero.debug("Zotero.HTTP.processDocuments() no longer takes onDone or onError -- update your code");
		var onDone = arguments[2];
		var onError = arguments[3];
	}
	
	if (typeof urls == "string") urls = [urls];
	var funcs = urls.map(url => () => {
		let requestOptions = {
			responseType: 'text'
		};
		Zotero.HTTP.addDefaultReferrer(url, requestOptions);
		return Zotero.COHTTP.request(
			"GET",
			url,
			requestOptions
		)
		.then((xhr) => {
			Zotero.debug("Parsing cross-origin response for " + url);
			let parser = new DOMParser();
			let contentType = xhr.getResponseHeader("Content-Type");
			if (contentType != 'application/xml' && contentType != 'text/xml') {
				contentType = 'text/html';
			}
			let doc = parser.parseFromString(xhr.responseText, contentType);
			doc = Zotero.HTTP.wrapDocument(doc, url);
			return processor(doc, url);
		});
	});
	
	// Run processes serially
	// TODO: Add some concurrency?
	var f;
	var results = [];
	while (f = funcs.shift()) {
		try {
			results.push(await f());
		}
		catch (e) {
			if (onError) {
				onError(e);
			}
			throw e;
		}
	}
	
	// Deprecated
	if (onDone) {
		onDone();
	}
	
	return results;
}