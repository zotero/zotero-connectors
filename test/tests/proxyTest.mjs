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

describe('Zotero.Proxies', function() {
	var originalProxies;

	async function setProxies(proxies) {
		await background(function(proxies) {
			Zotero.Proxies.proxies = proxies.map(p => new Zotero.Proxy(p));
			Zotero.Proxies.hosts = [];
			Zotero.Proxies.proxies.forEach(proxy => proxy.hosts.forEach(host => Zotero.Proxies.hosts[host] = proxy))
		}, proxies);
	}

	before(async function () {
		originalProxies = await background(function() {
			return Zotero.Proxies.proxies.map(p => p.toJSON());
		});
	});

	after(async function () {
		await setProxies(originalProxies);
	});

	describe('#getPotentialProxies()', function() {
		it('returns no proxies if link unproxied', async function() {
			let url = 'http://www.zotero.org/';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 1);
			assert.isNull(proxies[url]);
		});

		it('returns a simple proxy if link proxied', async function() {
			let url = 'http://www.zotero.org.proxy.example.com/';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 2);
			assert.isNull(proxies[url]);
			assert.equal(proxies['http://www.zotero.org/'].scheme, '%h.proxy.example.com/%p');
		});

		it('returns an unhyphenated proxy if link is proxied with https hyphenation', async function() {
			let url = 'https://www-zotero-org.proxy.example.com/';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 2);
			assert.isNull(proxies[url]);
			assert.equal(proxies['https://www.zotero.org/'].scheme, '%h.proxy.example.com/%p');
			assert.isTrue(proxies['https://www.zotero.org/'].dotsToHyphens);
		});
	});

	describe('#proxyToProper()', function() {
		before(async function() {
			await setProxies([{scheme: '%h.proxy.example.com/%p', dotsToHyphens: true, id: "test"}]);
		});

		it('returns original url if not proxied', async function() {
			let result = await background(function() {
				return Zotero.Proxies.proxyToProper('http://www.zotero.org/');
			});
			assert.equal(result, 'http://www.zotero.org/');
		});

		it('returns original url if proxied with an unknown proxy', async function() {
			let result = await background(function() {
				return Zotero.Proxies.proxyToProper('http://www.zotero.org.proxy.example.org/');
			});
			assert.equal(result, 'http://www.zotero.org.proxy.example.org/');
		});

		it('returns deproxied url if proxied', async function() {
			let result = await background(function() {
				return Zotero.Proxies.proxyToProper('http://www.zotero.org.proxy.example.com/');
			});
			assert.equal(result, 'http://www.zotero.org/');
		});

		it('returns deproxied and undashed url if proxied with hyphenated domain', async function() {
			let result = await background(function() {
				return Zotero.Proxies.proxyToProper('https://www-zotero-org.proxy.example.com/');
			});
			assert.equal(result, 'https://www.zotero.org/');
		});
	});

	describe('#properToProxy()', function() {
		before(async function() {
			await setProxies([{scheme: '%h.proxy.example.com/%p', dotsToHyphens: true, id: "test",
				hosts: ['www.zotero.org']}]);
		});

		it('returns false if url not in hosts list', async function() {
			let result = await background(function() {
				return Zotero.Proxies.properToProxy('http://www.zotero.com');
			});
			assert.equal(result, 'http://www.zotero.com');
		});

		it('returns proxied url if in hosts list', async function() {
			let result = await background(function() {
				return Zotero.Proxies.properToProxy('http://www.zotero.org');
			});
			assert.equal(result, 'http://www.zotero.org.proxy.example.com/');
		});

		it('returns proxied and dashed url if in hosts list with HTTPS protocol', async function() {
			let result = await background(function() {
				return Zotero.Proxies.properToProxy('https://www.zotero.org');
			});
			assert.equal(result, 'https://www-zotero-org.proxy.example.com/');
		});
	});
});


describe('Zotero.Proxy', function() {
	describe('toProxy method', function() {
		it('should preserve pathname and query string with toProxyScheme', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					toProxyScheme: "https://login.proxy.example.org/login?qurl=%u",
					hosts: ["journal.example.com"]
				});
				
				let originalUrl = "https://journal.example.com/article/123/view?tab=references&format=pdf";
				let proxiedUrl = proxy.toProxy(originalUrl);
				
				return {
					proxiedUrl,
					originalUrl,
					expectedUrl: "https://login.proxy.example.org/login?qurl=" + encodeURIComponent(originalUrl)
				};
			});
			
			assert.equal(result.proxiedUrl, result.expectedUrl);
			assert.isTrue(result.proxiedUrl.includes(encodeURIComponent("tab=references&format=pdf")));
		});
		
		it('should preserve pathname and query string with toProperScheme', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["journal.example.com"]
				});
				
				let originalUrl = "http://journal.example.com/article/123/view?tab=references&format=pdf";
				let proxiedUrl = proxy.toProxy(originalUrl);
				
				return {
					proxiedUrl,
					originalUrl
				};
			});
			
			assert.equal(result.proxiedUrl, "http://journal.example.com.proxy.example.org/article/123/view?tab=references&format=pdf");
		});
		
		it('should replace dots with hyphens for HTTPS URLs', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["test.example.com"]
				});
				
				let originalUrl = "https://test.example.com/path";
				let proxiedUrl = proxy.toProxy(originalUrl);
				
				return {
					proxiedUrl,
					originalUrl
				};
			});
			
			assert.equal(result.proxiedUrl, "https://test-example-com.proxy.example.org/path");
		});
	});
	
	describe('toProper', function() {
		it('should preserve pathname and query string when converting back', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["journal.example.com"]
				});
				
				let proxiedUrl = "https://journal.example.com.proxy.example.org/article/123/view?tab=references&format=pdf";
				let properUrl = proxy.toProper(proxiedUrl);
				
				return {
					properUrl,
					expectedUrl: "https://journal.example.com/article/123/view?tab=references&format=pdf"
				};
			});
			
			assert.equal(result.properUrl, result.expectedUrl);
		});
		
		it('should handle HTTPS URLs with hyphens converted back to dots', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["test.example.com"]
				});
				
				let proxiedUrl = "https://test-example-com.proxy.example.org/path?query=test";
				let properUrl = proxy.toProper(proxiedUrl);
				
				return {
					properUrl,
					expectedUrl: "https://test.example.com/path?query=test"
				};
			});
			
			assert.equal(result.properUrl, result.expectedUrl);
		});
		
		it('should return original URL if not proxied', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["example.com"]
				});
				
				let unproxiedUrl = "https://different.example.com/path";
				let properUrl = proxy.toProper(unproxiedUrl);
				
				return {
					properUrl,
					originalUrl: unproxiedUrl
				};
			});
			
			assert.equal(result.properUrl, result.originalUrl);
		});
	});
	
	describe('round-trip conversion', function() {
		it('should maintain URL integrity through toProxy and toProper cycle', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					hosts: ["journal.example.com"]
				});
				
				let originalUrl = "https://journal.example.com/articles/view/123?format=pdf&lang=en";
				let proxiedUrl = proxy.toProxy(originalUrl);
				let backToProperUrl = proxy.toProper(proxiedUrl);
				
				return {
					originalUrl,
					proxiedUrl,
					backToProperUrl
				};
			});
			
			assert.equal(result.backToProperUrl, result.originalUrl);
			assert.notEqual(result.proxiedUrl, result.originalUrl);
			assert.isTrue(result.proxiedUrl.includes("proxy.example.org"));
		});
		
		it('should maintain URL integrity with toProxyScheme', async function () {
			let result = await background(function() {
				let proxy = new Zotero.Proxy({
					toProperScheme: "%h.proxy.example.org/%p",
					toProxyScheme: "https://login.proxy.example.org/login?qurl=%u",
					hosts: ["journal.example.com"]
				});
				
				let originalUrl = "https://journal.example.com/articles/view/123?format=pdf&lang=en";
				let proxiedUrl = proxy.toProxy(originalUrl);
				
				// Extract the original URL from the proxy login URL
				let urlMatch = proxiedUrl.match(/qurl=([^&]+)/);
				let extractedUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
				
				return {
					originalUrl,
					proxiedUrl,
					extractedUrl
				};
			});
			
			assert.equal(result.extractedUrl, result.originalUrl);
			assert.isTrue(result.proxiedUrl.includes("login.proxy.example.org"));
		});
	});
});
