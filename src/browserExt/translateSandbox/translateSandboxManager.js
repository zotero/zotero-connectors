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
	handlers: {
		'getVersion': () => Zotero.version,
		'Inject.getSessionDetails': () => Zotero.Inject.sessionDetails,
	},
	
	init: function () {
		if (this.frame) {
			throw new Error("Attempting to initialize a SandboxedTranslateManager when a translate frame already exists");
		}
		this.frame = new ZoteroFrame(
			{ src: browser.runtime.getURL('translateSandbox/translateSandbox.html') },
			{},
			{ handlerFunctionOverrides: CONTENT_SCRIPT_FUNCTION_OVERRIDES }
		);
		
		for (let name in this.handlers) {
			this.frame.addMessageListener(name, this.handlers[name]);
		}
	},
	
	initVirtualTranslate: async function() {
		if (!this.frame) {
			this.init();
		}
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
			setDocument: (doc) => {
				return this.frame.sendMessage('Translate.setDocument', [doc.documentElement.outerHTML, doc.location.href]);
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
	},
};