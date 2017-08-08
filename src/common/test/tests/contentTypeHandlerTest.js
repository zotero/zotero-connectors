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

describe("ContentTypeHandler", function() {
	describe('#observe()', function() {
		it('calls Zotero.Connector_Browser.onPDFFrame when pdf frame loads', Promise.coroutine(function* () {
			let args = yield background(function() {
				var stub = sinon.stub(Zotero.Connector_Browser, 'onPDFFrame');
				Zotero.ContentTypeHandler.observe({frameId: 1, tabId: 1, url: 'test', method: "GET",
					responseHeadersObject: {'content-type': 'application/pdf'}});
				return new Zotero.Promise(function(resolve, reject) {
					// onPDFFrame called out of observe event loop to not stall the page load
					// since it's a blocking call
					setTimeout(function() {
						try {
							resolve(stub.args[0])
						} catch (e) {
							reject(e);
						} finally {
							stub.restore();
						}
					}, 10);
				});
			});
			assert.deepEqual(args, ['test', 1, 1]);
		}));
	});
});