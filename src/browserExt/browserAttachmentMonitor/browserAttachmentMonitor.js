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
	},

	waitForAttachment: async function(tabId, timeoutMs=60000) {
		const ruleId = this._nextRuleId++;

		// Create promise that will resolve when attachment is found
		let resolveSucceeded;
		let rejectFailed;	
		const successPromise = new Promise((resolve, reject) => {
			resolveSucceeded = resolve;
			rejectFailed = reject;
		});

		// Setup message listener for success notification
		const messageListener = (message, sender) => {
			if (sender.tab.id === tabId 
				&& message.type === 'attachment-monitor-loaded'
				&& message.success) {
					Zotero.debug(`BrowserAttachmentMonitor: Attachment successfully loaded for tab: ${tabId}`);
					resolveSucceeded(message.success);
					this._cleanup(ruleId, messageListener, tabRemovedListener);
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
			await this._addDNRRule(tabId, ruleId);
			
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

		// Remove DNR rule
		if (ruleId) {
			await chrome.declarativeNetRequest.updateSessionRules({
				removeRuleIds: [ruleId]
			});
		}
	},
	
	_addDNRRule: async function(tabId, ruleId) {
		const redirectUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html#success=\\0");
		await chrome.declarativeNetRequest.updateSessionRules({
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
							values: ['application/pdf', 'application/epub+zip']
						}
					]
				}
			}]
		});
	}
};

// Initialize when the module loads
Zotero.BrowserAttachmentMonitor.init();