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

describe('Proxies', function() {
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
			let url = 'http://www.zotero.org';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 1);
			assert.isNull(proxies[url]);
		});
		
		it('returns a simple proxy if link proxied', async function() {
			let url = 'http://www.zotero.org.proxy.example.com';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 2);
			assert.isNull(proxies[url]);
			assert.equal(proxies['http://www.zotero.org'].scheme, '%h.proxy.example.com/%p');
		});
		
		it('returns an unhyphenated proxy if link is proxied with https hyphenation', async function() {
			let url = 'https://www-zotero-org.proxy.example.com';
			let proxies = await background((url) => Zotero.Proxies.getPotentialProxies(url), url);
			assert.equal(Object.keys(proxies).length, 2);
			assert.isNull(proxies[url]);
			assert.equal(proxies['https://www.zotero.org'].scheme, '%h.proxy.example.com/%p');
			assert.isTrue(proxies['https://www.zotero.org'].dotsToHyphens);
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
