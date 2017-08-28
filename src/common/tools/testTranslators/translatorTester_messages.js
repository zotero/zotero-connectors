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

MESSAGES.TranslatorTester = {
	onLoad: {
		response: true,
		background: {
			preSend: function(data) {
				if (data) {
					data[0] = Zotero.Translators.serialize(data[0], TRANSLATOR_PASSING_PROPERTIES)
				}
				return data;
			},
		},
		inject: {
			postReceive: function(data) {
				if (data) {
					data[0] = new Zotero.Translator(data[0]);
				}
				return data;
			}
		}
	},
	debug: false,
	runTests: false,
	testComplete: false,
	runAutomatedTesting: false
};