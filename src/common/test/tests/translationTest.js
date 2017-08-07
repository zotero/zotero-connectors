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

describe("Translation", function() {
	var tab = new Tab();

	before(Promise.coroutine(function* () {
		// Make sure translators initialized
		let translators = yield background(function() {
			// Failure to init is fine
			return Zotero.Repo.init().catch(e => 0).then(function() {
				return Promise.all([
					Zotero.Translators.get('05d07af9-105a-4572-99f6-a8e231c0daef'),
					Zotero.Translators.get('c159dcfe-8a53-4301-a499-30f6549c340d'),
					Zotero.Translators.get('951c027d-74ac-47d4-a107-9c3069ab7b48')
				]);
			});
		});
		assert.equal(3, translators.length);
		yield tab.init(chrome.extension.getURL('test/data/journalArticle-single.html'));
	}));
	
	after(Promise.coroutine(function* () {
		yield tab.close();
	}));
	
	describe("Detection", function() {
		it('detects expected translators', Promise.coroutine(function* () {
			var translators = yield tab.run(function() {
				return Object.keys(Zotero.Inject.translators).map(function(key) {
					return Zotero.Inject.translators[key].metadata.label;
				});
			});
			assert.deepEqual(['COinS', 'DOI'], translators);
		}));
	});
	
	describe("Saving", function() {
		describe("To Zotero", function() {
			before(Promise.coroutine(function* () {
				return background(function() {
					sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
				});
			}));
			
			after(Promise.coroutine(function* () {
				return background(function() {
					Zotero.Connector.checkIsOnline.restore();
				});	
			}));
			
			it('saves with a translator', Promise.coroutine(function* () {
				var items = yield background(function(tabId) {
					var stub = sinon.stub(Zotero.Connector, "callMethodWithCookies").resolves([]);
					var deferred = Zotero.Promise.defer();
					chrome.tabs.get(tabId, function(tab) {
						Zotero.Connector_Browser._saveWithTranslator(tab, 0).then(deferred.resolve).catch(deferred.reject);
					});
					return deferred.promise.catch(e => ['error', e]).then((r) => {stub.restore(); return r});
				}, tab.tabId);
				assert.equal(items.length, 1);
				assert.equal(items[0].itemType, 'journalArticle');
				var message = yield tab.run(function() {
					var message = document.getElementById('zotero-progress-window').textContent;
					Zotero.ProgressWindow.close();
					return message;
				});
				assert.include(message, items[0].title);
			}));
		
			it('saves as snapshot', Promise.coroutine(function* () {
				yield background(function(tabId) {
					var stub = sinon.stub(Zotero.Connector, "callMethodWithCookies").resolves([]);
					var deferred = Zotero.Promise.defer();
					chrome.tabs.get(tabId, function(tab) {
						Zotero.Connector_Browser._saveAsWebpage(tab, false).then(deferred.resolve).catch(deferred.reject);
					});
					return deferred.promise.catch(e => ['error', e]).then((r) => {stub.restore(); return r});
				}, tab.tabId);
				var message = yield tab.run(function() {
					var message = document.getElementById('zotero-progress-window').textContent;
					Zotero.ProgressWindow.close();
					return message;
				});
				assert.include(message, "Scarcity or Abundance? Preserving the Past in a Digital Era");	
			}));
				
			it('displays an error message if Zotero responds with an error', Promise.coroutine(function* () {
				yield background(function(tabId) {
					var stub = sinon.stub(Zotero.Connector, "callMethodWithCookies")
						.rejects(new Zotero.Connector.CommunicationError('Err', 500));
					// prevent reporting translator errors
					var stub2 = sinon.stub(Zotero.Prefs, 'get').returns(false);
					var deferred = Zotero.Promise.defer();
					chrome.tabs.get(tabId, function(tab) {
						Zotero.Connector_Browser._saveWithTranslator(tab, 0);
						// This should not be necessary at all, but there's a heisenbug here
						// The promise is not rejected for ~8 secs on chrome
						// unless you switch to the offending tab and open developer tools.
						// Instead we just wait a little bit to make sure that the progress window on the
						// tab is updated with the error message
						setTimeout(deferred.resolve, 200);
					});
					return deferred.promise
						.catch(e => ['error', e])
						.then((r) => {stub.restore(); stub2.restore(); return r});
				}, tab.tabId);	
				var message = yield tab.run(function() {
					var message = document.getElementById('zotero-progress-window').textContent;
					Zotero.ProgressWindow.close();
					return message;
				});
				assert.include(message, 'An error occurred while saving this item.');
			}));
		});
		
		describe("To zotero.org", function() {
			before(Promise.coroutine(function* () {
				return background(function() {
					sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(false);
				});
			}));
			
			after(Promise.coroutine(function* () {
				return background(function() {
					Zotero.Connector.checkIsOnline.restore();
				});	
			}));	
			
			it('displays a prompt when attempting to save to zotero.org for the first time', Promise.coroutine(function* () {
				yield background(function(tabId) {
					// First-time save
					var stub1 = sinon.stub(Zotero.Prefs, 'get').returns(true);
					var stub2 = sinon.stub(Zotero.Connector, "callMethod").rejects(new Zotero.Connector.CommunicationError('err'));
					var deferred = Zotero.Promise.defer();
					chrome.tabs.get(tabId, function(tab) {
						Zotero.Connector_Browser._saveWithTranslator(tab, 0).then(deferred.resolve).catch(deferred.reject);
					});
					deferred.promise.catch(e => ['error', e]).then((r) => {stub1.restore(); stub2.restore(); return r});
				}, tab.tabId);
				// Waiting for modal-prompt to be displayed
				yield Zotero.Promise.delay(50);
				var message = yield tab.run(function() {
					return document.getElementById('zotero-modal-prompt').textContent;
				});
				assert.include(message, 'The Zotero Connector was unable to communicate with the Zotero desktop application.');
			}));
			
			it('saves with a translator', Promise.coroutine(function* () {
				yield background(function(tabId) {
					Zotero.Prefs.get.returns(false);
				}, tab.tabId);
				
				var items = yield tab.run(function() {
					var spy = sinon.spy(Zotero.Translate.ItemSaver.prototype, 'saveItems');
					var stub1 = sinon.stub(Zotero.HTTP, 'request').resolves(
						{status: 200, responseText: JSON.stringify({success: {}})}
					);
					var stub2 = sinon.stub(Zotero.API, 'getUserInfo').resolves({userID: '', apiKey: ''});
					document.querySelector('input[name="3"]').click();
					var deferred = Zotero.Promise.defer();
					// Allow the button click to propagate
					setTimeout(function() {
						spy.lastCall.returnValue.then(deferred.resolve);
					});
					return deferred.promise.catch(e => ['error', e])
						.then(r => {spy.restore(); stub1.restore(); stub2.restore(); return r})
				});
				
				assert.equal(items.length, 1);
				assert.equal(items[0].itemType, 'journalArticle');
				var message = yield tab.run(function() {
					var message = document.getElementById('zotero-progress-window').textContent;
					// Zotero.ProgressWindow.close();
					return message;
				});
				assert.include(message, 'zotero.org');
				assert.include(message, items[0].title);
			}));
		});
	});
});
