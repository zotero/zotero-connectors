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

describe("ItemSaver Background", function() {
	describe('_fetchAttachment', function() {
		let attachment, mockTab;
		
		beforeEach(async function() {
			attachment = {
				url: 'https://example.com/test.pdf',
				mimeType: 'application/pdf',
				referrer: 'https://example.com'
			};
			mockTab = { id: 123, url: 'https://example.com/article' };

			// Set up default stubs
			await background(function() {
				sinon.stub(browser.cookies, 'getAll').resolves([
					{ name: 'sessionid', value: 'abc123' },
					{ name: 'csrf', value: 'xyz789' }
				]);
				
				sinon.stub(Zotero.HTTP, 'request').resolves({
					response: new ArrayBuffer(1024),
					status: 200,
					getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '1024' : null
				});
				
				sinon.stub(Zotero.Utilities.Connector, 'getContentTypeFromXHR').returns({
					contentType: 'application/pdf'
				});
				
				sinon.stub(Zotero.BotBypass, 'passJSDetectionViaHiddenIframe')
					.resolves('https://example.com/corrected.pdf');
				
				sinon.stub(Zotero.BotBypass, 'passJSDetectionViaWindowPrompt')
					.resolves('https://example.com/corrected.pdf');

				sinon.stub(Zotero.BotBypass, 'isUrlWhitelisted').returns(true);
			});
		});

		afterEach(async function() {
			// Clean up all stubs
			await background(function() {
				browser.cookies.getAll.restore();
				Zotero.HTTP.request.restore();
				if (Zotero.Utilities.Connector.getContentTypeFromXHR.restore) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();
				}
				Zotero.BotBypass.passJSDetectionViaHiddenIframe.restore();
				Zotero.BotBypass.passJSDetectionViaWindowPrompt.restore();
				Zotero.BotBypass.isUrlWhitelisted.restore();
				if (Zotero.BotBypass.bypassAmazonCaptcha.restore) {
					Zotero.BotBypass.bypassAmazonCaptcha.restore();
				}
			});
		});

		describe('When HTTP.request returns 200 and mimetype is correct', function() {
			it('should return the response ArrayBuffer', async function() {
				const result = await background(async function(attachment, mockTab) {
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});

			it('should fall back when partitionKey is unsupported', async function() {
				const result = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.onFirstCall().rejects(new Error('Unexpected property partitionKey'));
					browser.cookies.getAll.onSecondCall().resolves([
						{name: 'ordinary', value: 'sent-by-browser'},
					]);
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						calls: browser.cookies.getAll.getCalls().map(call => call.args[0]),
						hasCookieHeader: !!Zotero.HTTP.request.firstCall.args[2].headers?.Cookie,
						cookieOperation: Zotero.HTTP.request.firstCall.args[2].cookieHeaderOperation,
					};
				}, attachment, mockTab);

				assert.deepEqual(result.calls, [
					{url: attachment.url, partitionKey: {}},
					{url: attachment.url},
				]);
				assert.isFalse(result.hasCookieHeader);
				assert.isUndefined(result.cookieOperation);
			});

			it('should append cookies from the matching partition', async function() {
				const result = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.resolves([{
						name: 'clearance',
						value: 'allowed',
						partitionKey: {topLevelSite: 'https://example.com'},
					}]);
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						cookieHeader: Zotero.HTTP.request.firstCall.args[2].headers.Cookie,
						cookieOperation: Zotero.HTTP.request.firstCall.args[2].cookieHeaderOperation,
					};
				}, attachment, mockTab);

				assert.equal(result.cookieHeader, 'clearance=allowed');
				assert.equal(result.cookieOperation, 'append');
			});

			it('should send cookies from the selected Firefox FPI jar', async function() {
				const result = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.resolves([
						{name: 'session', value: 'authenticated', firstPartyDomain: 'example.com'},
					]);
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						cookieHeader: Zotero.HTTP.request.firstCall.args[2].headers.Cookie,
						cookieOperation: Zotero.HTTP.request.firstCall.args[2].cookieHeaderOperation,
					};
				}, attachment, mockTab);

				assert.equal(result.cookieHeader, 'session=authenticated');
				assert.equal(result.cookieOperation, 'set');
			});

			it('should not combine cookies from unrelated partition keys', async function() {
				const cookieHeader = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.resolves([
						{
							name: 'correct',
							value: 'allowed',
							partitionKey: {topLevelSite: 'https://example.com'},
						},
						{
							name: 'unrelated',
							value: 'blocked',
							partitionKey: {topLevelSite: 'https://unrelated.example'},
						},
					]);
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return Zotero.HTTP.request.firstCall.args[2].headers.Cookie;
				}, attachment, mockTab);

				assert.equal(cookieHeader, 'correct=allowed');
			});

			it('should preserve SameSite restrictions for cross-site FPI cookies', async function() {
				attachment.url = 'https://attachments.example.net/file.pdf';
				const cookieHeader = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.resolves([
						{
							name: 'strict', value: 'blocked', firstPartyDomain: 'example.com',
							sameSite: 'strict', secure: true,
						},
						{
							name: 'crossSite', value: 'allowed', firstPartyDomain: 'example.com',
							sameSite: 'no_restriction', secure: true,
						},
					]);
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return Zotero.HTTP.request.firstCall.args[2].headers.Cookie;
				}, attachment, mockTab);

				assert.equal(cookieHeader, 'crossSite=allowed');
			});

			it('should continue without a Cookie header when both cookie lookups fail', async function() {
				const result = await background(async function(attachment, mockTab) {
					browser.cookies.getAll.rejects(new Error('Cookie API unavailable'));
					let response = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: response.byteLength,
						cookieCalls: browser.cookies.getAll.callCount,
						hasCookieHeader: !!Zotero.HTTP.request.firstCall.args[2].headers?.Cookie,
					};
				}, attachment, mockTab);

				assert.equal(result.byteLength, 1024);
				assert.equal(result.cookieCalls, 2);
				assert.isFalse(result.hasCookieHeader);
			});
		});

		describe('When HTTP.request returns 200 but mimetype is different', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'  // Wrong content type
					});
					
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.onSecondCall().returns({
						contentType: 'application/pdf'  // Correct content type on retry
					});
					
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});

			it('should fallback to window prompt if iframe bypass fails', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'  // Wrong content type
					});
					
					// Mock bot bypass methods - iframe fails
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.rejects(new Error('Iframe bypass failed'));
					
					Zotero.BotBypass.passJSDetectionViaWindowPrompt
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/pdf'
					});
					
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});

			it('should throw error for non-whitelisted domains', async function() {
				attachment.url = 'https://non-whitelisted.com/test.pdf';
				
				const error = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'text/html'
					});

					Zotero.BotBypass.isUrlWhitelisted.returns(false);
					
					try {
						await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
						return null;
					} catch (e) {
						return e.message;
					}
				}, attachment, mockTab);
				
				assert.include(error, 'Attachment MIME type text/html does not match specified type application/pdf');
			});
		});

		describe('When HTTP.request returns a bot-protection response', function() {
			it('should bypass Amazon WAF challenges with Sec-Fetch-Site: same-origin', async function() {
				const result = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.onFirstCall().resolves({
						response: new ArrayBuffer(0),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'x-amzn-waf-action') return 'challenge';
							if (header.toLowerCase() == 'content-length') return '0';
							return null;
						}
					});
					Zotero.HTTP.request.onSecondCall().resolves({
						response: new ArrayBuffer(2048),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '2048';
							if (header.toLowerCase() == 'content-type') return 'application/pdf';
							return null;
						}
					});

					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: result.byteLength,
						header: Zotero.HTTP.request.secondCall.args[2].headers['Sec-Fetch-Site']
					};
				}, attachment, mockTab);

				assert.equal(result.byteLength, 2048);
				assert.equal(result.header, 'same-origin');
			});
		});

		describe('When HTTP.request returns 403', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					
					// First request returns 403
					Zotero.HTTP.request.onFirstCall().resolves({
						response: new ArrayBuffer(0),
						status: 403,
						getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '0' : null
					});
					
					Zotero.BotBypass.passJSDetectionViaHiddenIframe
						.resolves('https://sciencedirect.com/corrected.pdf');
					
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/pdf'
					});
					
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);
				
				assert.equal(result, 1024);
			});
		});

		describe('When HTTP.request returns 404', function() {
			it('should not attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/missing.pdf';

				const result = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(0),
						status: 404,
						getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '0' : null
					});

					let error;
					try {
						await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					}
					catch (e) {
						error = e.message;
					}
					return {
						error,
						iframeCalled: Zotero.BotBypass.passJSDetectionViaHiddenIframe.called,
						windowPromptCalled: Zotero.BotBypass.passJSDetectionViaWindowPrompt.called,
					};
				}, attachment, mockTab);

				assert.include(result.error, 'Attachment download failed with HTTP status 404');
				assert.isFalse(result.iframeCalled);
				assert.isFalse(result.windowPromptCalled);
			});
		});

		describe('When attachment mime type is not provided by the translator', function () {
			it('should fetch mime type from the content type header', async function () {
				attachment = {
					url: 'https://example.com/test.html',
					referrer: 'https://example.com'
				};
				let mimeType = await background(async function (attachment, mockTab) {
					// Use the actual getContentTypeFromXHR
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();

					// mock http response with a content type header
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '1024';
							if (header.toLowerCase() == 'content-type') return 'text/html; charset=utf-8';
							return null;
						}
					});
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return attachment.mimeType;
				}, attachment, mockTab);

				// attachment should have a mime type
				assert.equal(mimeType, 'text/html');
			});

			it('should guess mime type from the url if there is no content type header', async function () {
				attachment = {
					url: 'https://example.com/test.pdf',
					referrer: 'https://example.com'
				};
				let mimeType = await background(async function (attachment, mockTab) {
					// Use the actual getContentTypeFromXHR
					Zotero.Utilities.Connector.getContentTypeFromXHR.restore();

					// mock http response without a content type header
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: (header) => {
							if (header.toLowerCase() == 'content-length') return '1024';
							return null; // No content type header
						}
					});
					await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return attachment.mimeType;
				}, attachment, mockTab);

				// mime type should be guessed from the url
				assert.equal(mimeType, 'application/pdf');
			});
		});

		describe('When response has no Content-Length header', function() {
			it('should accept the response if content type is valid', async function() {
				const result = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(1024),
						status: 200,
						getResponseHeader: () => null
					});
					const result = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return result.byteLength;
				}, attachment, mockTab);

				assert.equal(result, 1024);
			});
		});

		describe('When response has Content-Length: 0', function() {
			it('should not accept the response', async function() {
				const error = await background(async function(attachment, mockTab) {
					Zotero.HTTP.request.resolves({
						response: new ArrayBuffer(0),
						status: 200,
						getResponseHeader: (header) => header.toLowerCase() == 'content-length' ? '0' : null
					});
					Zotero.BotBypass.isUrlWhitelisted.returns(false);
					try {
						await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
						return null;
					}
					catch (e) {
						return e.message;
					}
				}, attachment, mockTab);

				assert.include(error, 'Attachment download failed with HTTP status 200 (empty response)');
			});
		});

		describe('When Content-Type is application/octet-stream but translator specifies a different type', function() {
			it('should accept the response for application/pdf without attempting bot bypass', async function() {
				const outcome = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/octet-stream'
					});
					const response = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: response.byteLength,
						iframeCalled: Zotero.BotBypass.passJSDetectionViaHiddenIframe.called,
						windowPromptCalled: Zotero.BotBypass.passJSDetectionViaWindowPrompt.called
					};
				}, attachment, mockTab);

				assert.equal(outcome.byteLength, 1024);
				assert.isFalse(outcome.iframeCalled);
				assert.isFalse(outcome.windowPromptCalled);
			});

			it('should accept the response for image/jpeg without attempting bot bypass', async function() {
				attachment.mimeType = 'image/jpeg';
				const outcome = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.returns({
						contentType: 'application/octet-stream'
					});
					const response = await Zotero.ItemSaver._fetchAttachment(attachment, mockTab);
					return {
						byteLength: response.byteLength,
						iframeCalled: Zotero.BotBypass.passJSDetectionViaHiddenIframe.called,
						windowPromptCalled: Zotero.BotBypass.passJSDetectionViaWindowPrompt.called
					};
				}, attachment, mockTab);

				assert.equal(outcome.byteLength, 1024);
				assert.isFalse(outcome.iframeCalled);
				assert.isFalse(outcome.windowPromptCalled);
			});
		});


	});

}); 
