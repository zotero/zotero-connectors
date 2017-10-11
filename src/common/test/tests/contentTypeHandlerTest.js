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

if (Zotero.isBrowserExt) {

describe("ContentTypeHandler", function() {
	describe('#observe()', function() {
		it('calls Zotero.Connector_Browser.onPDFFrame when pdf frame loads', Promise.coroutine(function* () {
			let args = yield background(function() {
				var stub = sinon.stub(Zotero.Connector_Browser, 'onPDFFrame');
				Zotero.ContentTypeHandler.observe({
					frameId: 1, tabId: 1, url: 'test', method: "GET",
					responseHeadersObject: {'content-type': 'application/pdf'}
				});
				return new Zotero.Promise(function(resolve, reject) {
					// onPDFFrame called out of observe event loop to not stall the page load
					// since it's a blocking call
					setTimeout(function() {
						try {
							resolve(stub.args[0])
						} catch (e) {
							reject(e);
						} finally {
							stub.restore();
						}
					}, 10);
				});
			});
			assert.deepEqual(args, ['test', 1, 1]);
		}));
	});
	
	describe('#handleImportContent()', function() {
		var tab;
		before(async function() {
			tab = await browser.tabs.create({url: 'about:blank', active: false})
		});
		
		after(async function() {
			await browser.tabs.remove(tab.id);
		});
		
		it('displays an import prompt and imports on OK click', async function() {
			let details = await background(async function(tabId) {
				try {
					// stubbing Zotero.Messaging.sendMessage('confirm', props, tab);
					var stub1 = sinon.stub(Zotero.Messaging, 'sendMessage');
					stub1.resolves({button: 1});
					var stub2 = sinon.stub(Zotero.ContentTypeHandler, 'importFile');
					var deferred = Zotero.Promise.defer();
					stub2.callsFake(function(details) {
						return deferred.resolve(details);
					});
					Zotero.ContentTypeHandler.observe({frameId: 1, tabId, url: 'test', method: "GET",
						responseHeadersObject: {'content-type': 'application/x-research-info-systems'}});
						
					let result = await deferred.promise;
					return result;
				} finally {
					stub1.restore();
					stub2.restore();
				}
			}, tab.id);
			assert.equal(details.url, 'test');
		});
		
		it('displays an import prompt and navigates to target url on Cancel click', async function() {
			let redirectUrl = await background(async function(tabId) {
				try {
					// stubbing Zotero.Messaging.sendMessage('confirm', props, tab);
					var stub1 = sinon.stub(Zotero.Messaging, 'sendMessage');
					stub1.resolves({button: 2});
					var deferred = Zotero.Promise.defer();
					var stub2 = sinon.stub(Zotero.ContentTypeHandler, '_redirectToOriginal').callsFake(function(tabId, url) {
						deferred.resolve(url);
					});
					Zotero.ContentTypeHandler.observe({frameId: 1, tabId, url: 'test', method: "GET",
						responseHeadersObject: {'content-type': 'application/x-research-info-systems'}});
						
					let result = await deferred.promise;
					return result;
				} finally {
					stub1.restore();
					stub2.restore();
				}
			}, tab.id);
			assert.equal(redirectUrl, 'test');
		});
		
		it('navigates to confirmation page if no injection context available', async function () {
			await background(async function(tabId) {
				try {
					let confirm = Zotero.ContentTypeHandler.confirm;
					var stub2 = sinon.stub(Zotero.ContentTypeHandler, 'confirm');
					var deferred = Zotero.Promise.defer();
					stub2.callsFake(async function(details) {
						let tab = await browser.tabs.get(details.tabId);
						if (tab.url.includes('confirm.html')) deferred.resolve();
						return confirm.apply(Zotero.ContentTypeHandler, arguments);
					});
					
					Zotero.ContentTypeHandler.observe({frameId: 1, tabId, url: 'http://www.zotero.org/', method: "GET",
						responseHeadersObject: {'content-type': 'application/x-research-info-systems'}});

					let result = await deferred.promise;
					return result;
				} finally {
					stub2.restore();
				}
			}, tab.id);
			tab = await browser.tabs.get(tab.id);
			
			assert.equal(tab.url, getExtensionURL('confirm.html'));
		});
	});
});

}
