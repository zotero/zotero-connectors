/*
	***** BEGIN LICENSE BLOCK *****
	
    Copyright © 2024 Corporation for Digital Scholarship
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

Zotero.ItemSaver = Zotero.ItemSaver || {};
/**
 * Saves binary attachments to Zotero by fetching them as ArrayBuffer and passing to Zotero.
 * We do this in the background page, otherwise we would have to pass the ArrayBuffer
 * between content scripts and background, and it's bad for performance (and also requires
 * severe workarounds due to brokenness in MV3 https://issues.chromium.org/issues/338162118 )
 * @param attachment
 * @param sessionID 
 */
Zotero.ItemSaver.saveAttachmentToZotero = async function(attachment, sessionID, tab) {
	let arrayBuffer = await this._fetchAttachment(attachment, tab);
	
	const metadata = {
		id: attachment.id,
		url: attachment.url,
		contentType: attachment.mimeType,
		parentItemID: attachment.parentItem,
		title: attachment.title,
	}

	return Zotero.Connector.callMethod({
		method: "saveAttachment",
		headers: {
			"Content-Type": `${attachment.mimeType}`,
			"X-Metadata": JSON.stringify(metadata)
		},
		queryString: `sessionID=${sessionID}`
	}, arrayBuffer);
}

Zotero.ItemSaver.saveStandaloneAttachmentToZotero = async function(attachment, sessionID, tab) {
	let arrayBuffer = await this._fetchAttachment(attachment, tab);

	const metadata = {
		url: attachment.url,
		contentType: attachment.mimeType,
		title: attachment.title,
	}

	return Zotero.Connector.callMethod({
		method: "saveStandaloneAttachment",
		headers: {
			"Content-Type": `${attachment.mimeType}`,
			"X-Metadata": JSON.stringify(metadata)
		},
		queryString: `sessionID=${sessionID}`,
		timeout: 60e3
	}, arrayBuffer);
}

Zotero.ItemSaver._fetchAttachment = async function(attachment, tab, attemptBotProtectionBypass=true) {
	let options = { responseType: "arraybuffer", timeout: 60000 };
	let xhr = await Zotero.HTTP.request("GET", attachment.url, options);
	let { contentType } = Zotero.Utilities.Connector.getContentTypeFromXHR(xhr);

	if (attachment.mimeType.toLowerCase() === contentType.toLowerCase()) {
		return xhr.response;
	}
	
	// Only attempt fallback for attachments on whitelisted domains
	if (!tab || !attemptBotProtectionBypass || !this._isIframeBotBypassWhitelistedDomain(attachment.url)) {
		throw new Error("Attachment MIME type "+contentType+
			" does not match specified type "+attachment.mimeType);
	}
	
	let originalUrl = attachment.url;
	try {
		let pdfURL = await this._passJSBotDetectionViaHiddenIframe(attachment.url, tab);
		attachment.url = pdfURL;
		return await this._fetchAttachment(attachment, false);
	}
	catch (e) {
		Zotero.debug(`Failed to pass JS bot detection via hidden iframe for URL: ${attachment.url}`);
		Zotero.debug(e);
		let pdfURL = await this._passJSBotDetectionViaWindowPrompt(originalUrl, tab);
		attachment.url = pdfURL;
		return this._fetchAttachment(attachment, false);
	}
};


Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe = async function(url, tab) {
	const id = Math.random().toString(36).slice(2, 11);
	const iframeUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html") + `#url=${encodeURIComponent(url)}`;

	Zotero.debug(`Attempting to pass JS bot detection via hidden iframe for URL: ${url}`);

	// Wait for the monitor frame to load
	const waitForAttachmentPromise = new Promise((resolve) => {
		const messageListener = async (message) => {
			if (message.type === 'attachment-monitor-loaded' 
				&& !message.success) {
				Zotero.debug(`Iframe loaded for ${url}`);
				browser.runtime.onMessage.removeListener(messageListener);
				// Wait for 5s. Any longer means we've probably hit a Captcha page
				resolve(Zotero.BrowserAttachmentMonitor.waitForAttachment(tab.id, 5000))
			}
		};
		browser.runtime.onMessage.addListener(messageListener);
	});

	await browser.scripting.executeScript({
		target: { tabId: tab.id },
		func: (url, id) => {
			return new Promise((resolve) => {
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

Zotero.ItemSaver._passJSBotDetectionViaWindowPrompt = async function(url, tab) {
	Zotero.debug(`Attempting to pass JS bot detection via window prompt for URL: ${url}`);
	
	// Get screen dimensions and position
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
	const width = Math.floor(screen.width * 0.8);
	const height = Math.floor(screen.height * 0.8);
	const left = screen.left + Math.floor((screen.width - width) / 2);
	const top = screen.top + Math.floor((screen.height - height) / 2);
	
	// Create window for CAPTCHA solving
	const monitorUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html") + `#url=${encodeURIComponent(url)}`;
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
		const pdfURL = await Zotero.BrowserAttachmentMonitor.waitForAttachment(window.tabs[0].id);
		Zotero.debug(`Successfully passed JS bot detection for URL: ${url}`);
		return pdfURL;
	}
	finally {
		// Clean up: close the window
		await browser.windows.remove(window.id);
	}
};

Zotero.ItemSaver._isIframeBotBypassWhitelistedDomain = function(url) {
	const WHITELISTED_DOMAINS = [
		'sciencedirect.com',
	];
	
	const hostname = new URL(url).hostname;
	return WHITELISTED_DOMAINS.some(domain => hostname.endsWith(domain));
};