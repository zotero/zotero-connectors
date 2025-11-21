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

import { Tab, background, getExtensionURL, delay } from '../support/utils.mjs';

describe("Inject", function() {
	var tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
	});

	after(async function () {
		await tab.close();
	});

	describe('_addZoteroButtonElementListener', function() {
		before(async () => {
			await background(() => {
				sinon.stub(Zotero.Connector_Browser, "onZoteroButtonElementClick").resolves();
			});
		})
		after(async () => {
			await background(() => {
				Zotero.Connector_Browser.onZoteroButtonElementClick.restore();
			});
		})
		
		it('triggers Connector_Browser.onZoteroButtonElementClick when Zotero button element is clicked', async function() {
			await tab.run(async () => {
				await Zotero.initDeferred.promise
				await new Promise(resolve => setTimeout(resolve, 200));
				document.querySelector("a[href='https://www.zotero.org/save']").click();
			});
			// This should be improved if intermittent failures start occurring,
			// but how long can the propagation from content to background script can take?
			await delay(200);

			let result = await background(async () => {
				return Zotero.Connector_Browser.onZoteroButtonElementClick.args[0][0].id;
			});

			assert.equal(result, tab.tabId, 'Connector_Browser.onZoteroButtonElementClick called with the tab ID');
		});
	});
}); 