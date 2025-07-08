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
			mockTab = { id: 123 };

			// Set up default stubs
			await background(function() {
				sinon.stub(browser.cookies, 'getAll').resolves([
					{ name: 'sessionid', value: 'abc123' },
					{ name: 'csrf', value: 'xyz789' }
				]);
				
				sinon.stub(Zotero.HTTP, 'request').resolves({
					response: new ArrayBuffer(1024),
					status: 200
				});
				
				sinon.stub(Zotero.Utilities.Connector, 'getContentTypeFromXHR').returns({
					contentType: 'application/pdf'
				});
				
				sinon.stub(Zotero.ItemSaver, '_passJSBotDetectionViaHiddenIframe')
					.resolves('https://example.com/corrected.pdf');
				
				sinon.stub(Zotero.ItemSaver, '_passJSBotDetectionViaWindowPrompt')
					.resolves('https://example.com/corrected.pdf');

				sinon.stub(Zotero.ItemSaver, '_isUrlBotBypassWhitelisted').returns(true);
			});
		});

		afterEach(async function() {
			// Clean up all stubs
			await background(function() {
				browser.cookies.getAll.restore();
				Zotero.HTTP.request.restore();
				Zotero.Utilities.Connector.getContentTypeFromXHR.restore();
				Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe.restore();
				Zotero.ItemSaver._passJSBotDetectionViaWindowPrompt.restore();
				Zotero.ItemSaver._isUrlBotBypassWhitelisted.restore();
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
		});

		describe('When HTTP.request returns 200 but mimetype is different', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'  // Wrong content type
					});
					
					Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe
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
					Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe
						.rejects(new Error('Iframe bypass failed'));
					
					Zotero.ItemSaver._passJSBotDetectionViaWindowPrompt
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
					Zotero.Utilities.Connector.getContentTypeFromXHR.onFirstCall().returns({
						contentType: 'text/html'
					});

					Zotero.ItemSaver._isUrlBotBypassWhitelisted.returns(false);
					
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

		describe('When HTTP.request throws 403 error', function() {
			it('should attempt bot bypass', async function() {
				attachment.url = 'https://sciencedirect.com/test.pdf';
				
				const result = await background(async function(attachment, mockTab) {
					
					// First request throws 403 error
					const httpError = new Zotero.HTTP.StatusError({status: 403});
					Zotero.HTTP.request.onFirstCall().rejects(httpError);
					
					Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe
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
	});

	describe('_isUrlBotBypassWhitelisted', function() {
		it('should return true for a whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.ItemSaver._isUrlBotBypassWhitelisted(url);
			}, 'https://www.sciencedirect.com/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return true for a subdomain of a whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.ItemSaver._isUrlBotBypassWhitelisted(url);
			}, 'https://foo.sciencedirect.com/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return false for a non-whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.ItemSaver._isUrlBotBypassWhitelisted(url);
			}, 'https://www.example.com/test.pdf');
			assert.isFalse(result);
		});

		it('should return true for a proxied whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.ItemSaver._isUrlBotBypassWhitelisted(url);
			}, 'https://www-sciencedirect-com.proxy.uni.edu/science/article/pii/S0000000000000000');
			assert.isTrue(result);
		});

		it('should return false for a proxied non-whitelisted domain', async function() {
			const result = await background(function(url) {
				return Zotero.ItemSaver._isUrlBotBypassWhitelisted(url);
			}, 'https://www-example-com.proxy.uni.edu/test.pdf');
			assert.isFalse(result);
		});
	});
}); 