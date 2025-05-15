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

import { Tab, background } from '../support/utils.mjs';

// Skips due to missing puppeteer ability to run scripts in extension content scripts
describe("HTTP", function() {
	var tab = new Tab();
	let url = 'https://zotero-static.s3.amazonaws.com/test.html';
	
	before(async function () {
		await tab.init(url);
	});
	
	after(async function() {
		await tab.close();
	});
	
	describe.skip("#processDocuments()", function() {
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
		describe('With { successCodes: null } (default)', function() {
			it('Throws when the target responds with a non-2xx or non-3xx status code', async function() {
				const url = "https://zotero-static.s3.amazonaws.com/test.html";
				let response = await background(async(url) => {
					try {
						sinon.stub(globalThis, 'fetch').resolves({
							status: 404,
							statusText: "Not Found",
							text: async () => "Not Found",
							url: url,
							headers: new Headers()
						});
						await Zotero.HTTP.request("GET", url);
					} catch (e) {
						return e.message;
					} finally {
						globalThis.fetch.restore();
					}
				}, url);
				assert.equal(response, `HTTP request to ${url} rejected with status 404`);
			});

			it('Throws when no path found to target/offline (status 0)', async function() {
				const url = "https://zotero-static.s3.amazonaws.com/test.html";
				let response = await background(async(url) => {
					sinon.stub(globalThis, 'fetch').callsFake(async () => {
						throw new Error('Request failed');
					})
					try {
						await Zotero.HTTP.request("GET", url);
					} catch (e) {
						return e.message;
					} finally {
						globalThis.fetch.restore();
					}
				}, url);
				assert.equal(response, `HTTP request to ${url} rejected with status 0`);
			});
		});

		describe('With { successCodes: false }', function() {
			it('Does not throw when the target responds with a non-2xx or non-3xx status code', async function() {
				const url = "https://zotero-static.s3.amazonaws.com/test.html";
				let response = await background(async(url) => {
					sinon.stub(globalThis, 'fetch').resolves({
						status: 404,
						statusText: "Not Found",
						text: async () => "Not Found",
						url: url,
						headers: new Headers()
					});
					try {
						let response = await Zotero.HTTP.request("GET", url, {successCodes: false});
						return response.status;
					} finally {
						globalThis.fetch.restore();
					}
				}, url);
				assert.equal(response, 404);
			});

			it('Does not throw when no path found to target/offline (status 0)', async function() {
				const url = "https://zotero-static.s3.amazonaws.com/test.html";
				let response = await background(async(url) => {
					sinon.stub(globalThis, 'fetch').callsFake(async () => {
						throw new Error('Request failed');
					})
					try {
						let response = await Zotero.HTTP.request("GET", url, {successCodes: false});
						return response.status;
					} finally {
						globalThis.fetch.restore();
					}
				}, url);
				assert.equal(response, 0);
			});
		});

		describe.skip('POST', function() {
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
	
	describe.skip("COHTTP", function() {
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
	describe.skip("#wrapDocument()", function () {
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
