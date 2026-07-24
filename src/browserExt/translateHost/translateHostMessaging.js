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
 * A browser-extension iframe that is allowed to run evals and handles translation.
 * In Chrome MV3 it is embedded in an offscreen page; in Firefox MV2 it is embedded in the
 * background page. This script mainly initializes APIs and messaging.
 */
Zotero.TranslateHostMessaging = {
	initialized: false,

	async initMV3(backgroundPort) {
		Zotero.debug('TranslateHostMessaging: initializing for MV3')
		await this.initMessaging(backgroundPort);
		if (this.initialized) {
			this.sendMessage('offscreen-translate-host-manager-initialized');
			Zotero.debug('TranslateHostMessaging: reinitialized');
			return;
		}
		await this.initTranslateHost();
		this.sendMessage('offscreen-translate-host-manager-initialized');
		Zotero.debug('TranslateHostMessaging: initialized');
	},

	async initMV2(backgroundPort) {
		// Authenticate the MessageChannel with the nonce added to our URL by Zotero.Frame
		let nonce = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null;
		backgroundPort.postMessage(nonce);

		await this.initMessaging(backgroundPort);
		// offscreenManager requests translate host initialization
		this.addMessageListener('offscreen-translate-host-init', () => this.initTranslateHost());
	},

	async initTranslateHost() {
		if (this.initialized) {
			Zotero.debug('TranslateHostMessaging: translate host already initialized');
			return;
		}
		this.initialized = true;

		Zotero.Debug.init();
		Zotero.debug('TranslateHostMessaging: initializing');
		Zotero.OffscreenTranslateHost.init();
		await Zotero.initTranslateHost();
		Zotero.debug('TranslateHostMessaging: initialized');
	},

	async initMessaging(serviceWorkerPort) {
		Zotero.debug('TranslateHostMessaging: initializing messaging');
		let messagingOptions = {
			functionOverrides: TRANSLATE_HOST_FUNCTIONS,
			overrideTarget: Zotero,
			sendMessage: (...args) => {
				serviceWorkerPort.postMessage(args)
			},
			addMessageListener: (fn) => {
				serviceWorkerPort.onmessage = (e) => fn(e.data);
			}
		}
		if (this._messaging) {
			this._messaging.reinit(messagingOptions);
		}
		else {
			this._messaging = new Zotero.MessagingGeneric(messagingOptions);
		}
		Zotero.debug('TranslateHostMessaging: messaging with background established');
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
	console.log("TranslateHostMessaging: letting offscreen know we're ready");
	window.parent.postMessage('offscreen-translate-host-ready', "*")
});
window.addEventListener('message', (e) => {
	if (e.data === "offscreen-port") {
		Zotero.TranslateHostMessaging.initMV3(e.ports[0])
	}
	else if (e.data === "zoteroChannel") {
		Zotero.TranslateHostMessaging.initMV2(e.ports[0])
	}
})