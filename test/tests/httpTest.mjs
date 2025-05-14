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

import { Tab } from '../support/utils.mjs';

// Skips due to missing puppeteer ability to run scripts in extension content scripts
describe.skip("HTTP", function() {
	var tab = new Tab();
	let url = 'https://zotero-static.s3.amazonaws.com/test.html';
	
	before(async function () {
		await tab.init(url);
	});
	
	after(async function() {
		await tab.close();
	});
	
	describe("#processDocuments()", function() {
		it('succeeds when loading a same-origin page', async function () {
			let url = 'https://zotero-static.s3.amazonaws.com/test.html?t';
			let [content, location] = await tab.run(async (url) => {
				return new Promise((resolve) => {
					(Zotero.HTTP.processDocuments(
						url,
						function (doc) {
							var content = doc.querySelector('.csl-entry').innerText;
							var location = doc.location.href;
							resolve([content, location]);
						}
					));
				});
			}, url);
			
			assert.include(content, 'Rosenzweig');
			assert.equal(location, url);
		});
		
		it('succeeds when loading a cross-origin page', async function () {
			let url = 'http://zotero-static.s3.amazonaws.com/test.html';
			let [content, location] = await tab.run(function(url) {
				return Zotero.HTTP.processDocuments(
					url,
					function (doc) {
						var content = doc.querySelector('.csl-entry').innerText;
						var location = doc.location.href;
						return [content, location];
					}
				)
				.then(vals => vals[0]);
			}, url);
			
			assert.include(content, 'Rosenzweig');
			assert.equal(location, url);
		});
	});
	
	describe('#request()', function() {
		describe('POST', function() {
			it('Adds a Content-Type header if not present', async function () {
				let args = await tab.run(async function(url) {
					let spy = await sinon.spy(XMLHttpRequest.prototype, 'setRequestHeader');
					try {
						await Zotero.HTTP.request("POST", url, {body: 'test=test'})
					} catch (e) {}
					let args = await spy.getArgs();
					spy.restore();
					return args;
				}, url);
				let hasContentType = false;
				for (let arg of args) {
					hasContentType = hasContentType || arg[0] == 'Content-Type';
				}
				assert.isTrue(hasContentType);
			});
		});
	});
	
	describe("COHTTP", function() {
		describe('#request()', function() {
			it('responds with correct XHR signature', async function () {
				let xhr = await tab.run(async function(url) {
					let xhr = await Zotero.COHTTP.request('GET', url);
					return Object.keys(xhr);
				}, url);
				assert.include(xhr, 'responseText');
				assert.include(xhr, 'status');
			});
		});
	});

	// Skip due to missing puppeteer ability to run scripts in extension content scripts
	describe("#wrapDocument()", function () {
		it("should allow document itself to be passed to document.evaluate()", async function () {
			var content = await tab.run(function (url) {
				var url = "https://zotero-static.s3.amazonaws.com/test.html?t";
				return Zotero.HTTP.request("GET", url, { responseType: 'document' })
				.then(function (xmlhttp) {
					var doc = Zotero.HTTP.wrapDocument(xmlhttp.response, url);
					var div = doc.evaluate('//div', doc, null, XPathResult.ANY_TYPE, null).iterateNext();
					return div.textContent;
				});
			});
			assert.include(content, 'Rosenzweig');
		});
	});
});
