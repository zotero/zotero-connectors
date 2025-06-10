/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2023 Corporation for Digital Scholarship
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

Zotero.i18n.translateFragment = function (elem) {
	let elems = elem.querySelectorAll('[data-l10n-id]')
	for (let elem of elems) {
		let str = Zotero.getString(elem.dataset.l10nId);
		if (elem.nodeName === 'INPUT' && elem.type === "submit") {
			elem.value = str;
		}
		else if (elem.nodeName === 'INPUT' && elem.type === "text") {
			elem.placeholder = str;
		}
		else {
			elem.innerText = str;
		}
	}
}