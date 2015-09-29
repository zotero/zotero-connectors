/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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

Zotero.Translators = {
	/**
	 * Add proper to proxy converter function to translator data sent back via IPC for
	 * Zotero.Translators.getWebTranslatorsForLocation
	 */
	"getConverterFunctions":function(converterDataArray) {
		var converterFunctions = new Array(converterDataArray.length);
		for(var i=0; i<converterDataArray.length; i++) {
			if(converterDataArray[i] === null) {
				converterFunctions[i] = null;
			} else {
				converterFunctions[i] = new function() {
					var re = new RegExp('^https?://(?:[^/]\\.)?'+Zotero.Utilities.quotemeta(converterDataArray[i][0]) + '(?=/)', "gi");
					var proxyHost = converterDataArray[i][1].replace(/\$/g, "$$$$");
					return function(uri) { return uri.replace(re, "$&."+proxyHost) };
				};
			}
		}
		return converterFunctions;
	}
}

Zotero.Translator = function() {};
Zotero.Translator.RUN_MODE_IN_BROWSER = 1;
Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE = 2;
Zotero.Translator.RUN_MODE_ZOTERO_SERVER = 4;