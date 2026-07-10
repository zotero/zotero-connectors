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

import { Tab, background, getExtensionURL } from '../support/utils.mjs';

describe('Connector_Browser', function() {
	var tab = new Tab();

	describe('#getAllCookies()', function() {
		it('uses the Safari cookie store associated with the tab', async function() {
			let details = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.cookies, 'getAllCookieStores').resolves([
					{id: 'persistent-1', tabIds: []},
					{id: 'persistent-2', tabIds: [123]}
				]);
				sinon.stub(browser.cookies, 'getAll').resolves([]);
				try {
					await Zotero.Connector_Browser.getAllCookies({url: 'https://example.com/'}, 123);
					return browser.cookies.getAll.firstCall.args[0];
				}
				finally {
					browser.cookies.getAllCookieStores.restore();
					browser.cookies.getAll.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.deepEqual(details, {
				url: 'https://example.com/',
				storeId: 'persistent-2'
			});
		});

		it('uses the active tab to resolve the Safari cookie store when no tab is provided', async function() {
			let details = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.tabs, 'query').resolves([{id: 123}]);
				sinon.stub(browser.cookies, 'getAllCookieStores').resolves([
					{id: 'persistent-1', tabIds: []},
					{id: 'persistent-2', tabIds: [123]}
				]);
				sinon.stub(browser.cookies, 'getAll').resolves([]);
				try {
					await Zotero.Connector_Browser.getAllCookies({name: 'target'});
					return browser.cookies.getAll.firstCall.args[0];
				}
				finally {
					browser.tabs.query.restore();
					browser.cookies.getAllCookieStores.restore();
					browser.cookies.getAll.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.deepEqual(details, {
				name: 'target',
				storeId: 'persistent-2'
			});
		});
	});
	
	describe('onPDFFrame', function() {
		it('sets icon to PDF if no translators present', async function () {
			try {
				let bgPromise = background(function() {
					Zotero.Prefs.set('firstUse', false);
					let stub = sinon.stub(Zotero.Connector_Browser, '_showPDFIcon');
					var deferred = Zotero.Promise.defer();
					stub.callsFake(deferred.resolve);
					
					// Independent of the online status of Zotero client we need to observe content types
					// to trigger the onPDFFrame icon, but don't want to affect the already attached
					// observer state, so we generate a custom function to work with
					let customObserver = details => Zotero.ContentTypeHandler.onHeadersReceived(details);
					Zotero.WebRequestIntercept.addListener('headersReceived', customObserver);
					deferred.promise.then(() => Zotero.WebRequestIntercept.removeListener('headersReceived', customObserver));
					return deferred.promise;
				});
				const url = getExtensionURL('test/data/framePDF.html');
				await tab.init(url);
				await bgPromise;
	
				let result = await background(() => {
					return Zotero.Connector_Browser._showPDFIcon.called;
				});
				assert.isTrue(result);
			} finally {
				await background(function() {
					Zotero.Connector_Browser._showPDFIcon.restore()
				});
				if (tab.tabId) {
					await tab.close();
				}
			}
		});
	});
});