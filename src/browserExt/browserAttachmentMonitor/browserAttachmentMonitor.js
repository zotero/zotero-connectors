/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
					Vienna, Virginia, USA
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

Zotero.BrowserAttachmentMonitor = {
	_downloads: new Map(),
	_nextRuleId: 50000,
	
	init: function() {
		// browser.declarativeNetRequest.onRuleMatchedDebug.addListener((details) => {
		// 	console.log("DNR rule matched:", details);
		// });
		this._webRequestListeners = new Map();
	},

	waitForAttachment: async function(tabId, url, timeoutMs=60000) {
		const ruleId = this._nextRuleId++;

		// Create promise that will resolve when attachment is found
		let resolveSucceeded;
		let rejectFailed;	
		const successPromise = new Promise((resolve, reject) => {
			resolveSucceeded = resolve;
			rejectFailed = reject;
		});

		// Setup message listener for success notification
		let hasRedirected = false
		const messageListener = (message, sender) => {
			if (sender.tab.id === tabId && message.type === 'attachment-monitor-loaded') {
				if (!message.success) {
					if (!hasRedirected) {
						browser.tabs.sendMessage(tabId, { type: 'redirect-attachment-monitor', url } );
						hasRedirected = true;
					}
					else {
						rejectFailed(new Error('Redirected back to browserAttachmentMonitor.html with no `success` hash param'));
					}
				}
				else {
					Zotero.debug(`BrowserAttachmentMonitor: Attachment successfully loaded for tab: ${tabId}`);
					resolveSucceeded(message.success);
					this._cleanup(ruleId, messageListener, tabRemovedListener);
				}
			}
		};

		// Setup tab removal listener for this specific tab
		const tabRemovedListener = (removedTabId) => {
			if (removedTabId === tabId) {
				this._cleanup(ruleId, messageListener, tabRemovedListener);
				rejectFailed(new Error(`Tab removed: ${tabId}`));
			}
		};
		browser.runtime.onMessage.addListener(messageListener);
		browser.tabs.onRemoved.addListener(tabRemovedListener);

		try {
			// Add DNR rule and wait for success or timeout
			if (Zotero.isFirefox) {
				await this._addWebRequestRule(tabId, ruleId);
			} else {
				await this._addDNRRule(tabId, ruleId);
			}
			
			return await Promise.race([
				successPromise,
				Zotero.Promise.delay(timeoutMs).then(() => { 
					Zotero.debug(`Attachment monitor timed out after ${timeoutMs} ms for tab: ${tabId}`);
					throw new Error('Attachment monitor timed out'); 
				})
			]);
		}
		finally {
			this._cleanup(ruleId, messageListener, tabRemovedListener);
		}
	},

	_cleanup: async function(ruleId, messageListener, tabRemovedListener) {
		// Remove listeners
		if (messageListener) {
			browser.runtime.onMessage.removeListener(messageListener);
		}
		if (tabRemovedListener) {
			browser.tabs.onRemoved.removeListener(tabRemovedListener);
		}

		// Remove web request listeners
		if (ruleId) {
			if (Zotero.isFirefox) {
				const listener = this._webRequestListeners.get(ruleId);
				if (listener) {
					browser.webRequest.onHeadersReceived.removeListener(listener);
				}
				this._webRequestListeners.delete(ruleId);
			}
			else {
				await browser.declarativeNetRequest.updateSessionRules({
					removeRuleIds: [ruleId]
				});
			}
		}
	},

	// Firefox does not support responseHeaders condition, so we use webRequestBlocking instead
	_addWebRequestRule: async function(tabId, ruleId) {
		const redirectUrlBase = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html");
	
		const listener = (details) => {
			let hasAttachmentDisposition = false;
			let hasCorrectContentType = false;
			
			const contentType = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-type')?.value;
			const contentDisposition = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-disposition')?.value;
	
			hasAttachmentDisposition = contentDisposition && contentDisposition.toLowerCase().includes('attachment');
			hasCorrectContentType = contentType && (['application/pdf', 'application/epub+zip'].some(type => contentType.toLowerCase().includes(type)));
	
			if (hasAttachmentDisposition || hasCorrectContentType) {
				const finalRedirectUrl = `${redirectUrlBase}#success=${details.url}`;
				return { redirectUrl: finalRedirectUrl };
			}
	
			// No redirect needed
			return {}; 
		};
	
		browser.webRequest.onHeadersReceived.addListener(
			listener,
			{ urls: ["<all_urls>"], 
				tabId: tabId,
				types: ["main_frame", "sub_frame"] 
			},
			["blocking", "responseHeaders"]
		);
		
		// Store listener for removal
		this._webRequestListeners.set(ruleId, listener);
		Zotero.debug(`BrowserAttachmentMonitor: Added listener for tab ${tabId} with ruleId ${ruleId}`);
	},
	
	_addDNRRule: async function(tabId, ruleId) {
		// responseHeaders are available on Chromium 128+, but there's no way to feature-guard
		// for it directly, but Promise.try was also added in the same version
		if (typeof Promise.try === "undefined") return;
		Zotero.debug(`BrowserAttachmentMonitor: Adding DNR rule for tab ${tabId} with ruleId ${ruleId}`);
		const redirectUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html#success=\\0");
		await browser.declarativeNetRequest.updateSessionRules({
			removeRuleIds: [ruleId],
			addRules: [{
				id: ruleId,
				action: {
					type: 'redirect',
					redirect: {
						regexSubstitution: redirectUrl
					}
				},
				condition: {
					// Need to explicitly specify main_frame, otherwise it is excluded
					resourceTypes: ['main_frame', 'sub_frame'],
					regexFilter: '.*',
					tabIds: [tabId],
					responseHeaders: [
						{
							header: 'content-disposition',
							values: ['*attachment*']
						},
						{
							header: 'content-type',
							values: ['application/pdf*', 'application/epub+zip*']
						}
					]
				}
			}]
		});
	}
};

// Initialize when the module loads
Zotero.BrowserAttachmentMonitor.init();