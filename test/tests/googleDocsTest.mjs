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

import { Tab, getExtensionURL, stubHTTPRequest } from '../support/utils.mjs';

describe("Zotero.GoogleDocs", function() {
	describe('Google Docs V2 selection logic', function() {
		var tab = new Tab();

		beforeEach(async function() {
			await tab.init(getExtensionURL('test/data/googleDocs-integration.html'));
			await tab.run(async () => {
				await Zotero.initDeferred.promise;
				sinon.stub(Zotero.Inject, 'loadReactComponents').resolves();
				Zotero.Connector_Browser = {injectScripts: () => {}};
				Zotero.GoogleDocs.UI = {init: () => {}};
			});
		});
		
		afterEach(async function() {
			await tab.close();
		});

		it('should use V1 when reportTranslationFailure is false', async function() {
			const isV2Enabled = await tab.run(async function() {
				sinon.stub(Zotero.Prefs, 'getAsync').callThrough().withArgs('reportTranslationFailure').resolves(false);
				
				await Zotero.GoogleDocs.init();
				return Zotero.GoogleDocs.Client.isV2;
			});
			
			assert.isNotOk(isV2Enabled);
		});

		it.skip('should use V1 when integration.googleDocs.forceDisableV2API is true', async function() {
			const isV2Enabled = await tab.run(async function() {
				sinon.stub(Zotero.Prefs, 'getAsync').callThrough().withArgs('integration.googleDocs.forceDisableV2API').resolves(true);
				
				await Zotero.GoogleDocs.init();
				return Zotero.GoogleDocs.Client.isV2;
			});
			
			assert.isNotOk(isV2Enabled);
		});

		describe("when reportTranslationFailure is true", function() {
			it('should use V2 when server returns true', async function() {
				let restoreStub;
				try {
					// Stub the HTTP request to return true for isGoogleDocsV2Enabled
					restoreStub = await stubHTTPRequest({ 'repo.zotero.org/settings': { gdocs_version: 2 } });

					const isV2Enabled = await tab.run(async function() {
						await Zotero.GoogleDocs.init();
						return Zotero.GoogleDocs.Client.isV2;
					});
					
					assert.isOk(isV2Enabled);
				} finally {
					if (restoreStub) await restoreStub();
				}
			});

			it('should use V1 when server returns false', async function() {
				let restoreStub;
				try {
					// Stub the HTTP request to return true for isGoogleDocsV2Enabled
					restoreStub = await stubHTTPRequest({ 'repo.zotero.org/settings': { } });

					const isV2Enabled = await tab.run(async function() {
						await Zotero.GoogleDocs.init();
						
						return Zotero.GoogleDocs.Client.isV2;
					});
					
					assert.isNotOk(isV2Enabled);
				} finally {
					if (restoreStub) await restoreStub();
				}
			});

			it('should use V1 when server request fails', async function() {
				const isV2Enabled = await tab.run(async function() {
					sinon.stub(Zotero.HTTP, 'request').rejects(new Zotero.HTTP.StatusError({status: 500}, 'https://repo.zotero.org/settings'));
					
					await Zotero.GoogleDocs.init();
					return Zotero.GoogleDocs.Client.isV2;
				});
				
				assert.isNotOk(isV2Enabled);
			});
		});
	});

	describe.skip('V2Client', function() {
		it('should switch to V1 when 500 error is thrown', async function() {
			var tab = new Tab();

			try {
				await tab.init(getExtensionURL('test/data/googleDocs-integration.html'));
				await tab.run(async () => {
					await Zotero.initDeferred.promise;
				});

				const result = await tab.run(async function() {
					let client = new Zotero.GoogleDocs.Client('test-doc-id');
					
					sinon.stub(client, 'getDocument').throws(new Error('500: Google Docs request failed'));
					let initClientStub = sinon.stub(Zotero.GoogleDocs, 'initClient');
					let clientStub;
					sinon.stub(Zotero.GoogleDocs, 'ClientAppsScript').callsFake(() => {
						clientStub = { init: async () => 0, call: sinon.stub() };
						return clientStub;
					});
					
					await client.call({ command: 'Document.getDocument', arguments: [0] });
					
					// Verify the behavior
					return {
						initClientCalled: initClientStub.calledWith(true),
						newClientCallCalled: clientStub.call.called,
					};
				});
				
				assert.isTrue(result.initClientCalled, 'initClient should be called with true');
				assert.isTrue(result.newClientCallCalled, 'new client call should be called');
			} finally {
				await tab.close();
			}
		});
	});
}); 