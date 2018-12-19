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
	const hostPortRe = /^([^:\/]+:)\/\/([^\/]+)/i;
	var m = hostPortRe.exec(url);
	if(!m) {
		return true;
	} else {
		var location = Zotero.isBookmarklet ? window.parent.location : window.location;
		return m[1].toLowerCase() === location.protocol.toLowerCase() &&
			m[2].toLowerCase() === location.host.toLowerCase();
	}
}

/**
 * Determing if trying to load non-HTTPs URLs from HTTPS pages
 */
Zotero.HTTP.isLessSecure = function(url) {
	if (url.substr(0,8).toLowerCase() == 'https://') return false;
	
	var location = Zotero.isBookmarklet ? window.parent.location : window.location;
	return location.protocol.toLowerCase() == 'https:';
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
		return Zotero.HTTP.request(
			"GET",
			url,
			{
				responseType: 'document'
			}
		)
		.then((xhr) => {
			var doc = Zotero.HTTP.wrapDocument(xhr.response, url);
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

Zotero.Browser = {
	createHiddenBrowser: function() {
		var hiddenBrowser = document.createElement("iframe");
		if(!Zotero.isBookmarklet) {
			hiddenBrowser.style.display = "none";
		}
		if(document.domain == document.location.hostname) {
			// Since sandboxed iframes cannot set document.domain, if
			// document.domain is set on this page, then SOP will
			// definitely prevent us from accessing the document
			// in a sandboxed iframe. On the other hand, if we don't
			// sandbox the iframe, it is possible it will navigate the
			// top-level page. So we set the sandbox attribute only if
			// we are not certain that document.domain has been set.
			// This is not perfect, since if a page sets
			// document.domain = document.domain, it is still a 
			// different origin and we will not be able to access pages
			// loaded in the iframe. Additionally, if a page sets
			// document.domain to a different hostname, since we don't
			// sandbox, it is possible that it will navigate the
			// top-level page.
			// TODO: consider HTML XHR
			hiddenBrowser.sandbox = "allow-same-origin allow-forms allow-scripts";
		}
		document.body.appendChild(hiddenBrowser);
		return hiddenBrowser;
	},
	deleteHiddenBrowser: function(hiddenBrowser) {
		document.body.removeChild(hiddenBrowser);
	}
};