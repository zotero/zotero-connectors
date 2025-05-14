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

import { background } from '../support/utils.mjs';

describe('Connector', function() {
	describe('#checkIsOnline()', function() {
		before(function() {
			return background(function() {
				sinon.stub(Zotero.HTTP, 'request');
			});
		});
		
		after(function() {
			return background(function() {
				Zotero.HTTP.request.restore();
			});
		});
	
		it('returns true when Zotero is online', async function() {
			let status = await background(function() {
				Zotero.HTTP.request.resolves({status: 200, getResponseHeader: () => 'application/json', responseText: '{}'});
				return Zotero.Connector.checkIsOnline();
			});
			assert.isOk(status);
		});
		
		it('returns false when Zotero is offline', async function() {
			let status = await background(function() {
				Zotero.HTTP.request.throws(new Zotero.HTTP.StatusError({status: 0}));
				return Zotero.Connector.checkIsOnline();
			});
			assert.isNotOk(status);
		});
		
		it('returns true if Zotero responds with a non-200 status', async function () {
			let result = await background(async function() {
				Zotero.HTTP.request.resolves({status: 500, getResponseHeader: () => '', responseText: 'Error'});
				try {
					return await Zotero.Connector.checkIsOnline();
				} catch (e) {
					return false;
				}
			});
			assert.isTrue(result);
		});
	});
});