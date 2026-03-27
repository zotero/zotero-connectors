/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2026 Corporation for Digital Scholarship
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

import { background } from '../support/utils.mjs';

describe("API", function() {
	describe('createItem', function() {
		it('should clear credentials and reauthorize when API key is revoked', async function() {
			const result = await background(async function() {
				const authPrefKeys = ['auth-token_secret', 'auth-userID', 'auth-username'];
				const originalAuthPrefs = await browser.storage.local.get(authPrefKeys);
				try {
					await Zotero.Prefs.set('auth-token_secret', 'revoked-key');
					await Zotero.Prefs.set('auth-userID', '1');
					await Zotero.Prefs.set('auth-username', 'test-user');

					sinon.stub(Zotero.API, 'authorize').callsFake(async function() {
						await Zotero.Prefs.set('auth-token_secret', 'new-key');
						await Zotero.Prefs.set('auth-userID', '1');
						await Zotero.Prefs.set('auth-username', 'test-user');
						return {
							'auth-username': 'test-user',
							'auth-userID': '1'
						};
					});
					sinon.spy(Zotero.API, 'clearCredentials');

					sinon.stub(Zotero.HTTP, 'request');
					Zotero.HTTP.request.onFirstCall().rejects(Object.assign(new Error('Forbidden'), { status: 403 }));
					Zotero.HTTP.request.onSecondCall().resolves({ responseText: '{"success":["ABC12345"]}' });

					const responseText = await Zotero.API.createItem([{ itemType: 'webpage', title: 'Test' }]);
					return {
						responseText,
						clearCredentialsCalled: Zotero.API.clearCredentials.calledOnce,
						authorizeCalled: Zotero.API.authorize.calledOnce,
						httpRequestCallCount: Zotero.HTTP.request.callCount,
						firstAPIKey: Zotero.HTTP.request.firstCall.args[2].headers['Zotero-API-Key'],
						secondAPIKey: Zotero.HTTP.request.secondCall.args[2].headers['Zotero-API-Key']
					};
				}
				finally {
					if (Zotero.API.authorize.restore) Zotero.API.authorize.restore();
					if (Zotero.API.clearCredentials.restore) Zotero.API.clearCredentials.restore();
					if (Zotero.HTTP.request.restore) Zotero.HTTP.request.restore();

					for (let key of authPrefKeys) {
						if (originalAuthPrefs[key] !== undefined) {
							await Zotero.Prefs.set(key, originalAuthPrefs[key]);
						}
						else {
							await Zotero.Prefs.clear(key);
						}
					}
				}
			});

			assert.equal(result.responseText, '{"success":["ABC12345"]}');
			assert.isTrue(result.clearCredentialsCalled);
			assert.isTrue(result.authorizeCalled);
			assert.equal(result.httpRequestCallCount, 2);
			assert.equal(result.firstAPIKey, 'revoked-key');
			assert.equal(result.secondAPIKey, 'new-key');
		});
	});
});
