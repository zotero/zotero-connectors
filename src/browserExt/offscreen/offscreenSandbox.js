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

/*
 * A Chrome sandbox iframe that is embedded in an offscreen page. Is allowed to run evals and
 * as such handles translate. This script mainly initializes APIs and messaging.
 */
Zotero.OffscreenSandbox = {
	initialized: false,

	async init(serviceWorkerPort) {
		if (this.initialized) {
			await this.initMessaging(serviceWorkerPort);
			this.sendMessage('offscreen-sandbox-initialized');
			Zotero.debug('OffscreenSandbox: reinitialized');
		}
		this.initialized = true;

		Zotero.Debug.init();
		Zotero.debug('OffscreenSandbox: initializing');
		await this.initMessaging(serviceWorkerPort);
		Zotero.OffscreenTranslate.init();
		await Zotero.initOffscreen();
		this.sendMessage('offscreen-sandbox-initialized');
		Zotero.debug('OffscreenSandbox: initialized');
	},
	
	async initMessaging(serviceWorkerPort) {
		Zotero.debug('OffscreenSandbox: initializing messaging');
		let messagingOptions = {
			functionOverrides: OFFSCREEN_BACKGROUND_OVERRIDES,
			overrideTarget: Zotero
		}
		await new Promise((resolve) => {
			// The service worker will send us a message to confirm established communication
			serviceWorkerPort.onmessage = resolve;
			serviceWorkerPort.postMessage('offscreen-sandbox-awaiting-service-worker-connection');
		})
		messagingOptions.sendMessage = (...args) => {
			serviceWorkerPort.postMessage(args)
		};
		messagingOptions.addMessageListener = (fn) => {
			serviceWorkerPort.onmessage = (e) => fn(e.data);
		};
		if (this._messaging) {
			this._messaging.reinit(messagingOptions);
		}
		else {
			this._messaging = new Zotero.MessagingGeneric(messagingOptions);
		}
		Zotero.debug('OffscreenSandbox: messaging with background service worker established');
	},
	
	async sendMessage(message, payload) {
		return this._messaging.sendMessage(message, payload);
	},
	
	async addMessageListener(message, listener) {
		this._messaging.addMessageListener(message, listener);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	// Let the parent know that we're ready to communicate/receive messaging port
	console.log("OffscreenSandbox: letting offscreen know we're ready");
	window.parent.postMessage('offscreen-sandbox-ready', "*")
});
window.addEventListener('message', (e) => {
	if (e.data === "offscreen-port") {
		Zotero.OffscreenSandbox.init(e.ports[0])
	}
})