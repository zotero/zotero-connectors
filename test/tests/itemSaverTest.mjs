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

	describe('_checkExistingItems', function() {
		it('annotates matching items without blocking the subsequent save', async function() {
			let result = await tab.run(async function () {
				try {
					let savedPayload;
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethodWithCookies").callsFake(async (method, payload) => {
						savedPayload = payload;
						return {};
					});
					let lookupPayload;
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method, payload) => {
						if (method == 'findExistingItems') {
							lookupPayload = payload;
							return {
								matches: [{
									id: 123,
									title: 'Existing Article',
									matchedFields: ['DOI'],
									matchedIdentifiers: {
										doi: '10.1234/example.1'
									}
								}]
							};
						}
						return {
							filesEditable: false
						};
					});
					sinon.stub(Zotero.Messaging, "sendMessage").callsFake((message, data) => {
						if (message == 'confirm') {
							return { button: 1 };
						}
						if (message == 'progressWindow.itemProgress') {
							progressUpdates.push(data);
						}
					});

					let item = {
						id: 'item-1',
						itemType: 'journalArticle',
						title: 'New Article',
						DOI: '10.1234/example.1',
						url: 'https://example.com/article',
						attachments: []
					};
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						baseURI: 'https://example.com/article',
						getTarget: () => 'L123'
					});
					await itemSaver.saveItems([item]);

					return {
						existingItems: item.existingItems,
						savedPayloadItem: savedPayload.items[0],
						lookupPayload,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
						Zotero.Connector.callMethodWithCookies,
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.equal(result.existingItems[0].id, 123);
			assert.isUndefined(result.savedPayloadItem.existingItems);
			assert.equal(result.lookupPayload.target, 'L123');
			assert.equal(result.progressUpdates[0].existingItems[0].id, 123);
		});

		it('cancels saving when the existing item warning is dismissed', async function() {
			let result = await tab.run(async function () {
				try {
					let saveItemsCalled = false;
					let progressClosed = false;
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethodWithCookies").callsFake(async () => {
						saveItemsCalled = true;
						return {};
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Article',
									matchedIdentifiers: {
										doi: '10.1234/example.1'
									}
								}]
							};
						}
						return {
							filesEditable: false
						};
					});
					sinon.stub(Zotero.Messaging, "sendMessage").callsFake((message) => {
						if (message == 'confirm') {
							return { button: 2 };
						}
						if (message == 'progressWindow.close') {
							progressClosed = true;
						}
					});

					let item = {
						id: 'item-1',
						itemType: 'journalArticle',
						title: 'New Article',
						DOI: '10.1234/example.1',
						attachments: []
					};
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						baseURI: 'https://example.com/article'
					});
					let error;
					try {
						await itemSaver.saveItems([item]);
					}
					catch (e) {
						error = e;
					}

					return {
						cancelled: !!error?.zoteroSaveCancelled,
						existingItems: item.existingItems,
						progressClosed,
						saveItemsCalled
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
						Zotero.Connector.callMethodWithCookies,
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.isTrue(result.cancelled);
			assert.equal(result.existingItems[0].id, 123);
			assert.isFalse(result.saveItemsCalled);
			assert.isTrue(result.progressClosed);
		});
	});
});
