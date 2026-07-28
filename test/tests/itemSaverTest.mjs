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
						if (method == 'saveItems') {
							savedPayload = payload;
							return {};
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
						proxy: {
							toJSON: () => ({ scheme: 'https://%h.proxy.example.com/%p' })
						},
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
			assert.equal(result.lookupPayload.proxy.scheme, 'https://%h.proxy.example.com/%p');
			assert.equal(result.progressUpdates[0].existingItems[0].id, 123);
		});

		it('rechecks existing items when the save target changes during lookup', async function() {
			let result = await tab.run(async function () {
				try {
					let target = 'L1';
					let lookupTargets = [];
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method, payload) => {
						if (method != 'findExistingItems') {
							return {};
						}
						lookupTargets.push(payload.target);
						if (lookupTargets.length == 1) {
							target = 'L2';
							return {
								matches: [{
									id: 111,
									matchedIdentifiers: {
										doi: '10.1234/target-change'
									}
								}]
							};
						}
						return {
							matches: [{
								id: 222,
								matchedIdentifiers: {
									doi: '10.1234/target-change'
								}
							}]
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

					let items = [{
						id: 'item-1',
						itemType: 'journalArticle',
						title: 'Target Change Article',
						DOI: '10.1234/target-change',
						attachments: []
					}];
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						getTarget: () => target
					});
					let shouldSave = await itemSaver._checkExistingItems(
						items,
						Zotero.Utilities.deepCopy(items)
					);

					return {
						shouldSave,
						lookupTargets,
						existingItems: items[0].existingItems,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.isTrue(result.shouldSave);
			assert.deepEqual(result.lookupTargets, ['L1', 'L2']);
			assert.equal(result.existingItems[0].id, 222);
			assert.equal(result.progressUpdates[0].existingItems[0].id, 222);
		});

		it('skips a stale warning when the save target changes during the retry', async function() {
			let result = await tab.run(async function () {
				try {
					let target = 'L1';
					let lookupTargets = [];
					let progressUpdates = [];
					let confirmCount = 0;
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method, payload) => {
						if (method != 'findExistingItems') {
							return {};
						}
						lookupTargets.push(payload.target);
						target = lookupTargets.length == 1 ? 'L2' : 'L3';
						return {
							matches: [{
								id: lookupTargets.length,
								matchedIdentifiers: {
									doi: '10.1234/repeated-target-change'
								}
							}]
						};
					});
					sinon.stub(Zotero.Messaging, "sendMessage").callsFake((message, data) => {
						if (message == 'confirm') {
							confirmCount++;
							return { button: 1 };
						}
						if (message == 'progressWindow.itemProgress') {
							progressUpdates.push(data);
						}
					});

					let items = [{
						id: 'item-1',
						itemType: 'journalArticle',
						title: 'Repeated Target Change Article',
						DOI: '10.1234/repeated-target-change',
						attachments: []
					}];
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						getTarget: () => target
					});
					let shouldSave = await itemSaver._checkExistingItems(
						items,
						Zotero.Utilities.deepCopy(items)
					);

					return {
						shouldSave,
						lookupTargets,
						existingItems: items[0].existingItems,
						progressUpdates,
						confirmCount
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.isTrue(result.shouldSave);
			assert.deepEqual(result.lookupTargets, ['L1', 'L2']);
			assert.isUndefined(result.existingItems);
			assert.isEmpty(result.progressUpdates);
			assert.equal(result.confirmCount, 0);
		});

		it('matches proxied item URLs against deproxified lookup matches', async function() {
			let result = await tab.run(async function () {
				try {
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Proxied Page',
									matchedFields: ['url'],
									matchedIdentifiers: {
										url: 'https://www.example.com/path'
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
						itemType: 'webpage',
						title: 'New Proxied Page',
						url: 'https://www-example-com.proxy.example.com/path',
						attachments: []
					};
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'webpage',
						baseURI: 'https://www-example-com.proxy.example.com/path',
						proxy: {
							toJSON: () => ({ scheme: 'https://%h.proxy.example.com/%p' }),
							toProper: (url) => url.replace('www-example-com.proxy.example.com', 'www.example.com')
						}
					});
					await itemSaver.saveItems([item]);

					return {
						existingItems: item.existingItems,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
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
			assert.equal(result.progressUpdates[0].existingItems[0].id, 123);
		});

		it('annotates items matched by server-provided item index', async function() {
			let result = await tab.run(async function () {
				try {
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Extra DOI Article',
									matchedItemIndex: 0,
									matchedFields: ['DOI'],
									matchedIdentifiers: {
										doi: '10.1234/extra-only'
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
						title: 'New Extra DOI Article',
						extra: 'DOI: 10.1234/extra-only',
						attachments: []
					};
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						baseURI: 'https://example.com/article'
					});
					await itemSaver.saveItems([item]);

					return {
						existingItems: item.existingItems,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
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
			assert.equal(result.progressUpdates[0].existingItems[0].id, 123);
		});

		it('falls back to identifier matching when a server-provided item index points to another matching item', async function() {
			let result = await tab.run(async function () {
				try {
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Shared DOI Article',
									matchedItemIndex: 0,
									matchedFields: ['DOI'],
									matchedIdentifiers: {
										doi: '10.1234/shared-doi'
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

					let items = [
						{
							id: 'item-1',
							itemType: 'journalArticle',
							title: 'First Shared DOI Article',
							DOI: '10.1234/shared-doi',
							attachments: []
						},
						{
							id: 'item-2',
							itemType: 'journalArticle',
							title: 'Second Shared DOI Article',
							DOI: '10.1234/shared-doi',
							attachments: []
						}
					];
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'journalArticle',
						baseURI: 'https://example.com/article'
					});
					await itemSaver.saveItems(items);

					return {
						firstExistingItems: items[0].existingItems,
						secondExistingItems: items[1].existingItems,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.equal(result.firstExistingItems[0].id, 123);
			assert.equal(result.secondExistingItems[0].id, 123);
			assert.sameMembers(result.progressUpdates.map(update => update.id), ['item-1', 'item-2']);
		});

		it('annotates every item index returned for a shared Extra DOI match', async function() {
			let result = await tab.run(async function () {
				try {
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Shared Extra DOI Article',
									matchedItemIndex: 0,
									matchedItemIndexes: [0, 1],
									matchedFields: ['DOI'],
									matchedIdentifiers: {
										doi: '10.1234/shared-extra-doi'
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

					let items = [
						{
							id: 'item-1',
							itemType: 'webpage',
							title: 'First Shared Extra DOI Page',
							extra: 'DOI: 10.1234/shared-extra-doi',
							attachments: []
						},
						{
							id: 'item-2',
							itemType: 'webpage',
							title: 'Second Shared Extra DOI Page',
							extra: 'DOI: 10.1234/shared-extra-doi',
							attachments: []
						}
					];
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'webpage',
						baseURI: 'https://example.com/article'
					});
					await itemSaver.saveItems(items);

					return {
						firstExistingItems: items[0].existingItems,
						secondExistingItems: items[1].existingItems,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.equal(result.firstExistingItems[0].id, 123);
			assert.equal(result.secondExistingItems[0].id, 123);
			assert.sameMembers(result.progressUpdates.map(update => update.id), ['item-1', 'item-2']);
		});

		it('treats matched item indexes as authoritative over identifier fallback', async function() {
			let result = await tab.run(async function () {
				let itemSaver = new Zotero.ItemSaver({
					sessionID: 'test-session',
					itemType: 'journalArticle'
				});
				let match = {
					matchedItemIndexes: [0],
					matchedIdentifiers: {
						doi: '10.1234/shared-doi'
					}
				};
				let items = [
					{ DOI: '10.1234/shared-doi' },
					{ DOI: '10.1234/shared-doi' }
				];
				return items.map((item, index) =>
					itemSaver._itemMatchesExistingItem(item, match, index)
				);
			});

			assert.deepEqual(result, [true, false]);
		});

		it('continues saving when proxied duplicate URL normalization fails', async function() {
			let result = await tab.run(async function () {
				try {
					let saveItemsCalled = false;
					let progressUpdates = [];
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
					});
					sinon.stub(Zotero.Connector, "callMethod").callsFake(async (method) => {
						if (method == 'findExistingItems') {
							return {
								matches: [{
									id: 123,
									title: 'Existing Page',
									matchedFields: ['url'],
									matchedIdentifiers: {
										url: 'https://www.example.com/path'
									}
								}]
							};
						}
						if (method == 'saveItems') {
							saveItemsCalled = true;
							return {};
						}
						return {
							filesEditable: false
						};
					});
					sinon.stub(Zotero.Messaging, "sendMessage").callsFake((message, data) => {
						if (message == 'progressWindow.itemProgress') {
							progressUpdates.push(data);
						}
					});
					sinon.stub(Zotero, "debug").callsFake(() => {});

					let item = {
						id: 'item-1',
						itemType: 'webpage',
						title: 'New Page',
						url: '/relative/path',
						attachments: []
					};
					let itemSaver = new Zotero.ItemSaver({
						sessionID: 'test-session',
						itemType: 'webpage',
						baseURI: 'https://example.com',
						proxy: {
							toJSON: () => ({ scheme: 'https://%h.proxy.example.com/%p' }),
							toProper: () => {
								throw new Error('Invalid URL');
							}
						}
					});
					await itemSaver.saveItems([item]);

					return {
						existingItems: item.existingItems,
						saveItemsCalled,
						progressUpdates
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
						Zotero.Connector.callMethod,
						Zotero.Messaging.sendMessage,
						Zotero.debug
					]) {
						if (stub && stub.restore) {
							stub.restore();
						}
					}
				}
			});

			assert.isUndefined(result.existingItems);
			assert.isTrue(result.saveItemsCalled);
			assert.lengthOf(result.progressUpdates, 0);
		});

		it('cancels saving when the existing item warning is dismissed', async function() {
			let result = await tab.run(async function () {
				try {
					let saveItemsCalled = false;
					let progressClosed = false;
					let pendingSessionUpdateCleared = false;
					sinon.stub(Zotero.Connector, "getPref").callsFake((pref) => {
						if (pref == 'supportsAttachmentUpload') return true;
						if (pref == 'automaticSnapshots') return true;
						if (pref == 'downloadAssociatedFiles') return true;
						return null;
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
						if (method == 'saveItems') {
							saveItemsCalled = true;
							return {};
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
						if (message == 'progressWindow.clearPendingSessionUpdate') {
							pendingSessionUpdateCleared = true;
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
						pendingSessionUpdateCleared,
						progressClosed,
						saveItemsCalled
					};
				}
				finally {
					for (let stub of [
						Zotero.Connector.getPref,
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
			assert.isTrue(result.pendingSessionUpdateCleared);
			assert.isTrue(result.progressClosed);
		});
	});
});
