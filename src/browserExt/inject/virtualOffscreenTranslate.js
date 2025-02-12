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

// A virtual translate that offloads translating to the offscreen page
Zotero.VirtualOffscreenTranslate = class {
	translateDoc = null;

	/**
	 * @returns {Promise<Zotero.VirtualOffscreenTranslate>}
	 */
	static async create() {
		let translate = new Zotero.VirtualOffscreenTranslate();
		await translate.sendMessage('Translate.new');
		return new Proxy(translate, {
			get: (target, property, ...args) => {
				if (!target[property] && (property in Zotero.Translate.Web.prototype)) {
					return (...args) => {
						return target.sendMessage(`Translate.${property}`, args);
					}
				}
				return Reflect.get(target, property, ...args);
			}
		});
	}
	
	constructor() {
		// Handling for translate.monitorDOMChanges
		let mutationObserver;
		this.addMessageListener('MutationObserver.observe', ([selector, config]) => {
			// We allow at most one observer, or we'll have to keep track of them. Websites
			// that need this will only have one translator applying an observer anyway.
			if (mutationObserver) mutationObserver.disconnect();
			mutationObserver = new MutationObserver(() => {
				// We disconnect immediately because that's what monitorDOMChanges does, and if we don't
				// there's an async messaging timeblock where more mutations may occur and result in
				// pageModified being called multiple times.
				mutationObserver.disconnect();
				return this.sendMessage('MutationObserver.trigger');
			});
			const node = this.translateDoc.querySelector(selector);
			mutationObserver.observe(node, config);
		});
	}
	
	getProxy() {
		return this.sendMessage('Translate.getProxy');
	}
	
	async setHandler(name, callback) {
		let id = Zotero.Utilities.randomString(10);
		await this.sendMessage('Translate.setHandler', [name, id]);
		this.addMessageListener(`Translate.onHandler.${name}`, ([remoteId, args]) => {
			if (name == 'select') {
				args[2] = (...args) => {
					this.sendMessage('Translate.selectCallback', [id, args]);
				}
			}
			if (remoteId == id) {
				callback(...args);
			}
		});
	}
	
	setDocument(doc, updateLiveElements=false) {
		this.translateDoc = doc;
		if (updateLiveElements) {
			for (const checkbox of doc.querySelectorAll('input[type=checkbox]')) {
				if (checkbox.checked) {
					checkbox.setAttribute('checked', '');
				}
				else {
					checkbox.removeAttribute('checked');
				}
			}
		}
		return this.sendMessage('Translate.setDocument', [doc.documentElement.outerHTML, doc.location.href, doc.cookie]);
	}
	
	async setTranslator(translators) {
		if (!Array.isArray(translators)) {
			translators = [translators];
		}
		translators = translators.map(t => t.serialize(Zotero.Translator.TRANSLATOR_PASSING_PROPERTIES));
		return this.sendMessage('Translate.setTranslator', [translators])
	}
	
	async getTranslators(...args) {
		let translators = await this.sendMessage('Translate.getTranslators', args);
		return translators.map(translator => new Zotero.Translator(translator));
	}
	
	sendMessage(message, payload=[]) {
		return Zotero.OffscreenManager.sendMessage(message, payload)
	}
	
	addMessageListener(...args) {
		// Listening for messages from bg page messaging via which OffscreenManager will send messages
		// since it doesn't have the ability to send messages directly to tabs itself
		return Zotero.Messaging.addMessageListener(...args)
	}
}
