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

describe("HTTP", function() {
	var tab = new Tab();
	let url = 'http://zotero-static.s3.amazonaws.com/test.html';
	
	before(Promise.coroutine(function* () {
		yield tab.init(url);
	}));
	
	after(function() {
		tab.close();
	});
	
	describe("#processDocuments()", function() {
		it('succeeds when loading a same-origin page', Promise.coroutine(function* () {
			let url = 'http://zotero-static.s3.amazonaws.com/test.html?t';
			let [content, location] = yield tab.run(function(url) {
				var deferred = Zotero.Promise.defer();
				sinon.stub(Zotero.HTTP, 'isSameOrigin').returns(true);
				Zotero.HTTP.processDocuments(url, function(doc) {
					try {
						let content = doc.querySelector('.csl-entry').innerText;
						let location = doc.location.href;
						deferred.resolve([content, location])
					} catch (e) {
						deferred.reject(e);
					}
				});
				
				return deferred.promise.then(response => {Zotero.HTTP.isSameOrigin.restore(); return response});
			}, url);
			
			assert.include(content, 'Rosenzweig');
			assert.equal(location, url);
		}));
		it('succeeds when loading a cross-origin page', Promise.coroutine(function* () {
			let url = chrome.extension.getURL('test/data/journalArticle-single.html');
			let [content, location] = yield tab.run(function(url) {
				var deferred = Zotero.Promise.defer();
				sinon.stub(Zotero.HTTP, 'isSameOrigin').returns(false);
				Zotero.HTTP.processDocuments(url, function(doc) {
					try {
						let content = doc.querySelector('.csl-entry').innerText;
						let location = doc.location.href;
						deferred.resolve([content, location])
					} catch (e) {
						deferred.reject(e);
					}
				});
				
				return deferred.promise.then(response => {Zotero.HTTP.isSameOrigin.restore(); return response});
			}, url);
			
			assert.include(content, 'Rosenzweig');
			assert.equal(location, url);
		}));
	});
	
	describe('#request()', function() {
		describe('POST', function() {
			it('Adds a Content-Type header if not present', Promise.coroutine(function* () {
				let args = yield background(function(url) {
					let spy = sinon.spy(XMLHttpRequest.prototype, 'setRequestHeader');
					return Zotero.HTTP.request("POST", url, {body: 'test=test'}).then(function(xhr) {
						let args = spy.args;
						spy.restore();
						return args;
					});
				}, url);
				let hasContentType = false;
				for (let arg of args) {
					hasContentType = hasContentType || arg[0] == 'Content-Type';
				}
				assert.isTrue(hasContentType);
			}));
		});
	});
});
