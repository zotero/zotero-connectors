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

	before(async function () {
		// Make sure translators initialized
		let translators = await background(function() {
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
	});
	
	describe('In the top frame', function() {
		before(async function() {
			await tab.init(getExtensionURL('test/data/journalArticle-single.html'))
		});
		after(async function () {
			await tab.close();
		});
		afterEach(async function () {
			await tab.run(() => Zotero.Inject.sessionDetails = {});
		});
		
		describe("Detection", function() {
			it('detects expected translators', async function () {
				var translators = await tab.run(function() {
					return Object.keys(Zotero.Inject.translators).map(function(key) {
						return Zotero.Inject.translators[key].metadata.label;
					});
				});
				assert.deepEqual(['COinS', 'DOI'], translators);
			});
		});
		
		describe("Saving", function() {
			describe("To Zotero", function() {
				before(async function () {
					return background(function() {
						sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
					});
				});
				
				after(async function () {
					return background(function() {
						Zotero.Connector.checkIsOnline.restore();
					});	
				});
				
				it('saves with a translator', async function () {
					var items = await background(async function(tabId) {
						var stub = sinon.stub(Zotero.Connector, "callMethodWithCookies").callsFake(async function(_, payload){
							return payload;
						});
						let tab = await Zotero.Background.getTabByID(tabId);
						try {
							var items = await Zotero.Connector_Browser.saveWithTranslator(tab, 0)
						} finally {
							stub.restore();
						}
						return items;
					}, tab.tabId);
					assert.equal(items.length, 1);
					assert.equal(items[0].itemType, 'journalArticle');
					var frameURL = getExtensionURL('progressWindow/progressWindow.html');
					var message = await tab.runInFrame(frameURL, async function() {
						// TODO: A more robust way to wait for the text to show up.
						await Zotero.Promise.delay(100);
						return document.querySelector('.ProgressWindow-progressBox').textContent;
					});
					assert.include(message, items[0].title);
				});
				
				it('saves with a translator that uses the select dialog', async function () {
					var items = await background(async function(tabId) {
						var stub1 = sinon.stub(Zotero.Connector, "callMethodWithCookies").callsFake(async function(_, payload){
							return payload;
						});
						var stub2 = sinon.stub(Zotero.Connector_Browser, "onSelect").callsFake(function(items) {
							return items;
						});
						try {
							var tab = await Zotero.Background.getTabByID(tabId);
							var items = await Zotero.Connector_Browser.saveWithTranslator(tab, 1);
						} finally {
							stub1.restore();
							stub2.restore();
						}
						return items;
					}, tab.tabId);
					assert.equal(items.length, 1);
					assert.equal(items[0].itemType, 'journalArticle');
					var frameURL = getExtensionURL('progressWindow/progressWindow.html');
					var message = await tab.runInFrame(frameURL, async function() {
						// TODO: A more robust way to wait for the text to show up.
						await Zotero.Promise.delay(100);
						return document.querySelector('.ProgressWindow-progressBox').textContent;
					});
					assert.include(message, items[0].title);
				});
			
				it('saves as snapshot', async function () {
					try {
						await background(async function (tabId) {
							sinon.stub(Zotero.Connector, "callMethod").resolves([]);
							let tab = await Zotero.Background.getTabByID(tabId);
							await Zotero.Connector_Browser.saveAsWebpage(tab);
						}, tab.tabId);
						await Zotero.Promise.delay(20);
						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var message = await tab.runInFrame(frameURL, async function() {
							// TODO: A more robust way to wait for the text to show up.
							await Zotero.Promise.delay(100);
							return document.querySelector('.ProgressWindow-progressBox').textContent;
						});
						assert.include(message, "Scarcity or Abundance? Preserving the Past in a Digital Era");
					} finally {
						await background(() => Zotero.Connector.callMethod.restore())
					}
				});
					
				it('displays an error message if Zotero responds with an error', async function () {
					await background(async function(tabId) {
						var stub = sinon.stub(Zotero.Connector, "callMethodWithCookies")
							.rejects(new Zotero.Connector.CommunicationError('Err', 500));
						// prevent reporting translator errors
						var stub2 = sinon.stub(Zotero.Prefs, 'get').returns(false);
						var tab = await Zotero.Background.getTabByID(tabId);
						try {
							await Zotero.Connector_Browser.saveWithTranslator(tab, 0);
						}
						catch (e) {}
						finally {
							stub.restore(); stub2.restore();	
						}
					}, tab.tabId);
					var frameURL = getExtensionURL('progressWindow/progressWindow.html');
					var message = await tab.runInFrame(frameURL, async function() {
						// TODO: A more robust way to wait for the text to show up.
						await Zotero.Promise.delay(100);
						return document.querySelector('.ProgressWindow-error').textContent;
					});
					assert.include(message, 'An error occurred while saving this item.');
				});
			});
			
			describe("To zotero.org", function() {
				before(async function () {
					await background(function() {
						sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(false);
						sinon.stub(Zotero.Connector, "callMethod").rejects(new Zotero.Connector.CommunicationError('err'));
					});
					await tab.run(function() {
						let confirm = Zotero.Inject.confirm;
						let confirmStub = sinon.stub(Zotero.Inject, 'confirm');
						confirmStub.deferred = Zotero.Promise.defer();
						confirmStub.callsFake(function() {
							confirm.apply(Zotero.Inject, arguments);
							return confirmStub.deferred.promise;
						});
					});
				});
				
				after(async function () {
					await background(function() {
						Zotero.Connector.checkIsOnline.restore();
						Zotero.Connector.callMethod.restore()
					});	
					await tab.run(function() {
						Zotero.Inject.confirm.restore();
					})
				});	
				
				if (Zotero.isBrowserExt) {
					it('displays a prompt when attempting to save to zotero.org for the first time', async function () {
						try {
							await background(async function (tabId) {
								// First-time save
								sinon.stub(Zotero.Prefs, 'get').returns(true);
								var deferred = Zotero.Promise.defer();
								var tab = await Zotero.Background.getTabByID(tabId);
								Zotero.Connector_Browser.saveWithTranslator(tab, 0).then(deferred.resolve).catch(deferred.reject);
							}, tab.tabId);
							var frameURL = getExtensionURL('modalPrompt/modalPrompt.html');
							var message = await tab.runInFrame(frameURL, async function() {
								// TODO: A more robust way to wait for the text to show up.
								await Zotero.Promise.delay(100);
								return document.getElementById('zotero-modal-prompt').textContent;
							});
							assert.include(message, 'The Zotero Connector was unable to communicate with the Zotero desktop application.');
						} finally {
							await background(function() {
								Zotero.Prefs.get.restore();
							});
						}
					});
				}
				
				it('saves with a translator', async function () {
					await background(function (tabId) {
						sinon.stub(Zotero.Prefs, 'get').returns(false);
						sinon.stub(Zotero.HTTP, 'request').resolves(
							{status: 200, responseText: JSON.stringify({success: {}}), getAllResponseHeaders: () => ({})}
						);
					}, tab.tabId);
					
					try {
						var items = await tab.run(async function () {
							var spy = sinon.spy(Zotero.Translate.ItemSaver.prototype, 'saveItems');
							var stub1 = sinon.stub(Zotero.API, 'getUserInfo').resolves({userID: '', apiKey: ''});
							var stub2 = sinon.stub(Zotero.HTTP, 'request').resolves(
								{status: 200, responseText: JSON.stringify({success: {}}), getAllResponseHeaders: () => ({})}
							);

							if (Zotero.isBrowserExt) {
								Zotero.Inject.confirm.deferred.resolve({button: 3});
								// Allow the confirm response to propagate
								await Zotero.Promise.delay(10);
							} else {
								await Zotero.Inject.translate(Zotero.Inject.translators[0].translatorID);
							}
							try {
								let val = await spy.lastCall.returnValue;
								return val;
							} finally {
								spy.restore();
								stub1.restore();
								stub2.restore();
							}
						});

						assert.equal(items.length, 1);
						assert.equal(items[0].itemType, 'journalArticle');

						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var message = await tab.runInFrame(frameURL, async function() {
							// TODO: A more robust way to wait for the text to show up.
							await Zotero.Promise.delay(100);
							return document.querySelector('.ProgressWindow-box').textContent;
						});

						assert.include(message, 'zotero.org');
						assert.include(message, items[0].title);
					} finally {
						await background(function() {
							Zotero.Prefs.get.restore();
							Zotero.HTTP.request.restore();
						}, tab.tabId);
					}
				});
			});
		});
		
	});

	describe("In a child frame", function() {
		describe('Detection', function() {
			it('Sets the frame with higher priority translator as the translation target', async function() {
				try {
					let bgTranslatorsLoadedPromise = background(function() {
						let onTranslators = Zotero.Connector_Browser.onTranslators;
						let deferred = Zotero.Promise.defer();
						sinon.stub(Zotero.Connector_Browser, 'onTranslators').callsFake(function(translators) {
							if (translators.length >= 2) deferred.resolve();
							return onTranslators.apply(Zotero.Connector_Browser, arguments);
						});
						return deferred.promise;
					});
					await tab.init(getExtensionURL('test/data/top-DOI-frame-COInS.html'));
					await bgTranslatorsLoadedPromise;
					
					var [translators, instanceID] = await background(async function(tabId) {
						Zotero.Connector_Browser.onTranslators.restore();
						
						let translators, instanceID;
						if (Zotero.isBrowserExt) {
							translators = Zotero.Connector_Browser._tabInfo[tabId].translators.map(t => t.label);
							instanceID = Zotero.Connector_Browser._tabInfo[tabId].instanceID;
						} else {
							let tab = await Zotero.Background.getTabByID(tabId);
							translators = tab.translators.map(t => t.label);
							instanceID = tab.instanceID;
						}
						return [translators, instanceID];
					}, tab.tabId);
					
					assert.notEqual(instanceID, 0);
					assert.deepEqual(['COinS', 'DOI'], translators);
				} finally {
					await tab.close();
				}
			});
		});
	});
});
