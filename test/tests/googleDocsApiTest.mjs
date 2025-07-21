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

import { background } from '../support/utils.mjs';

describe("Zotero.GoogleDocs.API", function() {
	describe('#getDocument()', function() {
		it('Reports 500 errors to repository', async function() {
			let reportCallArgs = await background(async function() {
				let authStub, httpStub;
				let reportCallArgs;
				try {
					// Stub auth headers
					authStub = sinon.stub(Zotero.GoogleDocs.API, 'getAuthHeaders').resolves({'Authorization': 'Bearer test'});
					
					// Stub HTTP requests
					httpStub = sinon.stub(Zotero.HTTP, 'request').callThrough();
					
					// First call (to docs.googleapis.com) throws 500 error
					httpStub.withArgs('GET', 'https://docs.googleapis.com/v1/documents/test-doc-id?includeTabsContent=true').rejects(new Zotero.HTTP.StatusError({status: 500, responseText: 'Internal Server Error'}));
					// Second call (to zotero.org) returns OK
					httpStub.withArgs('POST', 'https://repo.zotero.org/repo/report').callsFake((...args) => {
						reportCallArgs = args;
					});

					try {
						await Zotero.GoogleDocs.API.getDocument('test-doc-id');
					} catch (e) {
						Zotero.debug(e);
					}
					
					// Return the arguments from the second call
					return reportCallArgs;
				}
				finally {
					authStub?.restore();
					httpStub?.restore();
				}
			});
			
			assert.isArray(reportCallArgs);
			assert.include(reportCallArgs[1], 'zotero.org');
			assert.include(reportCallArgs[2].body, 'googleDocsV2APIError');
			assert.include(reportCallArgs[2].body, `count%22%3A` + 1);
		});

		it('should report multiple 500 errors with the count of the errors for the same document', async function() {
			let reportCallArgs = await background(async function() {
				let authStub, httpStub;
				let reportCallArgs;
				try {
					// Stub auth headers
					authStub = sinon.stub(Zotero.GoogleDocs.API, 'getAuthHeaders').resolves({'Authorization': 'Bearer test'});
					
					// Stub HTTP requests
					httpStub = sinon.stub(Zotero.HTTP, 'request').callThrough();
					
					// First call (to docs.googleapis.com) throws 500 error
					httpStub.withArgs('GET', 'https://docs.googleapis.com/v1/documents/test-doc-id2?includeTabsContent=true').rejects(new Zotero.HTTP.StatusError({status: 500, responseText: 'Internal Server Error'}));
					// Second call (to zotero.org) returns OK
					httpStub.withArgs('POST', 'https://repo.zotero.org/repo/report').callsFake((...args) => {
						reportCallArgs = args;
					});

					for (let i = 0; i < 5; i++) {
						try {
							await Zotero.GoogleDocs.API.getDocument('test-doc-id2');
						} catch (e) {
							Zotero.debug(e);
						}
					}
					
					// Return the arguments from the second call
					return reportCallArgs;
				}
				finally {
					authStub?.restore();
					httpStub?.restore();
				}
			});
			
			assert.isArray(reportCallArgs);
			assert.include(reportCallArgs[1], 'zotero.org');
			assert.include(reportCallArgs[2].body, 'googleDocsV2APIError');
			assert.include(reportCallArgs[2].body, `count%22%3A` + 5);
		});

		it('if a document retrieval succeeds, the 500 count is reset', async function() {
			let reportCallArgs = await background(async function() {
				let authStub, httpStub;
				let reportCallArgs;
				try {
					// Stub auth headers
					authStub = sinon.stub(Zotero.GoogleDocs.API, 'getAuthHeaders').resolves({'Authorization': 'Bearer test'});
					
					// Stub HTTP requests
					httpStub = sinon.stub(Zotero.HTTP, 'request').callThrough();
					
					// Calls (to docs.googleapis.com) throws 500 error
					httpStub.withArgs('GET', 'https://docs.googleapis.com/v1/documents/test-doc-id2?includeTabsContent=true')
						.rejects(new Zotero.HTTP.StatusError({status: 500, responseText: 'Internal Server Error'}));
					// Success on second call (reset count)
					httpStub.withArgs('GET', 'https://docs.googleapis.com/v1/documents/test-doc-id2?includeTabsContent=true')
						.onSecondCall().resolves({responseText: '{"documentId": "test-doc-id2"}', status: 200});
					httpStub.withArgs('POST', 'https://repo.zotero.org/repo/report').callsFake((...args) => {
						reportCallArgs = args;
					});

					for (let i = 0; i < 3; i++) {
						try {
							await Zotero.GoogleDocs.API.getDocument('test-doc-id2');
						} catch (e) {
							Zotero.debug(e);
						}
					}
					
					// Return the arguments from the second call
					return reportCallArgs;
				}
				finally {
					authStub?.restore();
					httpStub?.restore();
				}
			});
			
			assert.isArray(reportCallArgs);
			assert.include(reportCallArgs[1], 'zotero.org');
			assert.include(reportCallArgs[2].body, 'googleDocsV2APIError');
			assert.include(reportCallArgs[2].body, `count%22%3A` + 1);
		});
	});
}); 