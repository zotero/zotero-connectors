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
 * @typedef {Object} InitTranslateOptions
 * @property {Document} [doc] - The document to translate.
 * @property {Zotero.Translate.Web} [translate] - Optionally pass in a preconfigured translate
 * @property {Object} [cookieSandbox] - The cookie sandbox.
 * @property {string|Location} [location] - The URL of the document being translated.
 * @property {Translator[]} [translators] - The translators to use.
 * @property {Function} [onSelect] - The 'select' event handler for multiple translate items.
 * @property {Function} [onItemSaving] - The 'itemSaving' event handler for multiple translate items.
 * @property {Function} [onDebug] - Custom translate debug line handler.
 * @property {Function} [onTranslatorFallback] - Handler for failed translator fallback.
 * 		Params are oldTranslator and newTranslator.
 */

/**
 * @typedef {Object} TranslateReturnType
 * @property {Object[]} items - the translated JSON item array
 * @property {Zotero.Proxy} [proxy] - the proxy used to translate the items if any
 */

/**
 * A wrapper around Zotero.Translate.Web that is less insane
 * Only handles item translation and not:
 *  - item saving
 *  - attachment saving
 *  - saving progress management
 *  - save session management
 */
let TranslateWeb = {
	/**
	 * @param {InitTranslateOptions} options
	 * @returns {Zotero.Translate.Web} - The initialized translate object
	 */
	async _initTranslate({ translate, doc, cookieSandbox, location, onSelect, onItemSaving, onDebug } = {}) {
		if (!translate) {
			translate = new Zotero.Translate.Web();
			if (!doc) throw new Error(`TranslateWeb: No document provided for translation`);
		}
		// Support for "remote" translate where all these commands could potentially be async
		await Promise.all([
			doc && translate.setDocument(doc),
			cookieSandbox && translate.setCookieSandbox(cookieSandbox),
			location && translate.setLocation(location, location),
			onSelect && translate.setHandler('select', onSelect),
			onItemSaving && translate.setHandler('itemSaving', onItemSaving),
			onDebug && translate.setHandler('debug', onDebug)
		]);

		return translate;
	},

	/**
	 * Returns a list of translators that can translate the given document
	 * @param {InitTranslateOptions} options
	 * @returns {Promise<Translator[]>}
	 */
	async detect(options) {
		let translate = await this._initTranslate(options);
		
		if (options.translators) {
			translate.setTranslator(options.translators);
		}
		return translate.getTranslators(true, !!options.translators);
	},

	/**
	 * Translates the document falling back to other translators on failure and returns
	 * translated items
	 * @param {InitTranslateOptions} options
	 * @returns {Promise<TranslateReturnType>}
	 */
	async translate(options) {
		let translate = await this._initTranslate(options);
		let translators = options.translators;
		if (!translators) {
			translators = await translate.getTranslators(true);
		}
		
		while (true) {
			let translator = translators.shift();
			translate.setTranslator(translator);
			try {
				let items = await translate.translate();
				return {
					items,
					proxy: translate._proxy
				};
			} catch (e) {
				if (translator.itemType != 'multiple' && translators.length) {
					// If we have more translators and not translating multiple items, continue
					if (options.onTranslatorFallback) {
						// Optionally notify about fallback to a different translator
						options.onTranslatorFallback(translator, translators[0]);
					}
				}
				else {
					// Otherwise throw
					throw e;
				}
			}
		}
	}
}

// Couple with translate/translation/translate_item.js for a mock ItemSaver
// Other code, post-translation should handle item and attachment saving and progress notifications/UI.
Zotero.Translate.ItemSaver.prototype.saveItems = async function (jsonItems) {
	this.items = (this.items || []).concat(jsonItems);
	return jsonItems
}

// export TranslateWeb
export default TranslateWeb;