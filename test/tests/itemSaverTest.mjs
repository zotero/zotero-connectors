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
	describe('_saveToZotero', function () {
		before(async function () {
			await background(function () {
				sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
				sinon.stub(Zotero.Connector, 'callMethodWithCookies').callsFake(async () => ({ items: [] }));
			});
		});

		after(async function () {
			await background(function () {
				Zotero.Connector.checkIsOnline.restore();
				Zotero.Connector.callMethodWithCookies.restore();
			});
		});

		it('filters out attachments without URLs', async function () {
			const result = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;

					// Stub sendMessage in content script context
					sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(() => { });

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
						baseURI: 'https://example.com'
					});

					const items = [{
						title: 'Test Item',
						itemType: 'journalArticle',
						attachments: [
							{ title: 'Valid PDF', url: 'https://example.com/file.pdf', mimeType: 'application/pdf' },
							{ title: 'No URL', mimeType: 'application/pdf' },
							{ title: 'Also Valid', url: 'https://example.com/other.pdf', mimeType: 'application/pdf' },
						]
					}];

					await itemSaver._saveToZotero(items, () => 0, () => 0);

					return items[0].attachments.map(a => a.title);
				}
				finally {
					Zotero.Messaging.sendMessage.restore();
				}
			});

			// Verify only valid attachments are included
			assert.deepEqual(result, ['Valid PDF', 'Also Valid']);
		});

		it('keeps link-only attachments (snapshot === false) even without URLs', async function () {
			const result = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;

					// Stub sendMessage in content script context
					sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(() => { });

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
						baseURI: 'https://example.com'
					});

					const items = [{
						title: 'Test Item',
						itemType: 'journalArticle',
						attachments: [
							{ title: 'Valid PDF', url: 'https://example.com/file.pdf', mimeType: 'application/pdf' },
							{ title: 'Link Only No URL', mimeType: 'text/html', snapshot: false }, // Should be kept
							{ title: 'Regular No URL', mimeType: 'application/pdf' }, // Should be filtered out
						]
					}];

					await itemSaver._saveToZotero(items, () => 0, () => 0);

					return items[0].attachments.map(a => a.title);
				}
				finally {
					Zotero.Messaging.sendMessage.restore();
				}
			});

			// Verify only valid attachments are included
			assert.deepEqual(result, ['Valid PDF', 'Link Only No URL']);
		});

		it('sets default attachment title when mimeType is undefined', async function () {
			const result = await tab.run(async function () {
				try {
					const ItemSaver = Zotero.ItemSaver;

					// Stub sendMessage in content script context
					sinon.stub(Zotero.Messaging, 'sendMessage').callsFake(() => { });

					// Create ItemSaver instance with test data
					const itemSaver = new ItemSaver({
						sessionID: 'test-session',
						baseURI: 'https://example.com'
					});

					const items = [{
						title: 'Test Item',
						itemType: 'journalArticle',
						attachments: [
							{ url: 'https://example.com/file' }, // No title, no mimeType
						]
					}];

					await itemSaver._saveToZotero(items, () => 0, () => 0);

					return items[0].attachments[0].title;
				}
				finally {
					Zotero.Messaging.sendMessage.restore();
				}
			});

			assert.isString(result);
			assert.equal(result, 'Unknown Attachment');
		});
	});
}); 