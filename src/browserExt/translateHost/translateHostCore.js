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
 * Shared RPC handlers for remote translate hosts running in isolated/sandboxed frames.
 */
Zotero.TranslateHostCore = {
	init(translateHost) {
		for (let method in Zotero.Translate.Web.prototype) {
			translateHost.addMessageListener(`Translate.${method}`, (translate, args) => {
				return translate[method](...args);
			});
		}

		// No-op. The translate host creates/looks up the translate instance before invoking the handler.
		translateHost.addMessageListener('Translate.new', () => 0);
		translateHost.addMessageListener('Translate.getProxy', (translate) => translate._proxy?.toJSON());
		translateHost.addMessageListener('Translate.setHandler', (translate, [name, id], tabId, frameId) => {
			translate.setHandler(name, (...args) => {
				// Translate object that we don't care about in content-script handlers.
				args[0] = null;
				if (name == 'select') {
					translateHost.getSelectCallbacks(translate, tabId, frameId)[id] = args[2];
					args[2] = null;
				}
				translateHost.sendMessage(`Translate.onHandler.${name}`, [id, args], tabId, frameId);
			});
		});
		translateHost.addMessageListener('Translate.selectCallback', (translate, [id, args], tabId, frameId) => {
			translateHost.getSelectCallbacks(translate, tabId, frameId)[id](...args);
		});
		translateHost.addMessageListener('Translate.getTranslators', async (translate, args) => {
			return (await translate.getTranslators(...args))
				.map(t => serializeTranslator(t, TRANSLATOR_PASSING_PROPERTIES));
		});
		translateHost.addMessageListener('Translate.setTranslator', async (translate, [translators]) => {
			return await translate.setTranslator(translators.map(t => new Zotero.Translator(t)));
		});
		translateHost.addMessageListener('Translate.setDocument', (translate, [html, url, cookie], tabId, frameId) => {
			let doc = this.createDocument(html, url, cookie, this.createMutationObserver(translateHost, tabId, frameId));
			translate.setDocument(doc);
			// Won't respond the message and translate initialization will hang in the content script
			// if this is removed, so don't!
			return true;
		});
	},

	createMutationObserver(translateHost, tabId, frameId) {
		return class UnsandboxedMutationObserver {
			constructor(fn) {
				translateHost.addMessageListener('MutationObserver.trigger', () => {
					// monitorDOMChanges includes the document where the change occurred in pageModified event,
					// but we don't care for that in the Connector.
					fn([{ target: { ownerDocument: 0 } }], this);
				});
			}
			observe(node, options) {
				if (!(node instanceof Node)) {
					throw new Error("TypeError: Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.");
				}
				const selector = Zotero.Utilities.Connector.getNodeSelector(node);
				translateHost.sendMessage('MutationObserver.observe', [selector, options], tabId, frameId);
			}
			disconnect() {}
		};
	},

	preprocessHTML(html) {
		// <video> and <audio> elements leak memory in DOMParser, see
		// https://issues.chromium.org/issues/254330164
		// This may break with malformed html, or some very complex
		// contents of media tags in theory. In practice, they should not
		// exist, and the tags are generally well formed with simple content.
		html = html.replace(/<(video|audio)(?:\s[^>]*)?(?:\/>|>.*?<\/\1>)/gis, '');

		// In a JS environment (the only one where Connector would work), <noscript> contents are
		// treated as a literal string, but in a non-js environment (DOMParser), the contents are
		// treated as HTML. We're generally not interested in content of <noscript> tags, but they can
		// sometimes cause issues, especially if they do weird things like put <img> tags inside them
		// and inside the <head> element, which causes DOMParser to close the <head> tag early.
		html = html.replace(/<noscript(?:\s[^>]*)?(?:\/>|>.*?<\/noscript>)/gis, '');
		return html;
	},

	createDocument(html, url, cookie, MutationObserver) {
		html = this.preprocessHTML(html);
		let doc = new DOMParser().parseFromString(html, 'text/html');
		let baseElem = doc.querySelector('base[href]');
		let baseUrl = url;
		if (baseElem) {
			// If there's a base elem already on the page, we need to use that as a base instead of
			// using page url, so we resolve it here.
			baseUrl = new URL(baseElem.getAttribute('href'), baseUrl).href;
		}
		else {
			baseElem = doc.createElement('base');
		}
		baseElem.setAttribute('href', baseUrl);
		doc.querySelector('head').appendChild(baseElem);
		return Zotero.HTTP.wrapDocument(doc, url, {
			// To support translate.monitorDOMChanges
			defaultView: { MutationObserver },
			// Some translators require it
			cookie
		});
	}
};

// Coupled with translate/translation/translate_item.js for a mock ItemSaver. Other code,
// post-translation, handles item and attachment saving and progress notifications/UI.
Zotero.Translate.ItemSaver.prototype.saveItems = async function (jsonItems) {
	this.items = (this.items || []).concat(jsonItems);
	return jsonItems;
};
