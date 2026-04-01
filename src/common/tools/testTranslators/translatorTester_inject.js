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

	let translator = await Zotero.Translators.get(translatorID);
	
	let detectedTranslators = await detect(translator);
	if (!detectedTranslators.length) {
		return { items: null, reason: 'Detection failed' };
	}

	let detectedItemType = detectedTranslators[0].itemType;

	let translate = await Zotero.PageSaving._initTranslate(detectedItemType);
	translate.setHandler('debug', makeHandler('debug'));
	translate.setHandler('error', makeHandler('error'));
	translate.setHandler('select', makeHandler('select'));

	let { items } = await Zotero.TranslateWeb.translate({ translate, translators: [translator] });
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
	// Try detection immediately, then retry on page events with a timeout.
	// Background tabs can have deferred load events, so we can't rely solely
	// on readystatechange. We also poll periodically as a fallback.

	return new Promise(async (resolve, reject) => {
		let resolved = false;
		let resolveIfDetected = async () => {
			if (resolved) return false;
			let options = {
				translate: await Zotero.PageSaving._initTranslate(),
				translators: [translator],
			};
			let detectedTranslators = await Zotero.TranslateWeb.detect(options);
			if (detectedTranslators.length) {
				resolved = true;
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

		// Poll every second as fallback for pages where events don't fire
		// (to work around some background tabs never firing load events).
		// Keep this well under the 15-second per-test timeout.
		let polls = 0;
		let pollInterval = setInterval(async () => {
			polls++;
			if (resolved) {
				clearInterval(pollInterval);
				return;
			}
			if (await resolveIfDetected()) {
				clearInterval(pollInterval);
				return;
			}
			if (polls >= 8) {
				clearInterval(pollInterval);
				if (!resolved) {
					resolved = true;
					resolve([]);
				}
			}
		}, 1000);
	});
}
