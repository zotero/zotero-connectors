/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
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


import {
	AbstractWebTranslationEnvironment,
	TranslatorTester
} from './translatorTester.mjs';

/**
 * @type {Map<number, Record<string, Function>>} Handlers set by the TranslatorTester, by tab
 */
let tabHandlers = new Map();

export class ConnectorWebTranslationEnvironment extends AbstractWebTranslationEnvironment {

	/**
	 * @param {string} url
	 * @param {TranslatorTester} tester
	 * @returns {Promise<Tab>}
	 */
	async fetchPage(url, { tester }) {
		let tab;
		if (Zotero.isSafari) {
			tab = safari.application.activeBrowserWindow.openTab("background");
			tab.url = url;
			tab.id = (new Date()).getTime();
			// TODO: Wait for tab? How?
		}
		else {
			tab = await browser.tabs.create({ url, active: false });
		}
		return tab;
	}

	/**
	 * @param {Tab} tab
	 * @param {TranslatorTester} tester
	 * @returns {Promise<true>}
	 */
	async waitForLoad(tab, { tester }) {
		let waitForLoadComplete = () => new Promise((resolve) => {
			let loadListener = (tabId, changeInfo) => {
				if (tabId !== tab.id) {
					return;
				}
				if (changeInfo.status !== 'complete') {
					return;
				}

				browser.tabs.onUpdated.removeListener(loadListener);
				resolve();
			};
			browser.tabs.onUpdated.addListener(loadListener);
		});
		
		// Wait for potential immediate redirects
		while (tab.status === 'loading') {
			await waitForLoadComplete();
			await Zotero.Promise.delay(1000);
			tab = await browser.tabs.get(tab.id);
		}

		// We follow monitorDOMChanges(), so no need to add an artificial delay
		return true;
	}

	/**
	 * @param {Tab} tab
	 * @param {TranslatorTester} tester
	 * @param {Record<string, Function>} handlers
	 * @param {AbortSignal} signal
	 * @returns {Promise<{
	 *     detectedItemType?: string;
	 *     items?: Zotero.Item[];
	 *     reason?: string;
	 * }>}
	 */
	async runTranslation(tab, { tester, handlers, signal }) {
		if (tester.translatorProvider !== Zotero.Translators) {
			throw new Error('Custom translatorProvider is not supported in Connector translator tests')
		}
		if (tester.cookieSandbox) {
			throw new Error('CookieSandbox is not supported in Connector translator tests')
		}

		tabHandlers.set(tab.id, handlers);
		let result = await Promise.race([
			Zotero.TranslatorTesterBackground.runDummyTranslationInTab({
				tabId: tab.id,
				translatorID: tester.translator.translatorID,
			}),
			new Promise((_, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason));
			}),
		]);
		if (!result) {
			return { items: null, reason: 'Failed to initialize translation' };
		}
		return result;
	}

	/**
	 * @param {Tab} tab
	 * @returns {Promise<void>}
	 */
	async destroy(tab) {
		tabHandlers.delete(tab.id);
		browser.tabs.remove(tab.id);
	}
}

browser.runtime.onMessage.addListener((message, sender) => {
	if (typeof message !== 'object' || message.method !== 'translatorTester_callHandler') {
		return;
	}
	let { handler, args } = message;
	let handlers = tabHandlers.get(sender.tab.id);
	// If we didn't initialize tabHandlers for this tab, that's worrying
	if (!handlers) {
		throw new Error(`Handlers not set for tab ${sender.tab.id}`);
	}
	// But it's fine if there's no handler for this specific function
	return handlers[handler]?.(...args);
});
