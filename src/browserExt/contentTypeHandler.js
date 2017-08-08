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

const url = require('url');

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
		
		let URI = url.parse(details.url);
		let contentType = details.responseHeadersObject['content-type'].split(';')[0];
		if (Zotero.ContentTypeHandler.cslContentTypes.has(contentType)) {
			return this.handleStyle(details);
		} else if (Zotero.Prefs.get('interceptKnownFileTypes') && 
				Zotero.ContentTypeHandler.importContentTypes.has(contentType)) {
			return this.handleImportContent(details);
		} else if (contentType == 'application/pdf') {
			setTimeout(() => Zotero.Connector_Browser.onPDFFrame(details.url, details.frameId, details.tabId));
		}
	},
	
	handleStyle: function(details) {
		Zotero.ContentTypeHandler.confirm(details, `Add citation style to Zotero?`)
			.then(function(response) {
				if (response.button == 1) {
					Zotero.debug(`ContentTypeHandler: Importing style ${details.url}`);
					Zotero.ContentTypeHandler.importFile(details, 'csl');
				}
			}
		);
		// Don't continue until we get confirmation
		return {redirectUrl: 'javascript:'};	
	},
	
	handleImportContent: function(details) {
		let hosts = Zotero.Prefs.get('allowedInterceptHosts');
		let isEnabledHost = hosts.indexOf(URI.host) != -1;
		if (isEnabledHost) {
			Zotero.debug(`ContentTypeHandler: Importing a file ${details.url}`);
			Zotero.ContentTypeHandler.importFile(details, 'import');
		} else {
			Zotero.ContentTypeHandler.confirm(details, `Import items from ${URI.host} into Zotero?<br/><br/>` +
				'You can manage automatic file importing in Zotero Connector preferences.',
				'Always allow for this site').then(function(response) {
				if (response.button == 1) {
					Zotero.debug(`ContentTypeHandler: Importing a file ${details.url}`);
					Zotero.ContentTypeHandler.importFile(details, 'import');
					if (!isEnabledHost && response.checkboxChecked) {
						hosts.push(URI.host);
					}
					Zotero.Prefs.set('allowedInterceptHosts', hosts);
				}
			});
		}
		return {redirectUrl: 'javascript:'};	
	},
	
	/**
	 * Handle confirmation prompt by sending a message to injected script and
	 * redirect to the URL if they click cancel
	 * @param details {Object} as provided by Zotero.WebRequestsInterceptor
	 * @param message {String} confirmation message to display
	 * @param checkboxText {String} optional checkbox text
	 * @returns {Promise{Boolean}} whether user clicked OK or Cancel
	 */
	confirm: function(details, message, checkboxText="") {
		let deferred = Zotero.Promise.defer();
		chrome.tabs.get(details.tabId, function(tab) {
			// Make sure the scripts to handle the confirmation box are injected
			Zotero.Connector_Browser.injectTranslationScripts(tab).then(function() {
				var props = {message};
				if (checkboxText.length) {
					props = {
						message,
						checkbox: true,
						checkboxText
					}
				}	
				return Zotero.Messaging.sendMessage('confirm', props, tab)
			}).then(function(response) {
				// If captured URL was pasted on about:blank or other browser pages they respond immediately
				// with undefined which we treat as cancel here
				if (!response) {
					response = {button: 2}
				}
				if (!response.button || response.button == 2) {
					Zotero.ContentTypeHandler.ignoreURL.add(details.url);
					// Ignore the next request to this url and redirect
					chrome.tabs.update(tab.id, {url: details.url});
				}
				deferred.resolve(response);
			});	
		});	
		
		return deferred.promise;
	},
	
	/**
	 * Send an XHR request to retrieve and import the file into Standalone
	 */
	importFile: function(details, type) {
		chrome.tabs.get(details.tabId, function(tab) {
			// Make sure scripts injected so we can display the progress window
			Zotero.Connector_Browser.injectTranslationScripts(tab).then(function() {
				Zotero.Messaging.sendMessage('progressWindow.show', type == 'csl' ? 'Installing Style' : 'Importing', tab);
			
				var xhr = new XMLHttpRequest();
				// If the original request method was POST, this is likely to fail, because
				// we do not send the request body. For discussion see
				// https://github.com/zotero/zotero-connectors/pull/59#discussion_r93317639
				xhr.open(details.method, details.url);
				xhr.onreadystatechange = function() {
					if(xhr.readyState !== 4) return;
					
					if (this.status < 200 || this.status >= 400) {
						throw Error(`IMPORT: Retrieving ${details.url} failed with status ${this.status}.\nResponse body:\n${this.responseText}`);
					}
					let options = { headers: {"Content-Type": this.getResponseHeader('Content-Type')} };
					if (type == 'csl') {
						options.method = 'installStyle';
						options.queryString = 'origin=' + encodeURIComponent(details.url);
						return Zotero.Connector.callMethod(options, this.response).then(function(result) {
							Zotero.Messaging.sendMessage('progressWindow.itemProgress',
								[chrome.extension.getURL('images/csl-style.png'), result.name, null, 100], tab);
							return Zotero.Messaging.sendMessage('progressWindow.done', [true], tab);
						}, function(e) {
							if (e.status == 404) {
								return Zotero.Messaging.sendMessage('progressWindow.done',
									[false, 'upgradeClient'], tab);
							} else {
								return Zotero.Messaging.sendMessage('progressWindow.done',
									[false, 'clientRequired'], tab);
							}
						});
					} else {
						options.method = 'import';
						return Zotero.Connector.callMethod(options, this.response).then(function(result) {
							Zotero.Messaging.sendMessage('progressWindow.show', 
								`Imported ${result.length} item` + (result.length > 1 ? 's' : ''), tab);
							for (let i = 0; i < result.length && i < 20; i++) {
								let item = result[i];
								Zotero.Messaging.sendMessage('progressWindow.itemProgress',
									[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, null, 100], tab);
							}
							Zotero.Messaging.sendMessage('progressWindow.done', [true], tab);
						}, function(e) {
							if (e.status == 404) {
								return Zotero.Messaging.sendMessage('progressWindow.done',
									[false, 'upgradeClient'], tab);
							}
							else if (e.status < 200 || status >= 400) {
								return Zotero.Messaging.sendMessage('progressWindow.done',
									[false, 'clientRequired'], tab);
							}
						});
					}
				};
				xhr.send();		
			});
		});
		
	}
};
})();