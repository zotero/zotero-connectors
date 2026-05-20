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

let BOT_BYPASS_WHITELISTED_DOMAINS = [
	'sciencedirect.com',
	'pdf.sciencedirectassets.com',
	'ncbi.nlm.nih.gov', // PubMed
];

let AMAZON_CAPTCHA_HEADERS = {
	'x-amzn-waf-action': 'challenge',
};

Zotero.BotBypass = Zotero.BotBypass || {};

Zotero.BotBypass.BYPASS_TYPE = {
	NONE: 'none',
	FRAME_OR_WINDOW: 'frameOrWindow',
	AMAZON_CAPTCHA: 'amazonCaptcha',
};

Zotero.BotBypass.canBotBypass = function(url, xhr) {
	if (this.isAmazonCaptchaResponse(xhr)) {
		return this.BYPASS_TYPE.AMAZON_CAPTCHA;
	}
	if (this.isUrlWhitelisted(url)) {
		return this.BYPASS_TYPE.FRAME_OR_WINDOW;
	}
	return this.BYPASS_TYPE.NONE;
};

Zotero.BotBypass.isAmazonCaptchaResponse = function(xhr) {
	if (!xhr || !xhr.getResponseHeader) return false;
	for (let [header, value] of Object.entries(AMAZON_CAPTCHA_HEADERS)) {
		let responseValue = xhr.getResponseHeader(header);
		if (responseValue && responseValue.toLowerCase() === value) {
			return true;
		}
	}
	return false;
};

Zotero.BotBypass.isUrlWhitelisted = function(url) {
	let proxies = Object.entries(Zotero.Proxies.getPotentialProxies(url));
	for (let [url, _] of proxies) {
		const hostname = new URL(url).hostname;
		if (BOT_BYPASS_WHITELISTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
			return true;
		}
	}
	return false;
};

Zotero.BotBypass.bypassAmazonCaptcha = async function(attachment, options) {
	Zotero.debug(`Attempting Amazon CAPTCHA bot bypass for ${attachment.url}`);
	options = Zotero.Utilities.deepCopy(options);
	options.headers = Object.assign({}, options.headers, {
		'Sec-Fetch-Site': 'same-origin',
	});

	let xhr = await Zotero.HTTP.request("GET", attachment.url, options);
	if (Zotero.ItemSaver._validateResponse(attachment, xhr)) {
		return xhr.response;
	}
	let { contentType } = Zotero.Utilities.Connector.getContentTypeFromXHR(xhr);
	throw new Error("Attachment MIME type "+contentType+
		" does not match specified type "+attachment.mimeType);
};

Zotero.BotBypass.passJSDetectionViaHiddenIframe = async function(url, tab) {
	const id = Math.random().toString(36).slice(2, 11);
	const iframeUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html");

	Zotero.debug(`Attempting to pass JS bot detection via hidden iframe for URL: ${url}`);

	// Wait for the monitor frame to load
	let messageListener;
	const waitForAttachmentPromise = new Promise((resolve) => {
		// WARNING: Do not make this listener async. The browser-polyfill wraps async
		// onMessage listeners such that they call sendResponse(undefined) for messages
		// they don't handle, stealing responses from other listeners. This will be safe
		// to change once Chromium fully supports native browser.* APIs.
		messageListener = (message) => {
			if (message.type === 'attachment-monitor-loaded' 
				&& !message.success) {
				Zotero.debug(`Iframe loaded for ${url}`);
				browser.runtime.onMessage.removeListener(messageListener);
				// Wait for 5s. Any longer means we've probably hit a Captcha page
				resolve(Zotero.BrowserAttachmentMonitor.waitForAttachment(tab.id, url, 5000))
			}
		};
		browser.runtime.onMessage.addListener(messageListener);
	});

	await browser.scripting.executeScript({
		target: { tabId: tab.id },
		func: (url, id) => {
			return new Promise((resolve, reject) => {
				let iframe = document.createElement('iframe');
				iframe.style.display = 'none';
				iframe.src = url;
				iframe.id = id;

				iframe.onload = () => {
					resolve();
				};

				document.body.appendChild(iframe);
			});
		},
		args: [iframeUrl, id]
	});

	try {
		let pdfURL = await waitForAttachmentPromise;
		Zotero.debug(`Successfully passed JS bot detection for URL: ${url}`);
		return pdfURL;
	}
	finally {
		browser.runtime.onMessage.removeListener(messageListener);
		await browser.scripting.executeScript({
			target: { tabId: tab.id },
			func: (id) => {
				const iframe = document.getElementById(id);
				if (iframe) {
					iframe.parentNode.removeChild(iframe);
				}
			},
			args: [id]
		});
	}
};

Zotero.BotBypass.passJSDetectionViaWindowPrompt = async function(url, tab) {
	Zotero.debug(`Attempting to pass JS bot detection via window prompt for URL: ${url}`);
	
	// Get screen dimensions and position
	let left, top, width, height;
	try {
		const screenInfo = await browser.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => {
				return {
					width: window.screen.availWidth,
					height: window.screen.availHeight,
					left: window.screen.availLeft,
					top: window.screen.availTop
				};
			}
		});
		const screen = screenInfo[0].result;
		width = Math.floor(screen.width * 0.8);
		height = Math.floor(screen.height * 0.8);
		left = screen.left + Math.floor((screen.width - width) / 2);
		top = screen.top + Math.floor((screen.height - height) / 2);
	} catch (e) {
		Zotero.debug(`Error getting screen dimensions and position for window prompt for ${url}`);
		Zotero.debug(e);
	}
	
	// Create window for CAPTCHA solving
	const monitorUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html");
	const window = await browser.windows.create({
		url: monitorUrl,
		type: 'popup',
		width,
		height,
		left,
		top
	});
	
	try {
		// Wait for successful PDF URL capture
		const pdfURL = await Zotero.BrowserAttachmentMonitor.waitForAttachment(window.tabs[0].id, url);
		Zotero.debug(`Successfully passed JS bot detection for URL: ${url}`);
		return pdfURL;
	}
	finally {
		// Clean up: close the window
		await browser.windows.remove(window.id);
	}
};
