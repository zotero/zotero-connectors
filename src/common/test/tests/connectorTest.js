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
	
		it('responds with true when Zotero is online', Promise.coroutine(function*() {
			let status = yield background(function() {
				Zotero.HTTP.request.resolves({status: 200, getResponseHeader: () => 'application/json', responseText: '{}'});
				return Zotero.Connector.checkIsOnline();
			});
			assert.isOk(status);
		}));
		
		it('responds with false when Zotero is offline', Promise.coroutine(function*() {
			let status = yield background(function() {
				Zotero.HTTP.request.resolves({status: 0});
				return Zotero.Connector.checkIsOnline();
			});
			assert.isNotOk(status);
		}));
		
		it('throws when Zotero responds with a non-200 status', Promise.coroutine(function* () {
			try {
				yield background(function() {
					Zotero.HTTP.request.resolves({status: 500, getResponseHeader: () => '', responseText: 'Error'});
					return Zotero.Connector.checkIsOnline();
				});
			} catch (e) {
				return
			}
			throw new Error('Expected error not thrown');
		}));
	});
});