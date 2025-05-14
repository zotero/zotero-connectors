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

import { background, getExtensionURL, Tab } from '../support/utils.mjs';

describe("ContentTypeHandler", function() {
	const url = 'https://www.zotero.org/';
	describe('#handleImportableContent()', function() {
		var tab;
		before(async function() {
			tab = new Tab();
			await tab.init('about:blank');
			await background(async () => {
				sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
			})
		});
		
		after(async function() {
			await tab.close();
			await background(async () => {
				Zotero.Connector.checkIsOnline.restore();
			})
		});
		
		it('displays an import prompt and imports on OK click', async function() {
			let importUrl = await background(async function(tabId, url) {
				try {
					var stub1 = sinon.stub(Zotero.ContentTypeHandler, 'confirm');
					stub1.resolves({button: 1});
					var stub2 = sinon.stub(Zotero.ContentTypeHandler, 'importFile');
					var deferred = Zotero.Promise.defer();
					stub2.callsFake(function(url) {
						return deferred.resolve(url);
					});
					Zotero.ContentTypeHandler.handleImportableContent(url, tabId);
						
					let result = await deferred.promise;
					return result;
				} finally {
					stub1.restore();
					stub2.restore();
				}
			}, tab.tabId, url);
			assert.equal(importUrl, url);
		});
		
		it('displays an import prompt and navigates to target url on Cancel click', async function() {
			let redirectUrl = await background(async function(tabId, url) {
				try {
					// stubbing Zotero.Messaging.sendMessage('confirm', props, tab);
					var stub1 = sinon.stub(Zotero.ContentTypeHandler, 'confirm');
					stub1.resolves({button: 2});
					var deferred = Zotero.Promise.defer();
					var stub2 = sinon.stub(Zotero.ContentTypeHandler, '_redirectToOriginal').callsFake(function(tabId, url) {
						deferred.resolve(url);
					});
					Zotero.ContentTypeHandler.handleImportableContent(url, tabId);
						
					let result = await deferred.promise;
					return result;
				} finally {
					stub1.restore();
					stub2.restore();
				}
			}, tab.tabId, url);
			assert.equal(redirectUrl, url);
		});
	});

	describe('#confirm()', function() {
		var tab;
		before(async function() {
			tab = new Tab();
			await tab.init('about:blank');
			await background(async () => {
				sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
			})
		});
		
		after(async function() {
			await tab.close();
			await background(async () => {
				Zotero.Connector.checkIsOnline.restore();
			})
		});

		it('navigates to confirmation page if no injection context available', async function () {
			await background(async (tabId) => {
				const sendMessageStub = sinon.stub(Zotero.Messaging, 'sendMessage');
				try {
					let result = await new Promise((resolve) => {
						sendMessageStub.onFirstCall().resolves(undefined);
						sendMessageStub.onSecondCall().callsFake(() => {
							resolve();
							return true;
						});
						Zotero.ContentTypeHandler.confirm('test', tabId);
					});
					return result;
				}
				finally {
					sendMessageStub.restore();
				}
			}, tab.tabId);

			let pageUrl = tab.page.url();
			assert.equal(pageUrl, getExtensionURL('confirm/confirm.html'));
		});
	});
});
