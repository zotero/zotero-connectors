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
Zotero.ItemSaver.saveAttachmentToZotero = async function(attachment, sessionID) {
	let arrayBuffer = await this._fetchAttachment(attachment);
	
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

Zotero.ItemSaver.saveStandaloneAttachmentToZotero = async function(attachment, sessionID) {
	let arrayBuffer = await this._fetchAttachment(attachment);

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

Zotero.ItemSaver._fetchAttachment = async function(attachment) {
	let options = { responseType: "arraybuffer", timeout: 60000 };
	let xhr = await Zotero.HTTP.request("GET", attachment.url, options);
	let { contentType } = Zotero.Utilities.Connector.getContentTypeFromXHR(xhr);

	if (attachment.mimeType.toLowerCase() !== contentType.toLowerCase()) {
		throw new Error("Attachment MIME type "+contentType+
			" does not match specified type "+attachment.mimeType);
	}
	return xhr.response;
}