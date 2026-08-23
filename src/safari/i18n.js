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

// Locale directories are named with just the language code (e.g., 'de' for de-DE), apart from
// these two, which would otherwise collide with pt-BR and zh-CN
// Keep in sync with the locale handling in build.sh
const REGIONAL_LOCALES = ['pt-PT', 'zh-TW'];

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
		let ui = (browser.i18n.getUILanguage() || 'en').replace('_', '-');
		let fallback = await Zotero.i18n._fetchStrings('en') || {};

		// Requesting a directory that doesn't exist triggers a missing-resource error in the
		// extension's settings, so try only a REGIONAL_LOCALES entry and the language code
		let regional = REGIONAL_LOCALES.find(code => code.toLowerCase() == ui.toLowerCase());
		let codes = regional ? [regional] : [];
		codes.push(ui.split('-')[0].toLowerCase());
		for (let code of codes) {
			if (code == 'en') continue;
			let strings = await Zotero.i18n._fetchStrings(code);
			if (strings) return Object.assign(fallback, strings);
		}
		return fallback;
	},

	_fetchStrings: async function(code) {
		try {
			let resp = await fetch(browser.runtime.getURL(`_locales/${code}/messages.json`));
			if (resp.ok) return await resp.json();
		} catch (e) {}
		return null;
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
