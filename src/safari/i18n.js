/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2026 Corporation for Digital Scholarship
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

Zotero.i18n = {
	// Raw bundled strings, loaded to avoid Safari's browser.i18n.getMessage bug with positional
	// placeholders inside quotes (e.g., <a href="$1">), where Safari drops the placeholder and a
	// quote and mangles the markup.
	_strings: null,

	init: async function() {
		if (Zotero.i18n._strings) return;
		if (Zotero.isBackground) {
			// Only the background can read _locales/ (it's not web-accessible). Injected pages and
			// content scripts fetch the strings from the background via the getStrings message.
			Zotero.i18n._strings = await Zotero.i18n._loadStrings();
		}
		else {
			Zotero.i18n._strings = await Zotero.i18n.getStrings();
		}
	},

	_loadStrings: async function() {
		let ui = browser.i18n.getUILanguage() || 'en';
		let tried = [];
		// Try the full locale, then language-only, then English. Locale folder names mirror the
		// _locales/ directory (mostly 2-letter, plus a few like pt-PT/zh-TW).
		for (let code of [ui, ui.replace('-', '_'), ui.split(/[-_]/)[0], 'en']) {
			if (!code || tried.includes(code)) continue;
			tried.push(code);
			try {
				let resp = await fetch(browser.runtime.getURL(`_locales/${code}/messages.json`));
				if (resp.ok) return await resp.json();
			} catch (e) {}
		}
		return {};
	},

	// Background-only message handler; injected pages call this (via messaging) to get the strings
	// the background loaded. Overwritten by the messaging proxy in injected pages/content scripts.
	getStrings: function() {
		return Zotero.i18n._strings;
	},

	getString: function(name, substitutions) {
		if (substitutions != undefined && !Array.isArray(substitutions)) {
			substitutions = [substitutions];
		}
		let str = Zotero.i18n._strings[name].message;
		if (!str) {
			Zotero.logError(new Error(`Localized string '${name}' not defined`));
			return '{' + name + '}';
		}
		if (substitutions) {
			str = str.replace(/\$(\d+)/g, function(match, n) {
				let i = parseInt(n) - 1;
				return i < substitutions.length ? substitutions[i] : match;
			});
		}
		return str;
	}
};
