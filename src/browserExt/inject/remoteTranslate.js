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
 * The injected-page interface to disposable remote translator operations.
 */
Zotero.RemoteTranslate = new function() {
	const handlers = new Map();

	this.detect = function({ document, translators } = {}) {
		// Passing a translator is only supported for Translator Tester in debug builds.
		if (!Zotero.isDebug) translators = null;
		return detect({ document, translators });
	};

	this.translate = async function({
		document,
		translators,
		onSelect,
		onItemSaving,
		onDebug,
		onError,
		onTranslatorFallback
	} = {}) {
		let operationID = Zotero.Utilities.randomString();
		handlers.set(operationID, {
			onSelect,
			onItemSaving,
			onDebug,
			onError,
			onTranslatorFallback
		});
		try {
			let result = await Zotero.TranslateHostFrameManager.translate({
				operationID,
				document: serializeDocument(document, true),
				translators: serializeAvailableTranslators(translators),
				handlers: {
					select: !!onSelect,
					itemSaving: !!onItemSaving,
					debug: !!onDebug,
					error: !!onError,
					translatorFallback: !!onTranslatorFallback
				}
			});
			return {
				items: result.items,
				proxy: result.proxy && new Zotero.Proxy(result.proxy)
			};
		}
		finally {
			handlers.delete(operationID);
		}
	};

	async function detect({ document, translators } = {}) {
		let operationID = Zotero.Utilities.randomString();
		let result = await Zotero.TranslateHostFrameManager.detect({
			operationID,
			document: serializeDocument(document, false),
			translators: serializeAvailableTranslators(translators)
		});
		return {
			translators: result.translators.map(translator => new Zotero.Translator(translator)),
			observers: result.observers
		};
	}

	function serializeDocument(document, includeCookie) {
		let cookie = '';
		if (includeCookie) {
			// HTML serialization does not otherwise reflect the live checked state.
			for (let checkbox of document.querySelectorAll('input[type=checkbox]')) {
				if (checkbox.checked) checkbox.setAttribute('checked', '');
				else checkbox.removeAttribute('checked');
			}
			try {
				cookie = document.cookie;
			}
			catch (e) {}
		}
		return {
			html: document.documentElement.outerHTML,
			url: document.location.href,
			cookie
		};
	}

function serializeAvailableTranslators(translators) {
		if (!translators) return null;
		if (!Array.isArray(translators)) translators = [translators];
		return translators.map(translator => ({
			translatorID: translator.translatorID,
			proxy: translator.proxy?.toJSON ? translator.proxy.toJSON() : translator.proxy
		}));
	}

	Zotero.Messaging.addMessageListener('RemoteTranslate.select', async ([operationID, items]) => {
		let handler = handlers.get(operationID)?.onSelect;
		if (!handler) return items;
		return new Promise((resolve, reject) => {
			try {
				let result = handler(null, items, resolve);
				if (result && typeof result.then === 'function') {
					result.catch(reject);
				}
			}
			catch (e) {
				reject(e);
			}
		});
	});

	Zotero.Messaging.addMessageListener('RemoteTranslate.itemSaving', ([operationID, item]) => {
		return handlers.get(operationID)?.onItemSaving?.(null, item);
	});

	Zotero.Messaging.addMessageListener('RemoteTranslate.onDebug', ([operationID, message]) => {
		return handlers.get(operationID)?.onDebug?.(null, message);
	});

	Zotero.Messaging.addMessageListener('RemoteTranslate.onError', ([operationID, error]) => {
		let handler = handlers.get(operationID)?.onError;
		if (!handler) return;
		let translatedError = new Error(error.message);
		Object.assign(translatedError, error);
		return handler(null, translatedError);
	});

	Zotero.Messaging.addMessageListener(
		'RemoteTranslate.translatorFallback',
		([operationID, oldTranslator, newTranslator]) => {
			let handler = handlers.get(operationID)?.onTranslatorFallback;
			if (!handler) return;
			return handler(oldTranslator, newTranslator);
		}
	);
};
