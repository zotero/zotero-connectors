/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
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

// Mocha configuration for E2E tests

module.exports = {
	require: 'test/support/puppeteerSetup.mjs',
	globalSetup: 'test/support/puppeteerSetup.mjs',
	globalTeardown: 'test/support/puppeteerSetup.mjs',
	spec: ['test/tests/**/*Test.mjs'],
	timeout: '5000', // 5 seconds timeout for async operations
	ui: 'bdd',
	reporter: 'spec',
}; 