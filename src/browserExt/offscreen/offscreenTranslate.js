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
 * Orchestrates the offscreen translate, not to be confused with TranslationSandbox (which is mostly
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
 * 
 * Also manages translate instances for each tab individually, without leaking memory.
 */
 
function createMutationObserver(tabId, frameId) {
	// Handling for translate.monitorDOMChanges
	return class UnsandboxedMutationObserver {
		constructor(fn) {
			Zotero.OffscreenTranslate.addMessageListener('MutationObserver.trigger', () => {
				// monitorDOMChanges includes the document where the change occurred in
				// pageModified event, but we don't care for that in the Connector
				fn([{target: {ownerDocument: 0}}], this)
			});
		}
		observe(node, options) {
			if (!(node instanceof Node)) {
				throw new Error("TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.")
			}
			const selector = Zotero.Utilities.Connector.getNodeSelector(node);
			Zotero.OffscreenTranslate.sendMessage('MutationObserver.observe', [selector, options], tabId, frameId)
		}
		disconnect() {}
	}
}

Zotero.OffscreenTranslate = {
	translateInstances: {},
	selectCallbacks: {},
	init: function() {
		// Default passthrough handlers for translate methods
		for (let method in Zotero.Translate.Web.prototype) {
			this.addMessageListener(`Translate.${method}`, (translate, [...args]) => {
				return translate[method](...args);
			});
		}
		
		// No-op (but the addMessageListener() initializes a translate if needed)
		this.addMessageListener('Translate.new', () => 0);
		// Not part of translate API, but we need to be able to return this to translate
		// client
		this.addMessageListener('Translate.getProxy', (translate) => translate._proxy?.toJSON());
		// Custom handler for translate event handlers
		this.addMessageListener(`Translate.setHandler`, (translate, [name, id], tabId, frameId) => {
			translate.setHandler(name, (...args) => {
				// Translate object that we don't care about in inject.jsx handlers.
				args[0] = null;
				if (name == 'select') {
					this.translateInstances[tabId][frameId].selectCallbacks[id] = args[2];
					args[2] = null;
				}
				this.sendMessage(`Translate.onHandler.${name}`, [id, args], tabId, frameId);
			});
		});
		this.addMessageListener('Translate.selectCallback', (translate, [id, args], tabId, frameId) => {
			this.translateInstances[tabId][frameId].selectCallbacks[id](...args);
		});
		this.addMessageListener(`Translate.getTranslators`, async (translate, [...args]) => {
			return (await translate.getTranslators(...args))
				.map(t => serializeTranslator(t, TRANSLATOR_PASSING_PROPERTIES));
		});
		this.addMessageListener(`Translate.setTranslator`, async (translate, [translators]) => {
			return await translate.setTranslator(translators.map(t => new Zotero.Translator(t)));
		});
		// Custom handler for setDocument()
		this.addMessageListener(`Translate.setDocument`, (translate, [html, url, cookie], tabId, frameId) => {
			// <video> elements leak memory in DOMParser, see
			// https://issues.chromium.org/issues/254330164
			if (Zotero.isChromium) {
				// This may break with malformed html, or some very complex
				// contents of video tags in theory. In practice, they should not
				// exist, and 99% of the cases is going to be youtube, where
				// the tag is well formed and content is simple.
				html = html.replace(/<video(?:\s[^>]*)?(?:\/>|>.*?<\/video>)/gis, '');
			}
			
			let doc = new DOMParser().parseFromString(html, 'text/html');
			let baseElem = doc.querySelector('base[href]');
			let baseUrl = url;
			if (baseElem) {
				// If there's a base elem already on the page, we need to use
				// that as a base instead of using page url, so we resolve it here
				baseUrl = new URL(baseElem.getAttribute('href'), baseUrl).href;
			}
			else {
				baseElem = doc.createElement('base');
			}
			baseElem.setAttribute('href', baseUrl);
			doc.querySelector('head').appendChild(baseElem);
			doc = Zotero.HTTP.wrapDocument(doc, url, {
				// To support translate.monitorDOMChanges
				defaultView: { MutationObserver: createMutationObserver(tabId, frameId) },
				// Some translators require it
				cookie
			});
			translate.setDocument(doc);
			// Won't respond the message and translate initialization will hang in the main content script
			// if this is removed, so don't!
			return true;
		});
		
		this.addMessageListener('tabClosed', (tabId) => this.onTabClosed(tabId));
		this.addMessageListener('translateCleanup', (tabIds) => this.onTranslateCleanup(tabIds));
	},

	sendMessage: function(message, payload, tabId, frameId) {
		// Spoofed to bg page via Offscreen.messaging and then sent directly to the
		// relevant tab and frame
		return Zotero.Messaging.sendMessage(message, payload, tabId, frameId)
	},

	addMessageListener: function(message, handler) {
		return Zotero.OffscreenSandbox.addMessageListener(message, (...args) => {
			if (message.startsWith('Translate')) {
				// Last 2 args passed via background script are tabId and frameId so we can lifecycle-manage translates
				let frameId = args.at(-1);
				let tabId = args.at(-2);
				let translate = this._getTranslateInstance(tabId, frameId, message === "Translate.new");
				return handler(translate, args.slice(0, -2), tabId, frameId);
			}
			return handler(args);
		});
	},
	
	_getTranslateInstance(tabId, frameId, create) {
		if (!this.translateInstances[tabId]) {
			this.translateInstances[tabId] = {};
		}
		if (!this.translateInstances[tabId][frameId] && !create) {
			throw new Error(`OfscreenTranslate: Attempting to access a translate without initializing it first for tab: ${tabId}`);
		}
		if (create) {
			this.translateInstances[tabId][frameId] = new Zotero.Translate.Web();
			this.translateInstances[tabId][frameId].selectCallbacks = {};
		}
		return this.translateInstances[tabId][frameId];
	},
	
	onTabClosed(tabId) {
		if (this.translateInstances[tabId]) {
			delete this.translateInstances[tabId];
		}
	},

	/**
	 * 
	 * @param tabIds {Array} - Array of tabIds that are alive, the rest should be cleaned up
	 */
	onTranslateCleanup(tabIds) {
		let deadTranslates = new Set(Object.keys(this.translateInstances))
		for (let tabId of tabIds) {
			deadTranslates.delete(tabId);
		}
		if (!deadTranslates.size) return [];
		for (let tabId of deadTranslates) {
			delete this.translateInstances[tabId];
		}
		Zotero.debug(`OffscreenTranslate: Cleaning up translates not removed by onTabClosed ${JSON.stringify(Array.from(deadTranslates.keys()))}`, 1);
		return Object.keys(deadTranslates);
	}
};

// Couple with translate/translation/translate_item.js for a mock ItemSaver
// Other code, post-translation should handle item and attachment saving and progress notifications/UI.
Zotero.Translate.ItemSaver.prototype.saveItems = async function (jsonItems) {
	this.items = (this.items || []).concat(jsonItems);
	return jsonItems
}