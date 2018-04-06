/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Center for History and New Media
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
 * This is a trivial class for BrowserExt, but we need a non-trivial one for Safari
 */
Zotero.i18n = {
	init: async function() {
		if (Zotero.isBackground) {
			// This is likely not to work for more obscure languages, but they are more likely
			// to not have translations either
			var localeURL = safari.extension.baseURI + '_locales/' + navigator.language.split('-')[0] + '/messages.json';
			this.localeJSON = await new Zotero.Promise(function (resolve) {
				var xhr = new XMLHttpRequest();
				// Safari is awkward like that and acts weird for XHR requests for extension own resources
				// Hopefully this is not too brittle and safari doesn't break it
				xhr.onprogress = function () {
					if (xhr.responseText) {
						resolve(JSON.parse(xhr.responseText));
					}
				};
				xhr.open('GET', localeURL, true);
				xhr.send();
			});
		} else {
			this.localeJSON = await Zotero.i18n.getStrings();
		}
	},
	getString: function(name, substitutions) {
		if (!this.localeJSON) {
			Zotero.logError(new Error(`i18n.getString called for ${name} before i18n.localeJSON was loaded.`));
			return name;
		}
		var str = this.localeJSON[name] && this.localeJSON[name].message;
		if (!str) {
			Zotero.logError(new Error(`Localised string '${name}' is not defined.`));
			return name;
		}
		if (!Array.isArray(substitutions)) {
			substitutions = [substitutions];
		}
		for (let i = 0; i < substitutions.length; i++) {
			let sub = substitutions[i];
			str = str.replace(new RegExp(`\\$${i+1}`, 'g'), sub)
		}

		return str;
	},
	// Used to load the localeJSON in the injected pages
	getStrings: function() {
		return this.localeJSON;
	}
};
