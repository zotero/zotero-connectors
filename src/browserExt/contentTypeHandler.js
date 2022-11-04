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
	ignoreURL: new Set(),

	enable: function() {
		Zotero.WebRequestIntercept.addListener('headersReceived', Zotero.ContentTypeHandler.observe);
	},
	
	disable: function() {
		Zotero.WebRequestIntercept.removeListener('headersReceived', Zotero.ContentTypeHandler.observe);
	},

	observe: function(details) {
		// Only attempt intercepting GET requests. To do others we need to cache requestBody on
		// onBeforeSend, which is likely to kill performance.
		if (!details.responseHeadersObject['content-type'] || details.method != "GET") return;
		if (Zotero.ContentTypeHandler.ignoreURL.has(details.url)) {
			// Ignore url when user cancels 
			Zotero.ContentTypeHandler.ignoreURL.delete(details.url);
			return;
		}

		let contentType = details.responseHeadersObject['content-type'].split(';')[0];
		if (Zotero.isManifestV3) {
			let match = details.url.match(/https?:\/\/(?:www\.)zotero\.org\/styles\/?#importConfirm=(.*)$/);
			if (match) {
				return Zotero.ContentTypeHandler.handleStyle(details, `https://www.zotero.org/styles/${match[1]}`);
			}
			return;
		}
		else {
			// Offer to install CSL by Content-Type
			if (Zotero.ContentTypeHandler.cslContentTypes.has(contentType)) {
				return Zotero.ContentTypeHandler.handleStyle(details);
			}
		}
		// Offer to install CSL if URL path ends with .csl and host is allowed
		if (details.url.match(/https:\/\/[^/]+\/[^?]+\.csl(\?|$)/)) {
			let host = details.url.match(/https:\/\/([^/]+)\//)[1];
			let hosts = Zotero.Prefs.get('allowedCSLExtensionHosts');
			if (Array.isArray(hosts) && hosts.includes(host)) {
				return Zotero.ContentTypeHandler.handleStyle(details);
			}
		}
		if (Zotero.Prefs.get('interceptKnownFileTypes')
				&& Zotero.ContentTypeHandler.importContentTypes.has(contentType)) {
			return Zotero.ContentTypeHandler.handleImportContent(details);
		}
		if (contentType == 'application/pdf') {
			if (details.frameId != 0) {
				setTimeout(() => Zotero.Connector_Browser.onPDFFrame(details.url, details.frameId, details.tabId));
			}
			return;
		}
	},

	handleStyle: function(details, styleUrl) {
		styleUrl = styleUrl || details.url;
		(async () => {
			if (!(await Zotero.Connector.checkIsOnline())) return;
			try {
				let response = await Zotero.ContentTypeHandler.confirm(details, `Add citation style to Zotero?`)
				if (response && response.button == 1) {
					Zotero.debug(`ContentTypeHandler: Importing style ${styleUrl}`);
					await Zotero.ContentTypeHandler.importFile({ tabId: details.tabId, url: styleUrl }, 'csl');
				}
				else {
					await Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, styleUrl);
				}
			} catch (e) {
				Zotero.logError(e);
				await Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, styleUrl);
			}
		})();
		if (!Zotero.isManifestV3) {
			// Don't continue until we get confirmation
			if (Zotero.isFirefox) {
				// Chrome redirects to a blank page on cancel, firefox opens an empty tab on redirect to `javascript:`
				return { cancel: true };
			}
			return {redirectUrl: 'javascript:'};
		}
	},
	
	handleImportContent: function(details) {
		(async () => {
			if (!(await Zotero.Connector.checkIsOnline())) return;
			let URI = new URL(details.url);
			let hosts = Zotero.Prefs.get('allowedInterceptHosts');
			let isEnabledHost = hosts.indexOf(URI.host) != -1;
			if (isEnabledHost) {
				Zotero.debug(`ContentTypeHandler: Importing a file ${details.url}`);
				await Zotero.ContentTypeHandler.importFile(details, 'import');
			} else {
				Zotero.ContentTypeHandler.confirm(details, `Import items from ${URI.host} into Zotero?<br/><br/>` +
					'You can manage automatic file importing in Zotero Connector preferences.',
					'Always allow for this site').then(function(response) {
					if (response && response.button == 1) {
						Zotero.debug(`ContentTypeHandler: Importing a file ${details.url}`);
						Zotero.ContentTypeHandler.importFile(details, 'import');
						if (!isEnabledHost && response.checkboxChecked) {
							hosts.push(URI.host);
						}
						Zotero.Prefs.set('allowedInterceptHosts', hosts);
					}
					else if (!Zotero.isManifestV3) {
						Zotero.ContentTypeHandler._redirectToOriginal(details.tabId, details.url);
					}
				});
			}
		})();
		if (!Zotero.isManifestV3) {
			// Don't continue until we get confirmation
			if (Zotero.isFirefox) {
				// Chrome redirects to a blank page on cancel, firefox opens an empty tab on redirect to `javascript:`
				return { cancel: true };
			}
			return {redirectUrl: 'javascript:'};
		}
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
	
	/**
	 * Handle confirmation prompt by sending a message to injected script and
	 * redirect to the URL if they click cancel
	 * @param details {Object} as provided by Zotero.WebRequestsInterceptor
	 * @param message {String} confirmation message to display
	 * @param checkboxText {String} optional checkbox text
	 * @returns {Promise{Boolean}} whether user clicked OK or Cancel
	 */
	confirm: async function(details, message, checkboxText="") {
		let tab = await browser.tabs.get(details.tabId);
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
		let confirmURL = browser.runtime.getURL(`confirm.html`);
		try {
			var response = await Zotero.Messaging.sendMessage('confirm', props, tab);
		} catch (e) {}
		// In MV2: If captured URL was pasted on about:blank or other browser pages the response is immediate
		// with undefined and means we cannot inject and display the UI, so we have to do some additional work
		if (!response && tab.url != confirmURL) {
			var responsePromise = new Zotero.Promise(function(resolve, reject) {
				browser.tabs.onUpdated.addListener(async function getResponse(tabId, changeInfo, tab) {
					try {
						if (changeInfo.status == 'complete' && tab.url == confirmURL) {
							let response = await Zotero.ContentTypeHandler.confirm(details, message, checkboxText);
							browser.tabs.onUpdated.removeListener(getResponse);
							resolve(response);
						}
					} catch (e) {
						reject(e);
					}
				});
				browser.tabs.update(tab.id, {url: confirmURL});
			});
			response = await responsePromise;
		} else if (!response) {
			throw new Error('Cannot confirm whether user wants do download the file')
		}

		return response;
	},
	
	/**
	 * Send an XHR request to retrieve and import the file into Standalone
	 */
	importFile: async function(details, type) {
		var sessionID = Zotero.Utilities.randomString();
		var headline = type == 'csl' ? 'Installing Style' : null;
		var readOnly = type == 'csl';
		var tab = await browser.tabs.get(details.tabId);
		Zotero.Messaging.sendMessage('progressWindow.show', [sessionID, headline, readOnly], tab);
	
		let response = await fetch(details.url);
		let responseText = await response.text();
		if (response.status < 200 || response.status >= 400) {
			throw Error(`IMPORT: Retrieving ${details.url} failed with status ${response.status}.\nResponse body:\n${responseText}`);
		}
		let options = {
			headers: {
				"Content-Type": response.headers.get('Content-Type')
			}
		};
		// Style installation
		if (type == 'csl') {
			options.method = 'installStyle';
			options.queryString = 'origin=' + encodeURIComponent(details.url);
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
				if (e.status == 404) {
					return Zotero.Messaging.sendMessage('progressWindow.done',
						[false, 'upgradeClient'], tab);
				} else {
					return Zotero.Messaging.sendMessage('progressWindow.done',
						[false, 'clientRequired'], tab);
				}
			}
		}
		// RIS/BibTeX import
		else {
			options.method = 'import';
			options.queryString = `session=${sessionID}`;
			try {
				let result = await Zotero.Connector.callMethod(options, responseText);
				Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
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
				if (e.status == 404) {
					err = 'upgradeClient';
				}
				else if (e.status == 500 && e.value && e.value.libraryEditable === false) {
					err = 'collectionNotEditable';
				}
				return Zotero.Messaging.sendMessage('progressWindow.done', [false, err], tab);
			}
		}
	}
};
})();