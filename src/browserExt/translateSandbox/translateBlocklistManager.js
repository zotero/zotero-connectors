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

// 24hr
const CHECK_EVERY = 24*60*60e3;

/**
 * Only relevant with MV3 sandboxed translate
 * Fetch origins where we won't run translation because the translate sandbox
 * iframe causes issues.
 */
Zotero.TranslateBlocklistManager = {
	async init() {
		if (!Zotero.isManifestV3) return;
		let lastCheck = Zotero.Prefs.get('translateBlocklist.lastCheck');
		if (Date.now() > lastCheck + CHECK_EVERY) {
			await this._fetchBlocklist()
		}
		// We would add a setTimeout or similar here, but the service worker
		// restarts every 1hr anyway and reruns this.
	},

	async _fetchBlocklist() {
		let xhr, blocklist = [];
		try {
			Zotero.Prefs.set('translateBlocklist.lastCheck', Date.now());
			xhr = await Zotero.HTTP.request('GET', Zotero.Prefs.get('translateBlocklist.url'))
		} catch (e) {
			Zotero.debug('Failed to fetch translate blocklist');
			Zotero.logError(e);
			return;
		}
		for (let regexp of xhr.responseText.trim().split('\n')) {
			try {
				new RegExp(regexp);
				blocklist.push(regexp);
			} catch (e) {
				Zotero.logError(`Translate blocklist contains an illegal entry ${regexp}`);
			}
		}
		Zotero.Prefs.set('translateBlocklist', blocklist)
	}
}