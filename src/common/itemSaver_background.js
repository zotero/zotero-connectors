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

let BOT_BYPASS_WHITELISTED_DOMAINS = [
	'sciencedirect.com',
	'ncbi.nlm.nih.gov', // PubMed
];

Zotero.ItemSaver = Zotero.ItemSaver || {};

/**
 * Checks if a string contains characters not allowed in HTTP headers (non-ASCII characters)
 * @param {string} str - The string to check
 * @returns {boolean} - True if the string contains non-ASCII characters
 */
Zotero.ItemSaver._containsNonAsciiChars = function(str) {
	if (!str) return false;
	// Check for any character with code > 127 (non-ASCII)
	for (let i = 0; i < str.length; i++) {
		if (str.charCodeAt(i) > 127) {
			return true;
		}
	}
	return false;
};

/**
 * RFC2047 encodes a string using quoted-printable encoding for use in HTTP headers
 * @param {string} str - The string to encode
 * @returns {string} - The RFC2047 encoded string
 */
Zotero.ItemSaver._rfc2047Encode = function(str) {
	if (!str || !this._containsNonAsciiChars(str)) {
		return str;
	}
	
	const utf8Bytes = new TextEncoder().encode(str);
	let encoded = '';
	for (let byte of utf8Bytes) {
		// Encode spaces as underscores, other special chars as =XX
		if (byte === 32) { // space
			encoded += '_';
		}
		else if (byte >= 33 && byte <= 126 && byte !== 61 && byte !== 63 && byte !== 95) {
			// Printable ASCII except =, ?, _
			encoded += String.fromCharCode(byte);
		}
		else {
			encoded += '=' + byte.toString(16).toUpperCase().padStart(2, '0');
		}
	}
	
	// Return RFC2047 encoded format: =?UTF-8?Q?quoted-printable?=
	return `=?UTF-8?Q?${encoded}?=`;
};

/**
 * Saves binary attachments to Zotero by fetching them as ArrayBuffer and passing to Zotero.
 * We do this in the background page, otherwise we would have to pass the ArrayBuffer
 * between content scripts and background, and it's bad for performance (and also requires
 * severe workarounds due to brokenness in MV3 https://issues.chromium.org/issues/338162118 )
 * @param attachment
 * @param sessionID 
 */
Zotero.ItemSaver.saveAttachmentToZotero = async function(attachment, sessionID, tab) {
	let arrayBuffer;
	if (attachment.data) {
		arrayBuffer = this._unpackSafariAttachmentData(attachment.data);
		delete attachment.data;
	}
	if (!arrayBuffer) {
		arrayBuffer = await this._fetchAttachment(attachment, tab);
	}
	
	let metadata = JSON.stringify({
		id: attachment.id,
		url: attachment.url,
		contentType: attachment.mimeType,
		parentItemID: attachment.parentItem,
		title: this._rfc2047Encode(attachment.title),
	});

	return Zotero.Connector.callMethod({
		method: "saveAttachment",
		headers: {
			"Content-Type": `${attachment.mimeType}`,
			"X-Metadata": metadata
		},
		queryString: `sessionID=${sessionID}`
	}, arrayBuffer);
}

Zotero.ItemSaver.saveStandaloneAttachmentToZotero = async function(attachment, sessionID, tab) {
	let arrayBuffer;
	if (attachment.data) {
		arrayBuffer = this._unpackSafariAttachmentData(attachment.data);
		delete attachment.data;
	}
	if (!arrayBuffer) {
		arrayBuffer = await this._fetchAttachment(attachment, tab);
	}

	let metadata = JSON.stringify({
		url: attachment.url,
		contentType: attachment.mimeType,
		title: this._rfc2047Encode(attachment.title),
	});

	return Zotero.Connector.callMethod({
		method: "saveStandaloneAttachment",
		headers: {
			"Content-Type": `${attachment.mimeType}`,
			"X-Metadata": metadata
		},
		queryString: `sessionID=${sessionID}`,
		timeout: 60e3
	}, arrayBuffer);
}

Zotero.ItemSaver.saveAttachmentToServer = async function(attachment, tab) {
	let promises = []
	promises.push(this._createServerAttachmentItem(attachment));

	// SingleFile snapshot
	if (typeof attachment.data === 'string' && attachment.mimeType === 'text/html') {
		let snapshotString = attachment.data;
		attachment.data = new Uint8Array(Zotero.Utilities.getStringByteLength(snapshotString));
		Zotero.Utilities.stringToUTF8Array(snapshotString, attachment.data);
	}
	else if (Zotero.isSafari && attachment.data) {
		// Safari fetches binary attachments in content script when possible
		attachment.data = new Uint8Array(this._unpackSafariAttachmentData(attachment.data));
	}

	// Don't download if the attachment is supposed to be linked
	if (!attachment.data || attachment.linkMode !== "imported_url") {
		promises.push(this._fetchAttachment(attachment, tab));
	}

	const [itemKey, arrayBuffer] = await Promise.all(promises);

	attachment.data = attachment.data || new Uint8Array(arrayBuffer);
	// If no data then no need to upload
	if (!attachment.data) return;

	attachment.key = itemKey;
	attachment.md5 = this.md5(attachment.data);

	// Do not return here or a message is attempted to pass back to injected page
	// which causes a failure due to it sometimes exceeding max message length.
	await Zotero.API.uploadAttachment(attachment);
}


/**
 * Creates an attachment item on the Zotero server. This assigns a "key" to the item
 * and allows to upload the attachment data
 *
 * @param parentItemKey
 * @param attachment
 * @returns {Promise.<String>} Item key
 * @private
 */
Zotero.ItemSaver._createServerAttachmentItem = async function(attachment) {
	var item = [{
		itemType: "attachment",
		linkMode: attachment.linkMode,
		title: attachment.title ? attachment.title.toString() : "Untitled Attachment",
		accessDate: "CURRENT_TIMESTAMP",
		url: attachment.url,
		tags: Array.isArray(attachment.tags) ? attachment.tags : []
	}];
	if (attachment.parentKey) {
		item[0].parentItem = attachment.parentKey;
	}
	
	let response = await Zotero.API.createItem(item);
	try {
		response = JSON.parse(response);
	} catch(e) {
		throw new Error(`Unexpected response from server ${response}`);
	}
	Zotero.debug(`Attachment item created for ${attachment.title}`);
	return response.success[0];
},

Zotero.ItemSaver._fetchAttachment = async function(attachment, tab, attemptBotProtectionBypass=true) {
	let options = { responseType: "arraybuffer", timeout: 60000 };
	if (!Zotero.isSafari) {
		let cookies;
		try {
			cookies = await browser.cookies.getAll({
				url: attachment.url,
				partitionKey: {},
			});
		} catch (e) {
			// Unavailable with Chrome 118 and below. Last supported version on Win 7/8 is Chrome 109.
			Zotero.debug(`Error getting cookies for ${attachment.url} with partitionKey.`);
			cookies = await browser.cookies.getAll({
				url: attachment.url,
			});
		}
		options.headers = {
			"Cookie": cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
		}
		options.referrer = attachment.referrer;
	}

	// Bot bypass is not supported in Safari (cannot intercept file download popup)
	attemptBotProtectionBypass = attemptBotProtectionBypass && !Zotero.isSafari;
	var contentType;
	try {
		let xhr = await Zotero.HTTP.request("GET", attachment.url, options);
		let result = Zotero.Utilities.Connector.getContentTypeFromXHR(xhr);
		contentType = result.contentType;

		// If the attachment doesn't specify the mimeType, we accept whatever mimeType we got here.
		// If translators want to enforce that a PDF is saved, then they should specify that!
		if (!attachment.mimeType || attachment.mimeType.toLowerCase() === contentType.toLowerCase()) {
			return xhr.response;
		}
	} catch (e) {
		if (!attemptBotProtectionBypass || !tab || !this._isUrlBotBypassWhitelisted(attachment.url)) {
			throw e;
		}
		Zotero.debug(`Error downloading attachment ${attachment.url} : ${e.message} \nattempting bot protection bypass`);
	}

	// Only attempt fallback for attachments on whitelisted domains
	if (!tab || !attemptBotProtectionBypass || !this._isUrlBotBypassWhitelisted(attachment.url)) {
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

Zotero.ItemSaver._unpackSafariAttachmentData = function(data) {
	if (typeof data === 'string') {
		return Zotero.Utilities.Connector.base64ToArrayBuffer(data);
	}
	return data;
}

Zotero.ItemSaver._passJSBotDetectionViaHiddenIframe = async function(url, tab) {
	const id = Math.random().toString(36).slice(2, 11);
	const iframeUrl = Zotero.getExtensionURL("browserAttachmentMonitor/browserAttachmentMonitor.html");

	Zotero.debug(`Attempting to pass JS bot detection via hidden iframe for URL: ${url}`);

	// Wait for the monitor frame to load
	const waitForAttachmentPromise = new Promise((resolve) => {
		const messageListener = async (message) => {
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

Zotero.ItemSaver._isUrlBotBypassWhitelisted = function(url) {
	let proxies = Object.entries(Zotero.Proxies.getPotentialProxies(url));
	for (let [url, _] of proxies) {
		const hostname = new URL(url).hostname;
		if (BOT_BYPASS_WHITELISTED_DOMAINS.some(domain => hostname.endsWith(domain))) {
			return true;
		}
	}
	return false;
};

Zotero.ItemSaver.md5 = function(uint8Array) {
	var binaryHash = this._md5(uint8Array, 0, uint8Array.byteLength),
		hash = "";
	for(var i=0; i<binaryHash.length; i++) {
		if(binaryHash[i] < 16) hash += "0";
		hash += binaryHash[i].toString(16);
	}
	return hash;
}

/*
	pdf.js MD5 implementation
	Copyright (c) 2011 Mozilla Foundation

	Contributors: Andreas Gal <gal@mozilla.com>
				Chris G Jones <cjones@mozilla.com>
				Shaon Barman <shaon.barman@gmail.com>
				Vivien Nicolas <21@vingtetun.org>
				Justin D'Arcangelo <justindarc@gmail.com>
				Yury Delendik
				Kalervo Kujala
				Adil Allawi <@ironymark>
				Jakob Miland <saebekassebil@gmail.com>
				Artur Adib <aadib@mozilla.com>
				Brendan Dahl <bdahl@mozilla.com>
				David Quintana <gigaherz@gmail.com>

	Permission is hereby granted, free of charge, to any person obtaining a
	copy of this software and associated documentation files (the "Software"),
	to deal in the Software without restriction, including without limitation
	the rights to use, copy, modify, merge, publish, distribute, sublicense,
	and/or sell copies of the Software, and to permit persons to whom the
	Software is furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in
	all copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
	THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
	FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
	DEALINGS IN THE SOFTWARE.
*/
Zotero.ItemSaver._md5 = (function calculateMD5Closure() {
	// Don't throw if typed arrays are not supported
	try {
		var r = new Uint8Array([
			7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
			5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
			4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
			6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21]);
	
		var k = new Int32Array([
			-680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
			-1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
			1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
			643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
			568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784,
			1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556,
			-1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222,
			-722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
			-198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606,
			-1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
			-145523070, -1120210379, 718787259, -343485551]);
	} catch(e) {};

	function hash(data, offset, length) {
		var h0 = 1732584193, h1 = -271733879, h2 = -1732584194, h3 = 271733878;
		// pre-processing
		var paddedLength = (length + 72) & ~63; // data + 9 extra bytes
		var padded = new Uint8Array(paddedLength);
		var i, j, n;
		if (offset || length != data.byteLength) {
			padded.set(new Uint8Array(data.buffer, offset, length));
		} else {
			padded.set(data);
		}
		i = length;
		padded[i++] = 0x80;
		n = paddedLength - 8;
		while (i < n)
			padded[i++] = 0;
		padded[i++] = (length << 3) & 0xFF;
		padded[i++] = (length >> 5) & 0xFF;
		padded[i++] = (length >> 13) & 0xFF;
		padded[i++] = (length >> 21) & 0xFF;
		padded[i++] = (length >>> 29) & 0xFF;
		padded[i++] = 0;
		padded[i++] = 0;
		padded[i++] = 0;
		// chunking
		// TODO ArrayBuffer ?
		var w = new Int32Array(16);
		for (i = 0; i < paddedLength;) {
			for (j = 0; j < 16; ++j, i += 4) {
				w[j] = (padded[i] | (padded[i + 1] << 8) |
						(padded[i + 2] << 16) | (padded[i + 3] << 24));
			}
			var a = h0, b = h1, c = h2, d = h3, f, g;
			for (j = 0; j < 64; ++j) {
				if (j < 16) {
					f = (b & c) | ((~b) & d);
					g = j;
				} else if (j < 32) {
					f = (d & b) | ((~d) & c);
					g = (5 * j + 1) & 15;
				} else if (j < 48) {
					f = b ^ c ^ d;
					g = (3 * j + 5) & 15;
				} else {
					f = c ^ (b | (~d));
					g = (7 * j) & 15;
				}
				var tmp = d, rotateArg = (a + f + k[j] + w[g]) | 0, rotate = r[j];
				d = c;
				c = b;
				b = (b + ((rotateArg << rotate) | (rotateArg >>> (32 - rotate)))) | 0;
				a = tmp;
			}
			h0 = (h0 + a) | 0;
			h1 = (h1 + b) | 0;
			h2 = (h2 + c) | 0;
			h3 = (h3 + d) | 0;
		}
		return new Uint8Array([
				h0 & 0xFF, (h0 >> 8) & 0xFF, (h0 >> 16) & 0xFF, (h0 >>> 24) & 0xFF,
				h1 & 0xFF, (h1 >> 8) & 0xFF, (h1 >> 16) & 0xFF, (h1 >>> 24) & 0xFF,
				h2 & 0xFF, (h2 >> 8) & 0xFF, (h2 >> 16) & 0xFF, (h2 >>> 24) & 0xFF,
				h3 & 0xFF, (h3 >> 8) & 0xFF, (h3 >> 16) & 0xFF, (h3 >>> 24) & 0xFF
		]);
	}
	return hash;
})()