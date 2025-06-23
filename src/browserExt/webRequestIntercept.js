/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2016 Center for History and New Media
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
 * Handles web request interception and header parsing
 */

(function() {

'use strict';

Zotero.WebRequestIntercept = {
	listeners: {
		beforeSendHeaders: [],
		headersReceived: [],
		errorOccurred: []
	},
	
	reqIDToReqMeta: {},

	init: function() {
		const types = ["main_frame", "sub_frame"];
		let extraInfoSpec = ["requestHeaders"].concat(!Zotero.isManifestV3 ? ["blocking"] : []);
		browser.webRequest.onBeforeSendHeaders.addListener(Zotero.WebRequestIntercept.handleRequest('beforeSendHeaders'), {urls: ['<all_urls>'], types}, extraInfoSpec);
		browser.webRequest.onErrorOccurred.addListener(Zotero.WebRequestIntercept.removeRequestMeta, {urls: ['<all_urls>'], types});
		browser.webRequest.onCompleted.addListener(Zotero.WebRequestIntercept.removeRequestMeta, {urls: ['<all_urls>'], types});
		extraInfoSpec = ["responseHeaders"].concat(!Zotero.isManifestV3 ? ["blocking"] : []);
		browser.webRequest.onHeadersReceived.addListener(Zotero.WebRequestIntercept.handleRequest('headersReceived'), {urls: ['<all_urls>'], types}, extraInfoSpec);

		Zotero.WebRequestIntercept.addListener('beforeSendHeaders', Zotero.WebRequestIntercept.storeRequestHeaders)
		Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.WebRequestIntercept.offerSavingPDFInFrame)
	},

	storeRequestHeaders: function(details, meta) {
		meta.requestHeadersObject = details.requestHeadersObject;
    },

	offerSavingPDFInFrame: function(details) {
		if (details.frameId === 0) return;
		if (!details.responseHeadersObject['content-type']) return;
		const contentType = details.responseHeadersObject['content-type'].split(';')[0];
		
		// If no translators are found for the top frame or the first child frame, and some frame
		// contains a pdf, saving that PDF will be offered.
		if (contentType == 'application/pdf') {
			setTimeout(() => Zotero.Connector_Browser.onPDFFrame(details.url, details.frameId, details.tabId));
		}
	},
	
	removeRequestMeta: function(details) {
		delete Zotero.WebRequestIntercept.reqIDToReqMeta[details.requestId];
	},
	
	/**
	 * Convert from webRequest.HttpHeaders array to a lowercased object.
	 * 
	 * headers = _processHeaders(details.requestHeaders)
	 * console.log(headers['accept-charset']) // utf-8
	 * 
	 * @param {Array} headerArray
	 * @return {Object} headers
	 */
	processHeaders: function(headerArray) {
		if (!Array.isArray(headerArray)) return headerArray;
		
		let headers = {};
		for (let header of headerArray) {
			headers[header.name.toLowerCase()] = header.value;
		}
		return headers;
	},
	
	handleRequest: function(requestType) {
		return function(details) {
			if (!Zotero.WebRequestIntercept.listeners[requestType].length) return;

			let meta = Zotero.WebRequestIntercept.reqIDToReqMeta[details.requestId];
			if (!meta) {
				meta = {};
				Zotero.WebRequestIntercept.reqIDToReqMeta[details.requestId] = meta;
			}

			if (meta.requestHeadersObject) {
				details.requestHeadersObject = meta.requestHeadersObject;
			} else if (details.requestHeaders) {
				details.requestHeadersObject = Zotero.WebRequestIntercept.processHeaders(details.requestHeaders);
			}

			if (details.responseHeaders) {
				details.responseHeadersObject = Zotero.WebRequestIntercept.processHeaders(details.responseHeaders);
			}

			var returnValue = null;
			for (let listener of Zotero.WebRequestIntercept.listeners[requestType]) {
				let retVal = listener(details, meta);
				if (typeof retVal == 'object') {
					returnValue = Object.assign(returnValue || {}, retVal);
				}
			}
			if (returnValue !== null && !Zotero.isManifestV3) {
				return returnValue;
			}
		}
	},
	
	addListener: function(requestType, listener) {
		if (Zotero.WebRequestIntercept.listeners[requestType] === undefined) {
			throw new Error(`Web request listener for '${requestType}' not allowed`);
		}
		if (typeof listener != 'function') {
			throw new Error(`Web request listener of type ${typeof listener} is not allowed`);
		}
		Zotero.WebRequestIntercept.listeners[requestType].push(listener)
	},
	
	removeListener: function(requestType, listener) {
		if (Zotero.WebRequestIntercept.listeners[requestType] === undefined) {
			throw new Error(`Web request listener for '${requestType}' not allowed`);
		}
		if (typeof listener != 'function') {
			throw new Error(`Web request listener of type ${typeof listener} is not allowed`);
		}
		let idx = Zotero.WebRequestIntercept.listeners[requestType].indexOf(listener);
		if (idx != -1) {
			Zotero.WebRequestIntercept.listeners[requestType].splice(idx, 1);
		}
	},
	
	replaceHeaders: async function(url, headers) {
		if (!Zotero.isBrowserExt) return;
		return this.replaceHeadersDNR(url, headers);
	},
	
	replaceHeadersDNR: async function(url, headers) {
		const requestHeaders = headers.map((headerObj) => {
			return { header: headerObj.name, value: headerObj.value, operation: 'set' }
		});
		const ruleID = Math.floor(Math.random() * 100000);
		const rules = [{
			id: ruleID,
			action: {
				type: 'modifyHeaders',
				requestHeaders,
			},
			condition: {
				resourceTypes: ['xmlhttprequest'],
				initiatorDomains: [new URL(browser.runtime.getURL('')).hostname],
			}
		}];
		// Keep the service worker alive while the rule is active
		Zotero.Connector_Browser.setKeepServiceWorkerAlive(true);
		try {
			await browser.declarativeNetRequest.updateSessionRules({
				removeRuleIds: rules.map(r => r.id),
				addRules: rules,
			});
			// Automatically clean up the rule after 60 seconds in case the caller does not
			setTimeout(async () => {
				try {
					await Zotero.WebRequestIntercept.removeRuleDNR(ruleID);
				} catch (e) {
					Zotero.logError(e);
				}
			}, 60000);
			Zotero.debug(`HTTP: Added a DNR rule to change headers for ${url} to ${JSON.stringify(headers)}`);
		}
		catch (e) {
			Zotero.logError(e);
		}
		return ruleID;
	},
	
	removeRuleDNR: async function(ruleId) {
		Zotero.Connector_Browser.setKeepServiceWorkerAlive(false);
		return browser.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
	}
}

})();
