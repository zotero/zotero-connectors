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
 * Intercepts web requests and offers to import Zotero-recognised resources into the client.
 * 
 * Includes CSL styles, RIS, BibTeX and Refer files
 */

(function() {

"use strict";

Zotero.ContentTypeHandler = {
	cslContentTypes: new Set(["application/vnd.citationstyles.style+xml", "text/x-csl"]),
	importContentTypes: new Set([
		"application/x-endnote-refer", "application/x-research-info-systems",
		"application/x-inst-for-scientific-info",
		"text/x-bibtex", "application/x-bibtex",
		// Non-standard
		"text/x-research-info-systems",
		"text/application/x-research-info-systems", // Nature serves this
		"text/ris", // Cell serves this
		"ris" // Not even trying
	]),
	mv3CSLWhitelistRegexp: {
		"https://www.zotero.org/styles/\\1": /https?:\/\/(?:www\.)zotero\.org\/styles\/?#importConfirm=(.*)$/,
		"https://raw.githubusercontent.com/\\1/\\2": /https?:\/\/github\.com\/([^/]*\/[^/]*)\/[^/]*\/([^.]*.csl)#importConfirm$/,
		"https://gitee.com/\\1/raw/\\2": /https?:\/\/gitee\.com\/([^/]+\/[^/]+)\/blob\/(.+\.csl)#importConfirm$/
	},
	ignoreURL: new Set(),
	
	init: function() {
		if (Zotero.isManifestV3) {
			chrome.declarativeNetRequest.updateEnabledRulesets({
				disableRulesetIds: ['styleIntercept']
			});
		}
	},

	enable: function() {
		Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.ContentTypeHandler.onHeadersReceived);
		if (Zotero.isManifestV3) {
			chrome.declarativeNetRequest.updateEnabledRulesets({
				enableRulesetIds: ['styleIntercept']
			});
		}
	},
	
	disable: function() {
		Zotero.WebRequestIntercept.removeListener('headersReceived', Zotero.ContentTypeHandler.onHeadersReceived);
		if (Zotero.isManifestV3) {
			chrome.declarativeNetRequest.updateEnabledRulesets({
				disableRulesetIds: ['styleIntercept']
			});
		}
	},

	onHeadersReceived: function (details) {
		// Only attempt intercepting GET requests. To do others we need to cache requestBody on
		// onBeforeSend, which is likely to kill performance.
		if (!details.responseHeadersObject['content-type'] || details.method != "GET") return;
		if (Zotero.ContentTypeHandler.ignoreURL.has(details.url)) {
			// Ignore url when user cancels 
			Zotero.ContentTypeHandler.ignoreURL.delete(details.url);
			return;
		}

		const contentType = details.responseHeadersObject['content-type'].split(';')[0];
		if (Zotero.isManifestV3) {
			for (let destination in Zotero.ContentTypeHandler.mv3CSLWhitelistRegexp) {
				const regexp = Zotero.ContentTypeHandler.mv3CSLWhitelistRegexp[destination];
				let match = details.url.match(regexp);
				if (match) {
					match.forEach((m, index) => {
						if (index === 0) return;
						destination = destination.replace(`\\${index}`, m);
					});
					(async () => {
						if (await Zotero.ContentTypeHandler._shouldImportStyle(details.tabId)) {
							await Zotero.ContentTypeHandler.importFile(destination, details.tabId, 'csl');
						}
						else {
							await Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, destination);
						}
					})();
					return;
				}
			}
			return;
		}
		if (Zotero.ContentTypeHandler._isImportableStyle(details.url, contentType)) {
			// We are in a blocking handler, and we need to return a navigation cancelling object,
			// but we need to do more stuff afterwards
			(async () => {
				if (await Zotero.ContentTypeHandler._shouldImportStyle(details.tabId)) {
					await Zotero.ContentTypeHandler.importFile(details.url, details.tabId, 'csl');
				}
				else {
					await Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, details.url);
				}
			})();
			return Zotero.ContentTypeHandler._cancelWebNavigation();
		}
		else if (Zotero.ContentTypeHandler._isImportableContent(contentType)) {
			(async () => {
				if (await Zotero.ContentTypeHandler._shouldImportContent(details.url, details.tabId)) {
					await Zotero.ContentTypeHandler.importFile(details.url, details.tabId, 'import');
				}
				else {
					await Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, details.url);
				}
			})();
			return Zotero.ContentTypeHandler._cancelWebNavigation();
		}
	},

	_isImportableStyle: function (url, contentType) {
		// Offer to install CSL by Content-Type
		if (Zotero.ContentTypeHandler.cslContentTypes.has(contentType)) {
			return true;
		}
		// Offer to install CSL if URL path ends with .csl and host is allowed
		else if (/\.csl$/i.test(url)) {
			let hosts = Zotero.Prefs.get('allowedCSLExtensionHosts');
			if (Array.isArray(hosts) && hosts.some(host => new RegExp(host).test(url))) {
				return true;
			}
		}
		return false
	},

	_shouldImportStyle: async function(tabId) {
		if (!(await Zotero.Connector.checkIsOnline())) return false
		let response = await Zotero.ContentTypeHandler.confirm(`Add citation style to Zotero?`, tabId)
		return response && response.button === 1;
	},

	_isImportableContent: function(contentType) {
		return Zotero.Prefs.get('interceptKnownFileTypes') && Zotero.ContentTypeHandler.importContentTypes.has(contentType)
	},

	_shouldImportContent: async function(url, tabId) {
		if (!(await Zotero.Connector.checkIsOnline())) return false;
		const URI = new URL(url);
		const hosts = Zotero.Prefs.get('allowedInterceptHosts');
		const isEnabledHost = hosts.indexOf(URI.host) != -1;
		if (isEnabledHost) {
			return true;
		} else {
			let response = await Zotero.ContentTypeHandler.confirm(`Import items from ${URI.host} into Zotero?<br/><br/>` +
				'You can manage automatic file importing in Zotero Connector preferences.', tabId,
				'Always allow for this site')
			if (response && response.button == 1) {
				if (!isEnabledHost && response.checkboxChecked) {
					hosts.push(URI.host);
				}
				Zotero.Prefs.set('allowedInterceptHosts', hosts);
				return true;
			}
		}
	},
	
	// Return this for a blocked webNavigation when showing a confirmation dialog
	_cancelWebNavigation: function() {
		if (Zotero.isFirefox) {
			// Chrome redirects to a blank page on cancel, firefox opens an empty tab on redirect to `javascript:`
			return { cancel: true };
		}
		return {redirectUrl: 'javascript:'};
	},
	
	_redirectToOriginal: async function(tabId, url) {
		if (Zotero.isManifestV3) {
			await chrome.declarativeNetRequest.updateEnabledRulesets({
				disableRulesetIds: ['styleIntercept']
			});
			(async () => {
				await Zotero.Promise.delay(2000);
				chrome.declarativeNetRequest.updateEnabledRulesets({
					enableRulesetIds: ['styleIntercept']
				});
			})();
		}
		Zotero.ContentTypeHandler.ignoreURL.add(url);
		// Ignore the next request to this url and redirect
		browser.tabs.update(tabId, {url});
	},
	
	_sendMessageAndHandleBlankPage: async function(message, props, tab) {
		const confirmURL = browser.runtime.getURL(`confirm.html`);
		try {
			var response = await Zotero.Messaging.sendMessage(message, props, tab);
		} catch (e) {}
		// If captured URL was pasted on about:blank or other browser pages the response is immediate
		// with undefined and means we cannot inject and display the UI, so we need to redirect to a page
		// where we can do it
		if (typeof response === "undefined" && tab.url != confirmURL) {
			await new Zotero.Promise(function(resolve, reject) {
				browser.tabs.onUpdated.addListener(async function getResponse(tabId, changeInfo, tab) {
					try {
						if (changeInfo.status == 'complete' && tab.url == confirmURL) {
							browser.tabs.onUpdated.removeListener(getResponse);
							resolve();
						}
					} catch (e) {
						reject(e);
					}
				});
				browser.tabs.update(tab.id, {url: confirmURL});
			});
			tab = await browser.tabs.get(tab.id);
			return this._sendMessageAndHandleBlankPage(message, props, tab);
		}
		else if (typeof response === "undefined") {
			throw new Error('Could not navigate blank page to an internal Zotero page for import UI')
		}
		return response;
	},
	
	/**
	 * Handle confirmation prompt by sending a message to injected script and
	 * redirect to the URL if they click cancel
	 * @param message {String} confirmation message to display
	 * @param tabId {Number}
	 * @param checkboxText {String} optional checkbox text
	 * @returns {Promise{Boolean}} whether user clicked OK or Cancel
	 */
	confirm: async function(message, tabId, checkboxText="") {
		let tab = await browser.tabs.get(tabId);
		if (Zotero.isManifestV3) {
			await Zotero.Connector_Browser.waitForTabToLoad(tab);
		}
		
		var props = {message};
		if (checkboxText.length) {
			props = {
				message,
				checkbox: true,
				checkboxText
			}
		}
		return this._sendMessageAndHandleBlankPage('confirm', props, tab);
	},
	
	/**
	 * Send an XHR request to retrieve and import the file into Standalone
	 */
	importFile: async function(url, tabId, type) {
		var sessionID = Zotero.Utilities.randomString();
		var headline = type == 'csl' ? 'Installing Style' : null;
		var readOnly = type == 'csl';
		var tab = await browser.tabs.get(tabId);
		this._sendMessageAndHandleBlankPage('progressWindow.show', [sessionID, headline, readOnly], tab);
	
		let response = await fetch(url);
		let responseText = await response.text();
		if (response.status < 200 || response.status >= 400) {
			throw Error(`IMPORT: Retrieving ${url} failed with status ${response.status}.\nResponse body:\n${responseText}`);
		}
		let options = {
			headers: {
				"Content-Type": response.headers.get('Content-Type')
			}
		};
		// Style installation
		if (type == 'csl') {
			options.method = 'installStyle';
			options.queryString = 'origin=' + encodeURIComponent(url);
			try {
				let result = await Zotero.Connector.callMethod(options, responseText);
				Zotero.Messaging.sendMessage(
					'progressWindow.itemProgress',
					{
						id: null,
						iconSrc: browser.runtime.getURL('images/csl-style.png'),
						title: result.name,
						progress: 100
					},
					tab
				);
				return Zotero.Messaging.sendMessage('progressWindow.done', [true], tab);
			}
			catch(e) {
				return Zotero.Messaging.sendMessage('progressWindow.done',
					[false, 'clientRequired'], tab);
			}
		}
		// RIS/BibTeX import
		else {
			options.method = 'import';
			options.queryString = `session=${sessionID}`;
			try {
				let result = await Zotero.Connector.callMethod(options, responseText);
				Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID }, tab);
				for (let i = 0; i < result.length && i < 20; i++) {
					let item = result[i];
					Zotero.Messaging.sendMessage(
						'progressWindow.itemProgress',
						{
							id: null,
							iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
							title: item.title,
							progress: 100
						},
						tab
					);
				}
				Zotero.Messaging.sendMessage('progressWindow.done', [true], tab);
			}
			catch(e) {
				let err = 'clientRequired';
				if (e.status == 500 && e.value && e.value.libraryEditable === false) {
					err = 'collectionNotEditable';
				}
				return Zotero.Messaging.sendMessage('progressWindow.done', [false, err], tab);
			}
		}
	}
};
})();