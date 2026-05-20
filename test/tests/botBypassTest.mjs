/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2026 Corporation for Digital Scholarship
					Vienna, Virginia, USA
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

describe('BotBypass', function() {
	describe('isUrlWhitelisted', function() {
		it('should return true for a whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.BotBypass.isUrlWhitelisted(url);
			}, 'https://www.sciencedirect.com/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return true for a subdomain of a whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.BotBypass.isUrlWhitelisted(url);
			}, 'https://foo.sciencedirect.com/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return false for a non-whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.BotBypass.isUrlWhitelisted(url);
			}, 'https://www.example.com/test.pdf');
			assert.isFalse(result);
		});

		it('should return true for a proxied whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.BotBypass.isUrlWhitelisted(url);
			}, 'https://www-sciencedirect-com.proxy.uni.edu/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return false for a proxied non-whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.BotBypass.isUrlWhitelisted(url);
			}, 'https://www-example-com.proxy.uni.edu/test.pdf');
			assert.isFalse(result);
		});
	});
});
