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


Zotero.Messaging.addMessageListener('translatorTester_dummyTranslate', async (data) => {
	let [translatorID] = data;

	let PageSaving = (await import(Zotero.getExtensionURL("inject/pageSaving.js"))).default;
	let TranslateWeb = (await import(Zotero.getExtensionURL('translateWeb.js'))).default;
	
	let translator = await Zotero.Translators.get(translatorID);
	
	let detectedTranslators = await detect(translator);
	if (!detectedTranslators.length) {
		return { items: null, reason: 'Detection failed' };
	}

	let detectedItemType = detectedTranslators[0].itemType;

	let translate = await PageSaving._initTranslate(detectedItemType);
	translate.setHandler('debug', makeHandler('debug'));
	translate.setHandler('error', makeHandler('error'));
	translate.setHandler('select', makeHandler('select'));

	let { items } = await TranslateWeb.translate({ translate, translators: [translator] });
	return { detectedItemType, items };
});

function makeHandler(handler) {
	return async (_, arg, maybeCallback) => {
		let returnValue = await browser.runtime.sendMessage({
			method: 'translatorTester_callHandler',
			handler,
			args: [{}, arg],
		});
		if (maybeCallback && typeof maybeCallback === 'function') {
			maybeCallback(returnValue);
		}
		return returnValue;
	};
}

async function detect(translator) {
	// This is a mess, but I'm not sure there's a better way to wait for a
	// bunch of different events that could possibly allow detection to
	// succeed. This is roughly the same set of conditions as PageSaving
	// uses (and it should be kept in sync with that).
	
	let PageSaving = (await import(Zotero.getExtensionURL("inject/pageSaving.js"))).default;
	let TranslateWeb = (await import(Zotero.getExtensionURL('translateWeb.js'))).default;
	
	return new Promise(async (resolve) => {
		let resolveIfDetected = async () => {
			let options = {
				translate: await PageSaving._initTranslate(),
				translators: [translator],
			};
			let detectedTranslators = await TranslateWeb.detect(options);
			if (detectedTranslators.length) {
				resolve(detectedTranslators);
				return true;
			}
			return false;
		}

		if (await resolveIfDetected()) {
			return;
		}
		document.addEventListener('readystatechange', () => resolveIfDetected());
		Zotero.Messaging.addMessageListener('pageModified', Zotero.Utilities.debounce(() => resolveIfDetected(), 1000));
		Zotero.Messaging.addMessageListener('historyChanged', Zotero.Utilities.debounce(() => resolveIfDetected(), 1000));
	});
}
