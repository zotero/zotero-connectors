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
 * Orchestrates the offscreen translate instances.
 *
 * Chrome's MV3 disallows evals which means that we would need to bundle our translators
 * with the extension and have to release translator updates via the chrome store.
 * We need to be able to update translators rapidly, and having them held up by extension
 * reviews that can take up to 2 weeks would be a degradation of functionality for our users
 * that we cannot allow.
 *
 * We use the chrome sandbox to eval their code and run them on the doc HTML passed from the
 * content script and parsed with the DOM parser. This also allows us to serve translator code
 * via Zotero or from the Zotero translator repo and update it as needed without releasing new extension
 * code.
 *
 * Also manages translate instances for each tab individually.
 */
Zotero.OffscreenTranslateHost = {
	translateInstances: {},
	init: function() {
		Zotero.TranslateHostCore.init(this);

		this.addMessageListener('tabClosed', (tabId) => this.onTabClosed(tabId));
		this.addMessageListener('translateCleanup', (tabIds) => this.onTranslateCleanup(tabIds));

		if (Zotero.isDebug) {
			// Handler for non-web Translator Tester test runs.
			// Translator code needs to be executed here so we can eval().
			Zotero.TranslateHostMessaging.addMessageListener('translatorTester_runNonWeb',
				async (translatorID, testType, input) => {
					let translator = await Zotero.Translators.get(translatorID);
					await Zotero.Translators.getCodeForTranslator(translator);

					let { runNonWebTranslation }
						= await import('/tools/testTranslators/translatorTester.mjs');
					return runNonWebTranslation({ type: testType, input }, translator);
				}
			);
		}
	},

	sendMessage: function(message, payload, tabId, frameId) {
		// Spoofed to bg page via Offscreen.messaging and then sent directly to the
		// relevant tab and frame
		return Zotero.Messaging.sendMessage(message, payload, tabId, frameId)
	},

	getSelectCallbacks: function(translate, tabId, frameId) {
		return this.translateInstances[tabId][frameId].selectCallbacks;
	},

	addMessageListener: function(message, handler) {
		return Zotero.TranslateHostMessaging.addMessageListener(message, (...args) => {
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
		Zotero.debug(`OffscreenTranslateHost: Cleaning up translates not removed by onTabClosed ${JSON.stringify(Array.from(deadTranslates.keys()))}`, 1);
		return Object.keys(deadTranslates);
	}
};
