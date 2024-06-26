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
 * Stored via Swift UserDefaults
 */
Zotero.Prefs = Object.assign(Zotero.Prefs, {
	init: async function() {
		let prefsJSON = await Zotero.Messaging.sendMessage('Swift.getPrefs');
		let prefs = JSON.parse(prefsJSON);
		this.syncStorage = Object.assign({}, prefs);
	},

	set: async function(pref, value) {
		Zotero.debug("Setting "+pref+" to "+JSON.stringify(value).substr(0, 100));
		this.syncStorage[pref] = value;
		Zotero.Messaging.sendMessage('Swift.setPrefs', JSON.stringify(this.syncStorage));
	},

	clear: async function(pref) {
		if (!Array.isArray(pref)) {
			pref = [pref]
		}
		pref.forEach((p) => {
			delete this.syncStorage[p];
		});
		Zotero.Messaging.sendMessage('Swift.setPrefs', JSON.stringify(this.syncStorage));
	}
});
