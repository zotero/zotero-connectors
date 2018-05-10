/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Corporation for Digital Scholarship
	                 Vienna, Virginia, USA
                     https://www.zotero.org
	
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

describe('CachedTypes', function() {
	describe('ItemFields', function() {
		describe("#getFieldIDFromTypeAndBase()", function () {
			it('should return item-specific field', async function () {
				var [fieldID, targetID] = await background(function() {
					var itemTypeID = Zotero.ItemTypes.getID('webpage');
					var baseFieldID = Zotero.ItemFields.getID('publicationTitle');
					var targetID = Zotero.ItemFields.getID('websiteTitle');
					return [
						Zotero.ItemFields.getFieldIDFromTypeAndBase(itemTypeID, baseFieldID),
						targetID
					];
				});
				assert.isNumber(targetID);
				assert.equal(fieldID, targetID);
			});
		});
	});
});
