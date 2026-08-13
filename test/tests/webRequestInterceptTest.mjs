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

import { background } from '../support/utils.mjs';

describe("WebRequestIntercept", function() {
	describe('#replaceHeadersDNR()', function() {
		it('scopes rules to the exact URL and applies the requested Cookie operation', async function() {
			let rule = await background(async function() {
				sinon.stub(browser.declarativeNetRequest, 'updateSessionRules').resolves();
				sinon.stub(Zotero.Connector_Browser, 'setKeepServiceWorkerAlive');
				sinon.stub(globalThis, 'setTimeout');
				try {
					await Zotero.WebRequestIntercept.replaceHeadersDNR(
						'https://example.com/file.pdf?token=a.b#fragment',
						[{name: 'Cookie', value: 'session=secret', operation: 'set'}]
					);
					return browser.declarativeNetRequest.updateSessionRules.firstCall.args[0].addRules[0];
				}
				finally {
					browser.declarativeNetRequest.updateSessionRules.restore();
					Zotero.Connector_Browser.setKeepServiceWorkerAlive.restore();
					globalThis.setTimeout.restore();
				}
			});

			assert.equal(rule.condition.regexFilter,
				'^https://example\\.com/file\\.pdf\\?token=a\\.b$');
			assert.deepEqual(rule.action.requestHeaders, [{
				header: 'cookie',
				value: 'session=secret',
				operation: 'set',
			}]);
		});
	});

	describe('#offerSavingPDFInFrame()', function() {
		it('calls Zotero.Connector_Browser.onPDFFrame when pdf frame loads', async function () {
			let args = await background(function() {
				var stub = sinon.stub(Zotero.Connector_Browser, 'onPDFFrame');
				Zotero.WebRequestIntercept.offerSavingPDFInFrame({
					frameId: 1, tabId: 1, url: 'test', method: "GET",
					responseHeadersObject: {'content-type': 'application/pdf'}
				});
				return new Promise(function(resolve, reject) {
					// onPDFFrame called out of observe event loop to not stall the page load
					// since it's a blocking call
					setTimeout(function() {
						try {
							console.log(JSON.stringify(stub.args[0]));
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
		});
	});
});
