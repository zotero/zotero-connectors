/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Center for History and New Media
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
 * Orchestrates the translate sandbox, not to be confused with TranslationSandbox (which is mostly
 * a glorified eval closure these days).
 * Chrome's MV3 disallows evals which means that we would need to bundle our translators
 * with the extension and have to release translator updates via the chrome store.
 *
 * That is an untenable situation for us, but that's fine, because our translators do not need
 * elevated permissions plus all our translators are reviewed by trusted parties. So we use the
 * chrome sandbox to eval their code and run them on the doc HTML passed from the content script
 * and parsed with the DOM parser. This also allows us to serve translator code
 * via Zotero or from the Zotero translator repo and update it as needed without releasing new extension
 * code.
 */
Zotero.TranslateSandbox = {
	translate: null,
	selectCallbacks: {},
	init: async function() {
		// Messaging from low-privilege chrome sandbox page to high-privilege
		// extension content-script.
		this.messaging = new Zotero.MessagingGeneric({
			sendMessage: 'frame',
			addMessageListener: 'frame',
			functionOverrides: CONTENT_SCRIPT_FUNCTION_OVERRIDES,
		});
		// Add a translate initializing method
		this.messaging.addMessageListener('Translate.new', () => {
			this.translate = new Zotero.Translate.Web();
		});
		// Default passthrough handlers for translate methods
		for (let method in Zotero.Translate.Web.prototype) {
			this.messaging.addMessageListener(`Translate.${method}`, (args) => {
				if (!this.translate) {
					throw new Error('Zotero Translate Sandbox: Translate method called without first calling `Translate.new`');
				}
				return this.translate[method](...args);
			});
		}
		// Custom handler for translate event handlers
		this.messaging.addMessageListener(`Translate.setHandler`, ([name, id]) => {
			this.translate.setHandler(name, (...args) => {
				// Translate object that we don't care about in inject.jsx handlers.
				args[0] = null;
				if (name == 'select') {
					this.selectCallbacks[id] = args[2];
					args[2] = null;
				}
				this.messaging.sendMessage(`Translate.onHandler.${name}`, [id, args]);
			});
		});
		this.messaging.addMessageListener('Translate.selectCallback', ([id, args]) => {
			if (this.selectCallbacks[id]) {
				this.selectCallbacks[id](...args);
			}
		});
		// Custom handler for translate event handlers
		this.messaging.addMessageListener(`Translate.getTranslators`, async (...args) => {
			return (await this.translate.getTranslators(...args))
				.map(t => serializeTranslator(t, TRANSLATOR_PASSING_PROPERTIES));
		});
		// Custom handler for setDocument()
		this.messaging.addMessageListener(`Translate.setDocument`, ([html, url]) => {
			let doc = new DOMParser().parseFromString(html, 'text/html');
			let baseElem = doc.createElement('base');
			baseElem.setAttribute('href', url);
			doc.querySelector('head').appendChild(baseElem);
			doc = Zotero.HTTP.wrapDocument(doc, url);
			this.translate.setDocument(doc);
			// Won't respond the message and translate initialization will hang in the main content script
			// if this is removed, so don't!
			return true;
		});

		await this.messaging.sendMessage('frameReady');
		await Zotero.initTranslateSandbox();
	},
	
	sendMessage: function() {
		return this.messaging.sendMessage(...arguments);
	},
	
	addMessageListener: function() {
		return this.messaging.addMessageListener(...arguments);
	}
};

window.addEventListener("DOMContentLoaded", () => Zotero.TranslateSandbox.init());
