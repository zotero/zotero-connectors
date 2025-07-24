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
					const ItemSaver = (await import(Zotero.getExtensionURL("itemSaver.js"))).default;
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
					const ItemSaver = (await import(Zotero.getExtensionURL("itemSaver.js"))).default;
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

		it('should error on cancelled session', async function () {
			const result = await tab.run(async function () {
				try {
					const ItemSaver = (await import(Zotero.getExtensionURL("itemSaver.js"))).default;

					// retrievePageData will take 100ms
					sinon.stub(Zotero.SingleFile, "retrievePageData").callsFake(async () => {
						return new Promise(resolve => setTimeout(() => resolve('testing'), 100));
					});
					
					sinon.stub(Zotero.Connector, "saveSingleFile").callsFake(async () => {
						throw new Error('Should never happen');
					});

					let itemSaver = new ItemSaver({ sessionID: 'test-session-987' });

					// Set up test data
					itemSaver._items = [{ url: 'https://example.com/test' }];
					itemSaver._snapshotAttachment = { title: 'Test Snapshot' };
					itemSaver._sessionID = 'test-session-758';

					// Cancel session after 10ms
					setTimeout(() => {
						itemSaver.cancelled = true;
					}, 10);

					// Call _executeSingleFile and capture the attachment callback parameters
					let callbackResult = null;
					await itemSaver._executeSingleFile((attachment, progress, message) => {
						callbackResult = { attachment, progress, message };
					});
					return callbackResult;
				}
				finally {
					Zotero.SingleFile.retrievePageData.restore();
					Zotero.Connector.saveSingleFile.restore();
				}
			});

			assert.equal(result.progress, false);
			assert.equal(result.message, "session_cancelled");
		});
	});

	describe('saveItems', function () {
		it('should error on cancelled session', async function () {
			const result = await tab.run(async function () {
				try {
					const ItemSaver = (await import(Zotero.getExtensionURL("itemSaver.js"))).default;

					let itemSaver = new ItemSaver({ sessionID: 'test-session-12345' });
					itemSaver.cancelled = true;
					
					// Try to save an item
					await itemSaver.saveItems([{
						itemType: 'webpage',
						title: 'Test Item',
						url: 'https://example.com',
						attachments: []
					}]);

					return { success: true };
				}
				catch (e) {
					return { error: e.message };
				}
			});

			assert.equal(result.error, 'session_cancelled');
		});
	});
});
