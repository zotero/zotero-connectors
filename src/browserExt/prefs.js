/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
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
 * There's a limit of 10MB for locally stored data.
 * https://developer.chrome.com/extensions/storage#property-local
 */
Zotero.Prefs = Object.assign(Zotero.Prefs, {
	init: async function() {
		try {
			this.syncStorage = await browser.storage.local.get(null);
		}
		catch (e) {
			Zotero.debug("Prefs initialization failed");
			Zotero.logError(e);
		}
	},

	set: async function(pref, value) {
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value).substr(0, 100));
		let prefs = {};
		prefs[pref] = value;

		this.syncStorage[pref] = value;
		try {
			await browser.storage.local.set(prefs);
		} catch (e) {
			Zotero.debug(`Setting ${pref} failed. Attempting to free up space and trying again.`)
			await this._freeUpPrefsSpace()
			// If it fails here something else must be going wrong, we don't want to recurse
			await browser.storage.local.set(prefs);
		}
	},

	clear: async function(pref) {
		if (Array.isArray(pref)) return Zotero.Promise.all(pref.map((p) => this.clear(p)));
		delete this.syncStorage[pref];
		return browser.storage.local.remove(pref);
	},

	/**
	 * In case we run out of local storage (which currently it seems like we just about fit into the 10MB with
	 * all translators with code cached), we randomly remove 5 cached translator codes. If it's good
	 * enough for L1 cache, it's good enough for us.
	 */
	_freeUpPrefsSpace: async function() {
		const numToRemove = 5;
		let candidates = Object.keys(this.syncStorage).filter(key => key.startsWith(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX));
		let toBeRemoved = [];
		for (let i = 0; i < numToRemove; i++) {
			toBeRemoved.push(candidates[Math.floor(Math.random() * candidates.length)]);
		}
		return this.clear(toBeRemoved);
	}
});
