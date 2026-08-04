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

import {
	Tab,
	background,
	getExtensionURL,
	delay,
	offscreen,
	stubConnectorCallMethod,
	stubHTTPRequest
} from '../support/utils.mjs';

describe("Translation", function() {
	var tab = new Tab();

	before(async function () {
		// Make sure translators initialized
		let translators = await background(async function() {
			return Promise.all([
				Zotero.Translators.get('05d07af9-105a-4572-99f6-a8e231c0daef'),
				Zotero.Translators.get('c159dcfe-8a53-4301-a499-30f6549c340d'),
				Zotero.Translators.get('951c027d-74ac-47d4-a107-9c3069ab7b48')
			]);
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

		it('sanitizes invalid head children before offscreen translation', async function () {
			let result = await tab.run(async () => {
				let iframe = document.createElement('iframe');
				let meta = document.createElement('meta');
				meta.name = 'citation_test';
				meta.content = 'test';
				document.head.append(iframe, meta);

				let originalDetect = Zotero.TranslateHostFrameManager.detect;
				try {
					let html;
					Zotero.TranslateHostFrameManager.detect = async ({ document }) => {
						html = document.html;
						return { translators: [], observers: [] };
					};
					await Zotero.RemoteTranslate.detect({ document });
					let parsedDoc = new DOMParser().parseFromString(html, 'text/html');
					return {
						hasIframe: !!parsedDoc.querySelector('iframe'),
						metaContent: parsedDoc.querySelector('head meta[name="citation_test"]')?.content,
					};
				}
				finally {
					Zotero.TranslateHostFrameManager.detect = originalDetect;
					iframe.remove();
					meta.remove();
				}
			});

			assert.isFalse(result.hasIframe);
			assert.equal(result.metaContent, 'test');
		});
		
		describe("Detection", function() {
			it('detects expected translators', async function () {
				try {
					const translatorsPromise = background(() => {
						return new Promise((resolve) => {
							sinon.stub(Zotero.Connector_Browser, 'onTranslators').callThrough().onFirstCall().callsFake((...args) => {
								resolve(args[0].map(t => t.label));
								Zotero.Connector_Browser.onTranslators.wrappedMethod.apply(Zotero.Connector_Browser, args);
							});
						});
					});
					await tab.page.reload();
					const translators = await translatorsPromise;
					assert.deepEqual(['COinS', 'DOI'], translators);
				} finally {
					await background(() => {
						Zotero.Connector_Browser.onTranslators.restore();
					});
				}
			});

			it('makes translator HTTP APIs explicitly unavailable during detection', async function () {
				const translatorID = '00000000-0000-0000-0000-000000000001';
				const metadata = {
					translatorID,
					translatorType: 4,
					label: 'Detect HTTP Test',
					creator: 'Zotero',
					target: '',
					priority: 1,
					lastUpdated: '2026-01-01 00:00:00',
					browserSupport: 'gcsv',
					inRepository: false
				};
				const code = `${JSON.stringify(metadata)}\n`
					+ `function detectWeb(doc, url) {\n`
					+ `  let calls = [\n`
					+ `    () => request('https://example.com/'),\n`
					+ `    () => ZU.request('https://example.com/'),\n`
					+ `    () => ZU.doGet('https://example.com/', () => {}),\n`
					+ `    () => globalThis.Zotero.HTTP.request('GET', 'https://example.com/'),\n`
					+ `    () => globalThis.Zotero.COHTTP.request('GET', 'https://example.com/')\n`
					+ `  ];\n`
					+ `  for (let call of calls) {\n`
					+ `    try { call(); return false; }\n`
					+ `    catch (e) { if (!e.message.includes('unavailable during translator detection')) return false; }\n`
					+ `  }\n`
					+ `  return 'journalArticle';\n`
					+ `}\nfunction doWeb() {}`;
				try {
					await background(async ({ metadata, code }) => {
						Zotero.Translators._loadTranslator(new Zotero.Translator(metadata));
						await Zotero.Prefs.set(
							Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + metadata.translatorID,
							code
						);
					}, { metadata, code });
					let detected = await tab.run(async translatorID => {
						let translator = await Zotero.Translators.get(translatorID);
						let result = await Zotero.RemoteTranslate.detect({
							document,
							translators: [translator]
						});
						return result.translators.map(translator => translator.translatorID);
					}, translatorID);
					assert.deepEqual(detected, [translatorID]);
				}
				finally {
					await background(async translatorID => {
						Zotero.Translators._removeTranslator(translatorID);
						await Zotero.Prefs.clear(
							Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translatorID
						);
					}, translatorID);
				}
			});

			it('preserves a detected translator proxy through translation', async function () {
				const translatorID = '00000000-0000-0000-0000-000000000002';
				const metadata = {
					translatorID,
					translatorType: 4,
					label: 'Proxy Preservation Test',
					creator: 'Zotero',
					target: '',
					priority: 1,
					lastUpdated: '2026-01-01 00:00:00',
					browserSupport: 'gcsv',
					inRepository: false
				};
				const code = `${JSON.stringify(metadata)}\n`
					+ `function detectWeb() { return 'journalArticle'; }\n`
					+ `function doWeb() {\n`
					+ `  let item = new Zotero.Item('journalArticle');\n`
					+ `  item.title = 'Proxy Preservation Test';\n`
					+ `  item.complete();\n`
					+ `}`;
				try {
					await background(async ({ metadata, code }) => {
						Zotero.Translators._loadTranslator(new Zotero.Translator(metadata));
						await Zotero.Prefs.set(
							Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + metadata.translatorID,
							code
						);
					}, { metadata, code });
					let result = await tab.run(async translatorID => {
						let translator = await Zotero.Translators.get(translatorID);
						translator.proxy = new Zotero.Proxy({
							toProperScheme: '%h.proxy.example.org/%p',
							toProxyScheme: 'https://login.proxy.example.org/login?qurl=%u',
							hosts: ['example.org']
						});
						let detectResult = await Zotero.RemoteTranslate.detect({
							document,
							translators: [translator]
						});
						let translateResult = await Zotero.RemoteTranslate.translate({
							document,
							translators: detectResult.translators
						});
						return {
							detectProxy: detectResult.translators[0].proxy.toJSON(),
							translateProxy: translateResult.proxy.toJSON()
						};
					}, translatorID);
					assert.equal(result.detectProxy.scheme, '%h.proxy.example.org/%p');
					assert.deepEqual(result.translateProxy, result.detectProxy);
				}
				finally {
					await background(async translatorID => {
						Zotero.Translators._removeTranslator(translatorID);
						await Zotero.Prefs.clear(
							Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translatorID
						);
					}, translatorID);
				}
			});
		});
		
		describe("Saving", function() {
			async function navigateAndWaitForTranslators(tab, url) {
				let translatorsLoaded = background(() => {
					return new Promise((resolve) => {
						sinon.stub(Zotero.Connector_Browser, 'onTranslators').callsFake((...args) => {
							resolve(args[0].map(t => t.label));
							Zotero.Connector_Browser.onTranslators.wrappedMethod.apply(Zotero.Connector_Browser, args);
							Zotero.Connector_Browser.onTranslators.restore();
						});
					});
				});
				await tab.navigate(url);
				await translatorsLoaded;
			}

			beforeEach(async function() {
				await navigateAndWaitForTranslators(tab, getExtensionURL('test/data/journalArticle-single.html'));
			});
			
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
					let restoreStub = await stubConnectorCallMethod({
						saveItems: { returnPayload: true },
						getSelectedCollection: { response: {} }
					});
					try {
						var items = await background(async function(tabId) {
							let tab = await browser.tabs.get(tabId);
							return Zotero.Connector_Browser.saveWithTranslator(tab, 0);
						}, tab.tabId);
					}
					finally {
						await restoreStub();
					}
					assert.equal(items.length, 1);
					assert.equal(items[0].itemType, 'journalArticle');
					var frameURL = getExtensionURL('progressWindow/progressWindow.html');
					var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
					var elem = await frame.waitForSelector('.ProgressWindow-progressBox');
					var message = await elem.evaluate(node => node.textContent);
					assert.include(message, items[0].title);
				});
				
				it('saves with a translator that uses the select dialog', async function () {
					let restoreConnectorStub = await stubConnectorCallMethod({
						saveItems: { returnPayload: true },
						getSelectedCollection: { response: {} }
					});
					let restoreHTTPStub = await stubHTTPRequest({
						'doi.org/10.1086%2F529596': {
							DOI: '10.1086/529596',
							type: 'article-journal',
							title: 'Scarcity or Abundance? Preserving the Past in a Digital Era',
							author: [{ given: 'Roy', family: 'Rosenzweig' }],
							page: '735-762',
							'container-title': 'The American Historical Review',
							issued: { 'date-parts': [[2003]] }
						}
					});
					try {
						var items = await background(async function(tabId) {
							var stub = sinon.stub(Zotero.Connector_Browser, "onSelect").callsFake(function(items) {
								return items;
							});
							
							try {
								var tab = await browser.tabs.get(tabId);
								return await Zotero.Connector_Browser.saveWithTranslator(tab, 1);
							}
							finally {
								stub.restore();
							}
						}, tab.tabId);
						assert.equal(items.length, 1);
						assert.equal(items[0].itemType, 'journalArticle');
						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
						var elem = await frame.waitForSelector('.ProgressWindow-progressBox');
						var message = await elem.evaluate(node => node.textContent);
						assert.include(message, items[0].title);
					}
					finally {
						await restoreHTTPStub();
						await restoreConnectorStub();
					}
				});
			
				it('saves as snapshot', async function () {
					let restoreStub = await stubConnectorCallMethod({
						saveSnapshot: { response: [] },
						saveSingleFile: { response: [] }
					});
					try {
						await background(async function (tabId) {
							let tab = await browser.tabs.get(tabId);
							await Zotero.Connector_Browser.saveAsWebpage(tab);
						}, tab.tabId);
						await delay(20);
						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
						var elem = await frame.waitForSelector('.ProgressWindow-progressBox');
						var message = await elem.evaluate(node => node.textContent);
						assert.include(message, "Scarcity or Abundance? Preserving the Past in a Digital Era");
					} finally {
						await restoreStub();
					}
				});
					
				it('displays an error message if Zotero responds with an error', async function () {
					let restoreStub = await stubConnectorCallMethod({
						saveItems: { error: { message: 'Err', status: 500 } }
					});
					try {
						await background(async function(tabId) {
							// prevent reporting translator errors
							var stub = sinon.stub(Zotero.Prefs, 'get').returns(false);
							var tab = await browser.tabs.get(tabId);
							try {
								await Zotero.Connector_Browser.saveWithTranslator(tab, 0);
							}
							catch (e) {
								Zotero.debug(e);
							}
							finally {
								stub.restore();
							}
						}, tab.tabId);
					}
					finally {
						await restoreStub();
					}
					var frameURL = getExtensionURL('progressWindow/progressWindow.html');
					var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
					var elem = await frame.waitForSelector('.ProgressWindow-error');
					var message = await elem.evaluate(node => node.textContent);
					assert.include(message, "An error occurred while saving this item.");
				});
				
				it('should throw an error if multiple item translation fails during saving', async function() {
					await navigateAndWaitForTranslators(tab, getExtensionURL('test/data/DOI-multiple.html'));
					
					try {
						await offscreen(() => {
							sinon.stub(frameManager, 'translate').rejects(new Error('Test error'));
						})
					
						let result = await background(async function(tabId) {
							// Try to save using DOI translator
							let tab = await browser.tabs.get(tabId);
							return await Zotero.Connector_Browser.saveWithTranslator(tab, 0);
						}, tab.tabId);
						
						assert.isNotOk(result);
						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
						var elem = await frame.waitForSelector('.ProgressWindow-error');
						var message = await elem.evaluate(node => node.textContent);
						assert.include(message, "An error occurred while saving this item.");
					}
					finally {
						await offscreen(() => {
							frameManager.translate.restore();
						});
					}
				});
			});
			
			describe("To zotero.org", function() {
				before(async function () {
					await background(function() {
						sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(false);
						sinon.stub(Zotero.Connector, "callMethod").rejects(new Zotero.Connector.CommunicationError('err'));
					});
				});
				
				after(async function () {
					await background(function() {
						Zotero.Connector.checkIsOnline.restore();
						Zotero.Connector.callMethod.restore()
					});	
				});	
				
				it('displays a prompt when attempting to save to zotero.org for the first time', async function () {
					try {
						await background(async function (tabId) {
							// First-time save
							sinon.stub(Zotero.Prefs, 'get').returns(true);
							var deferred = Zotero.Promise.defer();
							var tab = await browser.tabs.get(tabId);
							Zotero.Connector_Browser.saveWithTranslator(tab, 0).then(deferred.resolve).catch(deferred.reject);
						}, tab.tabId);
						// Wait for the modal prompt to appear
						var frameURL = getExtensionURL('modalPrompt/modalPrompt.html');
						var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
						var elem = await frame.waitForSelector('#zotero-modal-prompt');
						var message = await elem.evaluate(node => node.textContent);
						assert.include(message, 'The Zotero Connector was unable to communicate with the Zotero desktop application.');
					} finally {
						await background(function() {
							Zotero.Prefs.get.restore();
						});
					}
				});
				
				it('saves with a translator', async function () {
					await tab.run(() => {
						sinon.stub(Zotero.API, "createItem").resolves(JSON.stringify({ success: [1] }));
						sinon.stub(Zotero.SingleFile, "retrievePageData").resolves("");
					})
					const items = await background(async function (tabId) {
						sinon.stub(Zotero.Prefs, 'get').callThrough().onFirstCall().returns(true);
						sinon.stub(Zotero.Prefs, 'getAsync').callThrough().onFirstCall().returns(false);
						sinon.stub(Zotero.ItemSaver, "saveAttachmentToServer").resolves(true);
						
						var tab = await browser.tabs.get(tabId);
						return await Zotero.Connector_Browser.saveWithTranslator(tab, 0);
					}, tab.tabId);

					assert.equal(items.length, 1);
					assert.equal(items[0].itemType, 'journalArticle');
					
					try {
						var frameURL = getExtensionURL('progressWindow/progressWindow.html');
						var frame = await tab.page.waitForFrame(frame => frame.url().startsWith(frameURL));
						var elem = await frame.waitForSelector('.ProgressWindow-box');
						var message = await elem.evaluate(node => node.textContent);

						assert.include(message, 'zotero.org');
						assert.include(message, 'Scarcity or Abundance? Preserving the Past in a Digital Era');
					} finally {
						await background(function() {
							Zotero.Prefs.get.restore();
							Zotero.Prefs.getAsync.restore();
							Zotero.ItemSaver.saveAttachmentToServer.restore();
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
						
						let translators = Zotero.Connector_Browser._tabInfo[tabId].translators.map(t => t.label);
						let instanceID = Zotero.Connector_Browser._tabInfo[tabId].instanceID;
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
