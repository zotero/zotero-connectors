/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Corporation for Digital Scholarship
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


Zotero.SandboxedTranslateManager = {
	// Adds the translation sandbox frame to the page
	frame: null,
	virtualTranslate: null,
	noscriptHeadAllowedTags: ['link', 'meta', 'style'],
	headAllowedTags: new Set(["BASE", "COMMAND", "LINK", "META", "NOSCRIPT", "SCRIPT", "STYLE", "TITLE"]),
	handlers: {
		'getVersion': () => Zotero.version,
		'Inject.getSessionDetails': () => Zotero.Inject.sessionDetails,
	},
	
	init: function () {
		// If zoteroFrame._frame does not exist, it means something removed it from the DOM (like history navigation)
		// so we need to reinsert and reinitialized it.
		if (this.frame && !this.frame._frame) {
			return;
		}
		this.frame = new ZoteroFrame(
			{ src: browser.runtime.getURL('translateSandbox/translateSandbox.html') },
			{ width: "0", height: "0", display: "none" },
			{ handlerFunctionOverrides: CONTENT_SCRIPT_FUNCTION_OVERRIDES }
		);
		
		for (let name in this.handlers) {
			this.frame.addMessageListener(name, this.handlers[name]);
		}
	},
	
	initVirtualTranslate: async function() {
		let translateDoc;
		this.init();
		await this.frame.initializedPromise;
		this.frame.sendMessage('Translate.new');
		this.virtualTranslate = {
			setHandler: (name, callback) => {
				let id = Zotero.Utilities.randomString(10);
				this.frame.sendMessage('Translate.setHandler', [name, id]);
				this.frame.addMessageListener(`Translate.onHandler.${name}`, ([remoteId, args]) => {
					if (name == 'select') {
						args[2] = (...args) => {
							this.frame.sendMessage('Translate.selectCallback', [id, args]);
						}
					}
					if (remoteId == id) {
						callback(...args);
					}
				});
			},
			setDocument: (doc, updateLiveElements=false) => {
				translateDoc = doc;
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
				return this.frame.sendMessage('Translate.setDocument', [doc.documentElement.outerHTML, doc.location.href, doc.cookie]);
			},
			setTranslator: async (translators) => {
				if (!Array.isArray(translators)) {
					translators = [translators];
				}
				translators = translators.map(t => t.serialize(Zotero.Translator.TRANSLATOR_PASSING_PROPERTIES));
				return this.frame.sendMessage('Translate.setTranslator', [translators])
			},
			getTranslators: async (...args) => {
				let translators = await this.frame.sendMessage('Translate.getTranslators', args);
				return translators.map(translator => new Zotero.Translator(translator));
			}
		};
		this.virtualTranslate = new Proxy(this.virtualTranslate, {
			get: (target, property, ...args) => {
				if (!target[property] && (property in Zotero.Translate.Web.prototype)) {
					return (...args) => {
						return this.frame.sendMessage(`Translate.${property}`, args);
					}
				}
				return Reflect.get(target, property, ...args);
			}
		});
		
		// Handling for translate.monitorDOMChanges
		let mutationObserver;
		this.frame.addMessageListener('MutationObserver.observe', ([selector, config]) => {
			// We allow at most one observer, or we'll have to keep track of them. Websites
			// that need this will only have one translator applying an observer anyway.
			if (mutationObserver) mutationObserver.disconnect();
			mutationObserver = new MutationObserver(() => {
				// We disconnect immediately because that's what monitorDOMChanges does, and if we don't
				// there's an async messaging timeblock where more mutations may occur and result in
				// pageModified being called multiple times.
				mutationObserver.disconnect();
				return Zotero.SandboxedTranslateManager.frame.sendMessage('MutationObserver.trigger');
			});
			const node = translateDoc.querySelector(selector);
			mutationObserver.observe(node, config);
		});
	},
};