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

const PRIMARY_ATTACHMENT_TYPES = new Set([
	'application/pdf',
	'application/epub+zip',
]);

/**
 * Save translated items in JSON format
 *
 * @constructor
 * @param {Object} options
 *         <li>proxy - A proxy to deproxify item URLs</li>
 *         <li>baseURI - URI to which attachment paths should be relative</li>
 *         <li>sessionID - A sessionID for the save session to allow changes later</li>
 */
let ItemSaver = function(options) {
	this.newItems = [];
	this._sessionID = options.sessionID;
	this._proxy = options.proxy;
	this._baseURI = options.baseURI;
	this._itemType = options.itemType;
	this._items = [];
	this._singleFile = false;
	
	// Add listener for callbacks, but only for Safari or the bookmarklet. In Chrome, we
	// (have to) save attachments from the inject page.
	if(Zotero.Messaging && !ItemSaver._attachmentCallbackListenerAdded
			&& Zotero.isSafari) {
		Zotero.Messaging.addMessageListener("attachmentCallback", function(data) {
			var id = data[0],
				status = data[1];
			var callback = ItemSaver._attachmentCallbacks[id];
			if(callback) {
				if(status === false || status === 100) {
					delete ItemSaver._attachmentCallbacks[id];
				} else {
					data[1] = 50+data[1]/2;
				}
				callback(data[1], data[2]);
			}
		});
		ItemSaver._attachmentCallbackListenerAdded = true;
	}
}
ItemSaver._attachmentCallbackListenerAdded = false;
ItemSaver._attachmentCallbacks = {};

ItemSaver.prototype = {
	saveAsWebpage: function(doc) {
		var doc = doc || document;
		var item = {
			itemType: 'webpage',
			title: doc.title,
			url: doc.location.href,
			attachments: [],
			accessDate: Zotero.Date.dateToSQL(new Date(), true)
		};
		return this.saveItems([item]);
	},

	/**
	 * Saves items to Standalone or the server
	 * @param items Items in Zotero.Item.toArray() format
	 * @param {Function} [attachmentCallback] A callback that receives information about attachment
	 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
	 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
	 * @param {Function} [itemsDoneCallback] A callback that receives progress for top-item saving.
	 */
	saveItems: async function (items, attachmentCallback, itemsDoneCallback=()=>0) {
		Zotero.debug(`ItemSaver.saveItems: Saving ${items.length} items`);
		try {
			return await this._saveToZotero(items, attachmentCallback, itemsDoneCallback);
		}
		catch (e) {
			if (e.status == 0) {
				return this._saveToServer(items, attachmentCallback, itemsDoneCallback);
			}
  			throw e;
		}
	},
	
	_saveToZotero: async function (items, attachmentCallback, itemsDoneCallback=()=>0) {
		this._items = items;
		var payload = {
			sessionID: this._sessionID,
			uri: this._baseURI,
		};
		const zoteroSupportsAttachmentUpload = await Zotero.Connector.getPref('supportsAttachmentUpload');
		const automaticSnapshots = await Zotero.Connector.getPref('automaticSnapshots');
		const downloadAssociatedFiles = await Zotero.Connector.getPref('downloadAssociatedFiles');

		payload.proxy = this._proxy && this._proxy.toJSON();

		// If saving via a translator on a pdf page, we add that page as an attachment
		// At time of implementation this only happens for DOI translators
		if (items.length === 1 && document.contentType === 'application/pdf') {
			// Remove any pdf attachments added by the translator
			items[0].attachments = items[0].attachments.filter(attachment => attachment.mimeType !== 'application/pdf');
			items[0].attachments.push({
				title: 'Full Text PDF',
				url: document.location.href,
				mimeType: document.contentType,
				referrer: new URL(document.location.href).origin,
			})
		}

		this._singleFile = false;

		for (let item of items) {
			item.id = item.id || Zotero.Utilities.randomString(8);
			
			// Prepare attachments for saving
			item.attachments = item.attachments.filter((attachment) => {
				if (!attachment.title) attachment.title = attachment.mimeType + ' Attachment';
				attachment.id = attachment.id || Zotero.Utilities.randomString(8);
				attachment.parentItem = item.id;
				this._setAttachmentReferer(attachment);

				if (zoteroSupportsAttachmentUpload) {
					if (attachment.snapshot === false) {
						return true;
					}
					if (attachment.mimeType === 'text/html' && !automaticSnapshots) {
						Zotero.debug("saveToZotero: Ignoring snapshot because automaticSnapshots is disabled");
						return false;
					}
					else if (attachment.mimeType !== 'text/html' && !downloadAssociatedFiles) {
						Zotero.debug(`saveToZotero: Ignoring attachment with type ${attachment.mimeType} because downloadAssociatedFiles is disabled`);
						return false;
					}
				}
			
				// Ignore non-snapshot text/html attachments (saved as link attachments)
				// Don't save snapshots from search results.
				// TODO https://github.com/zotero/zotero-connectors/issues/481
				if (attachment.mimeType === 'text/html' && attachment.snapshot !== false) {
					if (this._itemType === "multiple") {
						Zotero.debug("saveToZotero: Ignoring snapshot of text/html attachment for multiple-item save");
						return false;
					}

					if (!zoteroSupportsAttachmentUpload) {
						payload.singleFile = true;
						attachment.singleFile = true;
					}
					this._snapshotAttachment = attachment;
					this._singleFile = true;
					// If Zotero doesn't support attachment upload then we need to pass the snapshot
					// as an attachment to Zotero via saveItems endpoint.
					return !zoteroSupportsAttachmentUpload;
				}
				
				// Otherwise translate removes attachments from items when you call
				// itemsDoneCallback
				return true;
			});
		}

		if (Zotero.isSafari) {
			// This is the best in terms of cookies we can do in Safari
			payload.cookie = document.cookie;
		}
		
		payload.items = Zotero.Utilities.deepCopy(items);

		if (zoteroSupportsAttachmentUpload) {
			// Only pass attachments that are to be saved by linking
			for (let item of payload.items) {
				item.attachments = item.attachments.filter((attachment) => {
					return attachment.snapshot === false
				});
			}
		}
		
		let data = await Zotero.Connector.callMethodWithCookies("saveItems", payload)
		if (!zoteroSupportsAttachmentUpload) items = data.items;
		// Update UI for top-level items
		itemsDoneCallback(items);

		Zotero.debug("Translate: Save via Zotero succeeded");
		Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID: this._sessionID });
		
		if (!zoteroSupportsAttachmentUpload) {
			await this.saveAttachmentsViaZotero(items, attachmentCallback);
		}
		else {
			const response = await Zotero.Connector.callMethod("getSelectedCollection", {})
			if (response.filesEditable) {
				await this.saveAttachmentsToZotero(attachmentCallback);
			}
		}

		return items;
	},

	/**
	 * Save attachments via Zotero (old workflow before Zotero supported attachment upload)
	 * @param {Object[]} items
	 * @param {Function} attachmentCallback
	 * @returns {Promise}
	 */
	async saveAttachmentsViaZotero(items, attachmentCallback) {
		Zotero.debug("ItemSaver.saveAttachmentsViaZotero: Awaiting for attachments to be saved by Zotero");
		let promises = []
		// Save the snapshot if required
		if (this._singleFile) {
			// Attachment progress will be monitored via _pollForProgress()
			// (Zotero is source of truth)
			promises.push(this._executeSingleFile(() => 0));
		}
		// Poll for progress of attachments saved by Zotero
		promises.push(this._pollForProgress(items, attachmentCallback));
		await Promise.all(promises);
	},
	
	async saveAttachmentsToZotero(attachmentCallback) {
		let promises = []

		Zotero.debug(`ItemSaver.saveAttachmentsToZotero: Saving attachments directly to Zotero`);
		
		// Save PDFs and EPUBs via the connector (in the background page)
		promises.push(this._saveAttachmentsToZotero(attachmentCallback))
		
		// Save the snapshot if required
		if (this._singleFile) {
			promises.push(this._executeSingleFile(attachmentCallback));
		}
		await Promise.all(promises);
	},
	
	_executeSingleFile: async function(attachmentCallback) {
		try {
			attachmentCallback(this._snapshotAttachment, 0);
			let data = { items: this._items, sessionID: this._sessionID };
			data.snapshotContent = await Zotero.SingleFile.retrievePageData();
			data.url = this._items[0].url || document.location.href;
			data.title = this._snapshotAttachment.title;
			await Zotero.Connector.saveSingleFile({
					method: "saveSingleFile",
					headers: {"Content-Type": "application/json"}
				},
				data
			);
			attachmentCallback(this._snapshotAttachment, 100);
		}
		catch (e) {
			Zotero.logError(e);
			attachmentCallback(this._snapshotAttachment, false, e.message)
		}
	},
	
	async _saveAttachmentsToZotero(attachmentCallback) {
		const shouldAttemptToDownloadOAAttachments = await Zotero.Connector.getPref('downloadAssociatedFiles')
		for (let item of this._items) {
			item.hasPrimaryAttachment = false;
			for (let attachment of item.attachments) {
				if (attachment.snapshot === false) {
					attachmentCallback(attachment, 100);
					continue;
				}

				attachmentCallback(attachment, 0);
				if (attachment.isOpenAccess) continue;
				try {
					Zotero.debug(`ItemSaver.saveAttachmentsToZotero: Saving attachment ${attachment.url} of mimeType ${attachment.mimeType}`);
					if (PRIMARY_ATTACHMENT_TYPES.has(attachment.mimeType)) {
						attachment.isPrimary = true;
					}
					Zotero.Messaging.addMessageListener("passJSBotDetectionViaHiddenIframe", this._passJSBotDetectionViaHiddenIframe);
					// Safari background page fetch doesn't send user's cookies, so we try to
					// fetch the attachment in the content script
					await ItemSaver.fetchAttachmentSafari(attachment);
					await Zotero.ItemSaver.saveAttachmentToZotero(attachment, this._sessionID)
					if (attachment.isPrimary) {
						item.hasPrimaryAttachment = true;
					}
					attachmentCallback(attachment, 100);
				}
				catch (e) {
					if (attachment.isPrimary && shouldAttemptToDownloadOAAttachments) {
						attachmentCallback(attachment, 0);
					}
					else {
						// Otherwise it's a failure
						attachmentCallback(attachment, false, e);
						Zotero.logError(e);
					}
				}
			}
			if (!item.hasPrimaryAttachment) {
				if (!shouldAttemptToDownloadOAAttachments) continue;
				await this.saveAttachmentFromResolver(item, attachmentCallback);
			}
		}
	},
	
	async saveAttachmentFromResolver(item, attachmentCallback) {
		let attachment = item.attachments.find(a => a.isPrimary);
		try {
			// Check if we can get an OA PDF from Zotero
			if (typeof item.hasAttachmentResolvers === "undefined") {
				item.hasAttachmentResolvers = await Zotero.Connector.callMethod('hasAttachmentResolvers', {
					sessionID: this._sessionID,
					itemID: item.id
				});
			}
			if (!item.hasAttachmentResolvers) {
				return;
			}
			
			let title = await Zotero.Connector.callMethod('saveAttachmentFromResolver', {
				sessionID: this._sessionID,
				itemID: item.id,
			});

			// Translator didn't provide a primary attachment, but we've found an OA one so add an attachment to the item
			if (!attachment) {
				attachment = {
					id: Zotero.Utilities.randomString(),
					parentItem: item.id,
					title: title,
					mimeType: 'application/pdf',
					isPrimary: true,
					isOpenAccess: true,
				};
				item.attachments.push(attachment);
			}
			else {
				attachment = Object.assign(attachment, {
					title,
					isOpenAccess: true,
				});
			}
			attachmentCallback(attachment, 100);
		} catch (e) {
			if (attachment) {
				attachmentCallback(attachment, false, e);
				Zotero.logError(e);
			}
		}
	},
	
	/**
	 * Return true if the attachment URL fuzzy matches the window location
	 *
	 * @param {String} attachmentURL
	 * @return {Boolean}
	 */
	_urlMatchesLocation: function(attachmentURL) {
		// Complete match
		if (attachmentURL === this._baseURI) {
			return true;
		}
		// Translators control the attachment URL and historically that URL was passed to
		// the client to save a snapshot. Here we are trying to detect if the attachment URL
		// has query params that are a subset of the current URL. So for example:
		// 
		// Attachment URL: /records?id=1234 would match the following:
		// 
		// Current URL: /records?id=1234#abstract
		// Current URL: /records?id=1234&utm_source=search
		// Current URL: /records?utm_source=search&id=1234
		//
		// But not match:
		//
		// Current URL: /records
		// Current URL: /records?utm_source=search
		// Current URL: /records?id=5678
		const url = new URL(attachmentURL);
		const targetUrl = new URL(this._baseURI);
		if (url.protocol + url.host + url.pathname === targetUrl.protocol + targetUrl.host
				+ targetUrl.pathname) {
			for (const [param, value] of url.searchParams) {
				if (targetUrl.searchParams.get(param) !== value) {
					return false;
				}
			}

			return true;
		}

		return false;
	},

	/**
	 * Polls for updates to attachment progress
	 * @param items Items in Zotero.Item.toArray() format
	 * @param {Function} attachmentCallback A callback that receives information about attachment
	 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
	 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
	 *     attachmentCallback() will be called with all attachments that will be saved
	 */
	_pollForProgress: async function (items, attachmentCallback) {
		var attachments = [];
		for (let item of items) {
			if (!item.attachments) continue;
			for (let attachment of item.attachments) {
				if (attachment.id) {
					attachments.push(attachment);
				}
			}
		}
		
		var nPolls = 0;
		while (true) {
			try {
				var response = await Zotero.Connector.callMethod(
					"sessionProgress", { sessionID: this._sessionID }
				)
			}
			catch (e) {
				for (let attachment of attachments) {
					attachmentCallback(attachment, false, "Lost connection to Zotero");
				}
				return;
			}
			
			// Store last version of attachments so we can cancel them if a subsequent request fails
			let newAttachments = [];
			for (let item of response.items) {
				if (!item.attachments) continue;
				for (let attachment of item.attachments) {
					attachment.parentItem = item.id;
					attachmentCallback(attachment, attachment.progress);
					newAttachments.push(attachment);
				}
			}
			attachments = newAttachments;
			
			if (nPolls++ < 60 && !response.done) {
				await Zotero.Promise.delay(1000);
			}
			else {
				break;
			}
		}
	},
	

	/**
	 * Saves items to server
	 * @param items Items in Zotero.Item.toArray() format
	 * @param {Function} attachmentCallback A callback that receives information about attachment
	 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
	 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
	 *     attachmentCallback() will be called with all attachments that will be saved
	 */
	_saveToServer: async function (items, attachmentCallback, itemsDoneCallback=()=>0) {
		Zotero.debug(`ItemSaver._saveToServer: Saving ${items.length} items to server`);
		var newItems = [], itemIndices = [];
		
		for(var i=0, n=items.length; i<n; i++) {
			var item = items[i];
			// deproxify url
			if (this._proxy && item.url) {
				item.url = this._proxy.toProper(item.url);
			}
			itemIndices[i] = newItems.length;
			newItems = newItems.concat(Zotero.Utilities.Item.itemToAPIJSON(item));
			for (let attachment of item.attachments) {
				attachment.id = Zotero.Utilities.randomString();
			}
		}
		
		let response = await Zotero.API.createItem(newItems);
		try {
			var resp = JSON.parse(response);
		} catch(e) {
			throw new Error("Unexpected response received from server");
		}
		
		for (var key in resp.failed) {
			throw new Error("Save to server failed with " + response.statusCode + " " + response);
		}
		
		Zotero.debug("Translate: Save to server complete");
		itemsDoneCallback(items);
		
		const prefs = await Zotero.Prefs.getAsync(["downloadAssociatedFiles", "automaticSnapshots"])

		for (const item of items) {
			for (const attachment of item.attachments) {
				this._setAttachmentReferer(attachment);
				
				if (attachment.mimeType === 'text/html') {
					if (prefs.automaticSnapshots) {
						attachmentCallback(attachment, 0);
					}
				}
				else if (prefs.downloadAssociatedFiles) {
					attachmentCallback(attachment, 0);
				}
			}
		}
		for (var i=0; i<items.length; i++) {
			var item = items[i], key = resp.success[itemIndices[i]];
			item.key = key;
			if (item.attachments && item.attachments.length) {
				await this._saveAttachmentsToServer(key, this._getFileBaseNameFromItem(item),
					item.attachments, prefs, attachmentCallback);
			}
		}
		
		return items;
	},

	/**
	 *
	 * @param {String} itemKey The key of the parent item
	 * @param {String} baseName A string to use as the base name for attachments
	 * @param {Object[]} attachments An array of attachment objects
	 * @param {Object} prefs An object with the values of the downloadAssociatedFiles and automaticSnapshots preferences
	 * @param {Function} attachmentCallback A callback that receives information about attachment
	 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
	 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
	 * @private
	 */
	_saveAttachmentsToServer: async function(itemKey, baseName, attachments, prefs, attachmentCallback=()=>0) {
		let promises = []
		for (let attachment of attachments) {
			Zotero.debug(`ItemSaver._saveAttachmentsToServer: Saving attachment ${attachment.title} to server`);
			let isSnapshot = false;
			if (attachment.mimeType) {
				switch (attachment.mimeType.toLowerCase()) {
					case "text/html":
					case "application/xhtml+xml":
						isSnapshot = true;
				}
			}

			if ((isSnapshot && !prefs.automaticSnapshots) || (!isSnapshot && !prefs.downloadAssociatedFiles)) {
				// Skip attachment due to prefs
				continue;
			}

			attachment.parentKey = itemKey;

			switch (attachment.mimeType.toLowerCase()) {
			case "application/pdf":
				attachment.filename = baseName+".pdf";
				break;
			case "text/html":
			case "application/xhtml+xml":
				attachment.filename = baseName+".html";
				attachment.data = await Zotero.SingleFile.retrievePageData();
				break;
			default:
				attachment.filename = baseName;
			}

			// Don't download attachment if snapshot is specifically set to false
			attachment.linkMode = attachment.snapshot === false ? "linked_url" : "imported_url";

			promises.push((async () => {
				try {
					await ItemSaver.fetchAttachmentSafari(attachment);
					await Zotero.ItemSaver.saveAttachmentToServer(attachment);
					attachmentCallback(attachment, 100);
				}
				catch (e) {
					attachmentCallback(attachment, false, e);
					Zotero.logError(e);
				}
			})());
		}
		await Promise.all(promises);
	},
	
	_setAttachmentReferer(attachment) {
		attachment.referrer = new URL(document.location.href).origin;
	},
	
	/**
	 * Gets the base name for an attachment from an item object. This mimics the default behavior
	 * of Zotero.Attachments.getFileBaseNameFromItem
	 * @param {Object} item
	 */
	"_getFileBaseNameFromItem":function(item) {
		var parts = [];
		if(item.creators && item.creators.length) {
			if(item.creators.length === 1) {
				parts.push(item.creators[0].lastName);
			} else if(item.creators.length === 2) {
				parts.push(item.creators[0].lastName+" and "+item.creators[1].lastName);
			} else {
				parts.push(item.creators[0].lastName+" et al.");
			}
		}
		
		if(item.date) {
			var date = Zotero.Date.strToDate(item.date);
			if(date.year) parts.push(date.year);
		}
		
		if(item.title) {
			parts.push(item.title.substr(0, 50));
		}
		
		if(parts.length) return parts.join(" - ").trim();
		return "Attachment";
	},
};

/**
 * Fetches an attachment in Safari content script.
 * 
 * Background page xhr on Safari doesn't send user's cookies, so we try to
 * fetch the attachment in the content script.
 * @param {Object} attachment
 */
ItemSaver.fetchAttachmentSafari = async function(attachment) {
	if (!Zotero.isSafari) return;
	let options = { responseType: "arraybuffer", timeout: 60000, forceInject: true };
	let xhr;
	try {
		xhr = await Zotero.HTTP.request("GET", attachment.url, options);
	}
	catch (e) {
		Zotero.debug(`Failed to fetch attachment in safari content script: ${attachment.url}`);
		return;
	}
	let { contentType } = Zotero.Utilities.Connector.getContentTypeFromXHR(xhr);

	if (attachment.mimeType.toLowerCase() === contentType.toLowerCase()) {
		Zotero.debug(`Fetched an attachment in safari content script: ${attachment.url}`);
		attachment.data = Zotero.Utilities.Connector.arrayBufferToBase64(xhr.response);
	}
}

export default ItemSaver;