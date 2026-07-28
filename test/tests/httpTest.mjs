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

describe("HTTP", function() {
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
		describe('default injected referrer', function() {
			beforeEach(async function () {
				await background(() => {
					globalThis._testHTTPReferrer = undefined;
					sinon.stub(Zotero.COHTTP, 'request').callsFake(async (method, url, options) => {
						globalThis._testHTTPReferrer = options.referrer;
						return {
							response: '',
							responseText: '',
							responseType: options.responseType || 'text',
							status: 200,
							statusText: 'OK',
							responseURL: url,
							getAllResponseHeaders: () => '',
							getResponseHeader: () => null
						};
					});
				});
			});

			afterEach(async function () {
				await background(() => {
					Zotero.COHTTP.request.restore();
					delete globalThis._testHTTPReferrer;
				});
			});

			it('uses the full document URL for same-origin injected requests routed through the background', async function () {
				await tab.run(async () => {
					await Zotero.initDeferred.promise;
					await Zotero.HTTP.request('GET', '/test.html?same-origin-referrer-test');
				});
				let referrer = await background(() => globalThis._testHTTPReferrer);

				assert.equal(referrer, url);
			});

			it('uses the document origin for cross-origin injected requests routed through the background', async function () {
				await tab.run(async () => {
					await Zotero.initDeferred.promise;
					await Zotero.HTTP.request('GET', 'https://example.com/test.html');
				});
				let referrer = await background(() => globalThis._testHTTPReferrer);

				assert.equal(referrer, new URL(url).origin + '/');
			});
		});

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

		describe('POST', function() {
			it('Adds a Content-Type header if not present', async function () {
				let headers = await background(async function(url) {
					let originalFetch = globalThis.fetch;
					let requestHeaders;
					globalThis.fetch = async function(url, options) {
						requestHeaders = options.headers;
						return new Response('', { status: 200 });
					};
					try {
						await Zotero.HTTP.request("POST", url, { body: 'test=test' });
						return requestHeaders;
					}
					finally {
						globalThis.fetch = originalFetch;
					}
				}, url);
				assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
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

	describe("#wrapDocument()", function () {
		it("should allow document itself to be passed to document.evaluate()", async function () {
			var content = await tab.run(function (url) {
				return Zotero.HTTP.request("GET", url, { responseType: 'document' })
				.then(function (xmlhttp) {
					var doc = Zotero.HTTP.wrapDocument(xmlhttp.response, url);
					var div = doc.evaluate('//div', doc, null, XPathResult.ANY_TYPE, null).iterateNext();
					return div.textContent;
				});
			}, "https://zotero-static.s3.amazonaws.com/test.html?t");
			assert.include(content, 'Rosenzweig');
		});
	});
});
