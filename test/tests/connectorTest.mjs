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

describe('Connector', function() {
	describe('#checkIsOnline()', function() {
		before(function() {
			return background(function() {
				sinon.stub(Zotero.HTTP, 'request');
			});
		});
		
		after(function() {
			return background(function() {
				Zotero.HTTP.request.restore();
			});
		});
	
		it('returns true when Zotero is online', async function() {
			let status = await background(function() {
				Zotero.HTTP.request.resolves({status: 200, getResponseHeader: () => 'application/json', responseText: '{}'});
				return Zotero.Connector.checkIsOnline();
			});
			assert.isOk(status);
		});
		
		it('returns false when Zotero is offline', async function() {
			let status = await background(function() {
				Zotero.HTTP.request.throws(new Zotero.HTTP.StatusError({status: 0}));
				return Zotero.Connector.checkIsOnline();
			});
			assert.isNotOk(status);
		});
		
		it('returns true if Zotero responds with a non-200 status', async function () {
			let result = await background(async function() {
				Zotero.HTTP.request.resolves({status: 500, getResponseHeader: () => '', responseText: 'Error'});
				try {
					return await Zotero.Connector.checkIsOnline();
				} catch (e) {
					return false;
				}
			});
			assert.isTrue(result);
		});
	});

	describe('Safari localhost permissions', function() {
		it('skips passive Connector requests when localhost access is missing', async function() {
			let result = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.permissions, 'contains').resolves(false);
				sinon.stub(Zotero.HTTP, 'request');
				sinon.stub(Zotero.HostPermissions, 'prompt');
				try {
					let online = await Zotero.Connector.checkIsOnline();
					return {
						online,
						requested: Zotero.HTTP.request.called,
						prompted: Zotero.HostPermissions.prompt.called
					};
				}
				finally {
					browser.permissions.contains.restore();
					Zotero.HTTP.request.restore();
					Zotero.HostPermissions.prompt.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.isNull(result.online);
			assert.isFalse(result.requested);
			assert.isFalse(result.prompted);
		});

		it('warns before an active Connector request when localhost access is missing', async function() {
			let result = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.permissions, 'contains').resolves(false);
				sinon.stub(Zotero.HostPermissions, 'prompt').resolves();
				sinon.stub(Zotero.HTTP, 'request').resolves({
					status: 200,
					getResponseHeader: () => 'application/json',
					responseText: '{}'
				});
				try {
					await Zotero.Connector.callMethod('saveSnapshot', {});
					return {
						requested: Zotero.HTTP.request.called,
						prompted: Zotero.HostPermissions.prompt.calledWithMatch({domains: ['127.0.0.1']})
					};
				}
				finally {
					browser.permissions.contains.restore();
					Zotero.HostPermissions.prompt.restore();
					Zotero.HTTP.request.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.isTrue(result.prompted);
			assert.isTrue(result.requested);
		});
		
		it('warns only once when Safari blocks requests with localhost access missing', async function() {
			let result = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.permissions, 'contains').resolves(false);
				sinon.stub(Zotero.HostPermissions, 'prompt').resolves();
				sinon.stub(Zotero.HTTP, 'request').resolves({
					status: 0,
					getResponseHeader: () => null,
					responseText: '',
					response: ''
				});
				try {
					for (let i = 0; i < 2; i++) {
						try {
							await Zotero.Connector.callMethod('saveSnapshot', {});
						}
						catch (e) {}
					}
					return {
						promptCount: Zotero.HostPermissions.prompt.callCount,
						requestCount: Zotero.HTTP.request.callCount
					};
				}
				finally {
					browser.permissions.contains.restore();
					Zotero.HostPermissions.prompt.restore();
					Zotero.HTTP.request.restore();
					Zotero.HostPermissions.localhostRequestBlocked = false;
					Zotero.isSafari = isSafari;
				}
			});

			assert.equal(result.promptCount, 1);
			assert.equal(result.requestCount, 2);
		});

		it("pings again when localhost access is granted in Safari's permission dialog", async function() {
			let result = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				let contains = sinon.stub(browser.permissions, 'contains');
				// Missing for the pre-ping check and the request gate, then granted in Safari's
				// permission dialog triggered by the blocked request
				contains.resolves(true);
				contains.onCall(0).resolves(false);
				contains.onCall(1).resolves(false);
				sinon.stub(Zotero.HostPermissions, 'prompt').resolves();
				let request = sinon.stub(Zotero.HTTP, 'request');
				request.onCall(0).resolves({
					status: 0,
					getResponseHeader: () => null,
					responseText: '',
					response: ''
				});
				request.onCall(1).resolves({
					status: 200,
					getResponseHeader: () => 'application/json',
					responseText: '{}'
				});
				try {
					let online = await Zotero.Connector.checkIsOnline({active: true});
					return {
						online,
						requestCount: Zotero.HTTP.request.callCount,
						promptCount: Zotero.HostPermissions.prompt.callCount
					};
				}
				finally {
					browser.permissions.contains.restore();
					Zotero.HostPermissions.prompt.restore();
					Zotero.HTTP.request.restore();
					Zotero.isSafari = isSafari;
				}
			});
			
			assert.isTrue(result.online);
			assert.equal(result.requestCount, 2);
			assert.equal(result.promptCount, 1);
		});
	});

	describe('Safari repository permissions', function() {
		it('does not request translator metadata without repo.zotero.org permission', async function() {
			let requested = await background(async function() {
				let isSafari = Zotero.isSafari;
				Zotero.isSafari = true;
				sinon.stub(browser.permissions, 'contains').resolves(false);
				sinon.stub(Zotero.HTTP, 'request');
				try {
					try {
						await Zotero.Repo.getTranslatorMetadataFromServer();
					}
					catch (e) {}
					return Zotero.HTTP.request.called;
				}
				finally {
					browser.permissions.contains.restore();
					Zotero.HTTP.request.restore();
					Zotero.isSafari = isSafari;
				}
			});

			assert.isFalse(requested);
		});
	});
});