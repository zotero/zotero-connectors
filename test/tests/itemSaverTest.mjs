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

describe("ItemSaver", function() {
	var tab = new Tab();

	before(async function() {
		await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
	});

	after(async function () {
		await tab.close();
	});

	describe('_executeSingleFile', function() {
		it('sets data.url to item.url when item has url defined', async function() {
			const testUrl = 'https://example.com/test-article';

			const capturedData = await tab.run(async function (testUrl) {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						url: testUrl,
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			}, testUrl);

			// Verify data.url is set to item.url
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, testUrl);
		});

		it('sets data.url to document.location.href when item has no url defined', async function() {
			const documentUrl = getExtensionURL('test/data/journalArticle-single.html');
			const capturedData = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;
					let capturedData = null;

					// Stub the required functions
					sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("test content");
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async (options, data) => {
						capturedData = data;
					});

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
					});

					// Set up test data
					itemSaver._items = [{
						// No url
					}];
					itemSaver._snapshotAttachment = {
						title: 'Test Snapshot',
					};
					itemSaver._sessionID = 'test-session';

					await itemSaver._executeSingleFile(() => 0);

					return capturedData;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			});

			// Verify data.url is set to document.location.href
			assert.isNotNull(capturedData);
			assert.equal(capturedData.url, documentUrl);
		});
	});

	describe('_saveToServer', function() {
		async function saveWithAutomaticTags(automaticTags) {
			return tab.run(async function (automaticTags) {
				let submittedItems;
				try {
					sinon.stub(Zotero.Prefs, 'getAsync').callsFake(async pref => {
						if (pref === 'automaticTags') return automaticTags;
						return {
							downloadAssociatedFiles: false,
							automaticSnapshots: false,
						};
					});
					sinon.stub(Zotero.API, 'createItem').callsFake(async items => {
						submittedItems = items;
						return JSON.stringify({ success: [1] });
					});

					let item = {
						itemType: 'journalArticle',
						title: 'Tagged Item',
						tags: [
							{ tag: 'Automatic', type: 1 },
							{ tag: 'Manual', type: 0 },
						],
						attachments: [],
					};
					let itemSaver = new Zotero.ItemSaver({ sessionID: 'test-session' });
					await itemSaver._saveToServer([item], () => 0);

					return { submittedItems, originalTags: item.tags };
				}
				finally {
					Zotero.Prefs.getAsync.restore();
					Zotero.API.createItem.restore();
				}
			}, automaticTags);
		}

		it('omits automatic tags from server saves when automatic tagging is disabled', async function() {
			let { submittedItems, originalTags } = await saveWithAutomaticTags(false);

			assert.deepEqual(submittedItems[0].tags, [{ tag: 'Manual', type: 1 }]);
			assert.deepEqual(originalTags, [
				{ tag: 'Automatic', type: 1 },
				{ tag: 'Manual', type: 0 },
			]);
		});

		it('includes automatic tags in server saves when automatic tagging is enabled', async function() {
			let { submittedItems } = await saveWithAutomaticTags(true);

			assert.deepEqual(submittedItems[0].tags, [
				{ tag: 'Automatic', type: 1 },
				{ tag: 'Manual', type: 1 },
			]);
		});
	});
});
