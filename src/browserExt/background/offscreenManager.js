/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
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
 * Part of the MV3 service worker. Manages the offscreen page and proxies
 * TranslateHostFrameManager operations to it.
 */
Zotero.OffscreenManager = {
	offscreenPageInitialized: false,
	messagingDeferred: Zotero.Promise.defer(),
	offscreenUrl: 'offscreen/offscreen.html',
	
	async init() {
		const offscreenPage = await this.getOffscreenPage();
		if (!offscreenPage) {
			// Make sure we're waiting for a new deferred
			this.messagingDeferred = Zotero.Promise.defer();
			// Create offscreen document
			await browser.offscreen.createDocument({
				url: this.offscreenUrl,
				reasons: ['DOM_PARSER'],
				justification: 'Running Zotero Translators in isolated frames',
			});
		}
		else {
			// Technically the service worker can restart without the offscreen
			// page being unloaded per Chrome docs, although not clear whether this would actually happen in practice.
			offscreenPage.postMessage('service-worker-restarted');
		}
		await this.messagingDeferred.promise;
		
		// Only need to set the below up once
		if (this.offscreenPageInitialized) return;
		this.offscreenPageInitialized = true;

		// Watch for browserext event of tab close and inform the offscreen page translate
		browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
			Zotero.TranslateHostFrameManager.destroyFramesForTab(tabId);
		});
		
		// Run cleanup every 15min
		setInterval(() => this.cleanup(), 15*60e3);
		Zotero.debug('OffscreenManager: translate host frame manager initialized');
	},

	/**
	 * tabs.onRemoved handler should make sure offscreen doesn't hold translate frames
	 * that are dead and moreover the offscreen page should get killed every now and then by the browser,
	 * but we want to be extra sure we're not leaking memory
	 */
	async cleanup() {
		const offscreenPage = await this.getOffscreenPage();
		if (!offscreenPage) return false;
		let tabs = await browser.tabs.query({status: "complete", windowType: "normal"});
		let cleanedUpTabIds = await Zotero.TranslateHostFrameManager.cleanup(tabs.map(tab => tab.id));
		if (cleanedUpTabIds.length > 0) {
			Zotero.logError(new Error(`OffscreenManager: manually cleaned up frames that were kept `
				+ `alive after tabs.onRemoved ${JSON.stringify(cleanedUpTabIds)}`));
		}
	},
	
	async getOffscreenPage() {
		const matchedClients = await self.clients.matchAll();
		return matchedClients.find(client => client.url.includes(this.offscreenUrl));
	}
}

// Listener needs to be added at worker script initialization
self.onmessage = async (e) => {
	if (e.data === 'offscreen-port') {
		Zotero.debug('OffscreenManager: received the offscreen page port')
		let messagingOptions = {
			functionOverrides: FRAME_MANAGER_MESSAGE_FUNCTIONS,
			handlerFunctionOverrides: FRAME_MANAGER_FUNCTIONS,
			overrideTarget: Zotero,
		}
		messagingOptions.sendMessage = (...args) => {
			e.ports[0].postMessage(args)
		};
		messagingOptions.addMessageListener = (fn) => {
			e.ports[0].onmessage = (e) => fn(e.data);
		};
		// If the offscreen document got killed by the browser and we restarted it
		// we only need to set sendMessage, otherwise previously added message listeners
		// will get discarded
		if (Zotero.OffscreenManager._messaging) {
			Zotero.OffscreenManager._messaging.reinit(messagingOptions);
		}
		else {
			Zotero.OffscreenManager._messaging = new Zotero.MessagingGeneric(messagingOptions);
		}
		Zotero.OffscreenManager._messaging.addMessageListener(
			'TranslateHostFrameManager.initialized',
			() => {
				Zotero.debug('OffscreenManager: offscreen translate host frame manager initialized');
				Zotero.OffscreenManager.messagingDeferred.resolve();
			}
		);
		Zotero.debug('OffscreenManager: messaging initialized')
	}
}
