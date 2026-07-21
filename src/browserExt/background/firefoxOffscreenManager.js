/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 Corporation for Digital Scholarship
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

/**
 * Offscreen translate host manager for Firefox MV2 (with direct "sandboxed"
 * frame).
 *
 * Content scripts talk to Zotero.OffscreenManager through regular
 * extension messaging. This manager forwards those translate RPCs over the
 * MessageChannel established by Zotero.Frame.
 *
 */
Zotero.OffscreenManager = {
	initialized: false,
	messagingDeferred: null,
	frame: null,
	frameUrl: 'translateHost/translateHost.html',

	async init() {
		if (this.initialized) return;
		if (this.messagingDeferred) return this.messagingDeferred.promise;

		this.messagingDeferred = Zotero.Promise.defer();
		try {
			await this._initFrame();

			browser.tabs.onRemoved.addListener((tabId) => {
				this.sendMessage('tabClosed', [tabId]);
			});

			setInterval(() => this.cleanup(), 15 * 60e3);
			this.initialized = true;
			this.messagingDeferred.resolve();
		}
		catch (e) {
			this.messagingDeferred.reject(e);
			this.messagingDeferred = null;
			throw e;
		}
	},

	async sendMessage(message, payload, tab, frameId) {
		if (!this.initialized) {
			await this.init();
		}
		if (tab) {
			payload.push(tab.id, frameId);
		}
		return await this._messaging.sendMessage(message, payload);
	},

	async addMessageListener(...args) {
		if (!this.initialized) {
			await this.init();
		}
		return this._messaging.addMessageListener(...args);
	},

	async cleanup() {
		if (!this.initialized) return false;
		let tabs = await browser.tabs.query({ status: 'complete', windowType: 'normal' });
		let cleanedUpTabIds = await this.sendMessage('translateCleanup', tabs.map(tab => tab.id));
		if (cleanedUpTabIds.length > 0) {
			Zotero.logError(new Error(`FirefoxOffscreenManager: manually cleaned up translates that were kept `
				+ `alive after onTabRemoved ${JSON.stringify(cleanedUpTabIds)}`));
		}
	},

	async _initFrame() {
		Zotero.debug('FirefoxOffscreenManager: creating sandboxed translate host iframe');
		this.frame = new Zotero.Frame({
			src: browser.runtime.getURL(this.frameUrl),
			sandbox: 'allow-scripts'
		}, {}, {
			expectedHandshake: 'offscreen-translate-host-frame-ready',
			handlerFunctionOverrides: TRANSLATE_HOST_FUNCTIONS,
			overrideTarget: Zotero
		});
		await this.frame.init();
		Zotero.debug('FirefoxOffscreenManager: sandboxed translate host iframe messaging established');
		this._messaging = this.frame;

		Zotero.debug('FirefoxOffscreenManager: initializing translate host');
		let initializedPromise = this._messaging.sendMessage('offscreen-translate-host-init');
		let timeoutPromise = new Promise((resolve, reject) => {
			setTimeout(() => reject(new Error('FirefoxOffscreenManager: timed out waiting for translate host initialization')), 10000);
		});
		await Promise.race([initializedPromise, timeoutPromise]);
		Zotero.debug('FirefoxOffscreenManager: translate host initialized');
	}
};
