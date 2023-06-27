
 /*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2016 Center for History and New Media
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

(function() {

"use strict";

const MAX_STRING_LENGTH = 64 * 1024 * 1024;

Zotero.Utilities = Zotero.Utilities || {};

Zotero.Utilities.Connector = {
	kbEventToShortcutString: function (e) {
		const keymap = [
			['ctrlKey', 'Ctrl+'],
			['shiftKey', 'Shift+'],
			['altKey', 'Alt+'],
			['metaKey', '⌘'],
		];
		let val= "";
		for (let [key, value] of keymap) {
			if (e[key]) {
				val += value;
			}
		}
		val += e.key.length == 1 ? e.key.toUpperCase() : '';
		return val;
	},
	
	createMV3PersistentObject: async function (name) {
		let stored = await browser.storage.session.get({[name]: "{}"});
		let obj = JSON.parse(stored[name]);
		return new Proxy(obj, {
			set: function (target, prop, value) {
				target[prop] = value;
				browser.storage.session.set({[name]: JSON.stringify(target)});
			},
			deleteProperty: function(target, prop) {
				delete target[prop];
				browser.storage.session.set({[name]: JSON.stringify(target)});
			}
		})
	},
	
	// Chrome has a limit of somewhere between 64 and 128 MB for messages.
	// There's been an open bug on the chrome bugtracker to fix this since
	// 2017: https://bugs.chromium.org/p/chromium/issues/detail?id=774158
	// 
	// And with manifestV3 service workers do not support URL.createObjectURL
	// so our best chance is to just pass the array bytes
	// but there's a 64MB limit or Chrome literally crashes
	packString: function (string) {
		if (!Zotero.isChromium) return string;
		if (Zotero.isManifestV3) {
			if (string.length > MAX_STRING_LENGTH) {
				// Truncating to MAX_CONTENT_SIZE.
				string = string.slice(0, MAX_STRING_LENGTH);
			}
			return string;
		}
		return URL.createObjectURL(new Blob([string]));
	},

	unpackString: async function (string) {
		if (!Zotero.isChromium) return string;
		if (Zotero.isManifestV3) {
			return string;
		}
		let blob = await (await fetch(string)).blob();
		return new Promise((resolve) => {
			var fileReader = new FileReader();
			fileReader.onload = function(event) {
				resolve(event.target.result);
			};
			fileReader.readAsText(blob);
		});
	}
};

if (!Zotero.Utilities.Internal) {
	Zotero.Utilities.Internal = {};
}
Zotero.Utilities.Internal.filterStack = function (stack) {
	return stack;
}

})();