
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

Zotero.Utilities = Zotero.Utilities || {};

Zotero.Utilities.kbEventToShortcutString = function(e) {
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
}

if (!Zotero.Utilities.Internal) {
	Zotero.Utilities.Internal = {};
}
Zotero.Utilities.Internal.filterStack = function (stack) {
	return stack;
}

})();