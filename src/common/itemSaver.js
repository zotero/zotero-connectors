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
		try {
			return this._saveToZotero(items, attachmentCallback, itemsDoneCallback);
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
		const isChromiumIncognito = Zotero.isChromium && await Zotero.Connector_Browser.isIncognito()
		const zoteroSupportsAttachmentUpload = await Zotero.Connector.getPref('supportsAttachmentUpload');

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
			})
		}

		this._singleFile = false;

		for (let item of items) {
			item.id = item.id || Zotero.Utilities.randomString(8);
			
			// Prepare snapshot for saving
			item.attachments = item.attachments.filter((attachment) => {
				if (!attachment.title) attachment.title = attachment.mimeType + ' Attachment';
				attachment.id = attachment.id || Zotero.Utilities.randomString(8);
				attachment.parentItem = item.id;
				
				// Ignore non-snapshot text/html attachments (saved as link attachments)
				// Don't save snapshots in Chromium incognito where it doesn't work
				// Don't save snapshots from search results.
				// TODO https://github.com/zotero/zotero-connectors/issues/481
				if (attachment.mimeType === 'text/html' && attachment.snapshot !== false) {
					if (this._itemType === "multiple" || isChromiumIncognito) {
						return false;
					}
					this._snapshotAttachment = attachment;
					this._singleFile = true;
					// Filter the snapshot out of attachments since it will be saved via _executeSingleFile()
					return false;
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
			// Zotero supports attachmentUpload so we don't tell it about
			// any attachments since saving them is our concern.
			for (let item of payload.items) {
				item.attachments = [];
			}
		}
		
		let data = await Zotero.Connector.callMethodWithCookies("saveItems", payload)
		if (!zoteroSupportsAttachmentUpload) items = data.items;
		// Update UI for top-level items
		itemsDoneCallback(items);

		Zotero.debug("Translate: Save via Zotero succeeded");
		Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID: this._sessionID });
		
		if (!zoteroSupportsAttachmentUpload) {
			// Poll for progress of attachments saved by Zotero
			await this._pollForProgress(items, attachmentCallback);
		}
		else {
			const response = await Zotero.Connector.callMethod("getSelectedCollection", {})
			if (response.filesEditable) {
				await this.saveAttachmentsToZotero(attachmentCallback);
			}
		}

		return items;
	},
	
	async saveAttachmentsToZotero(attachmentCallback) {
		let promises = []
		
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
			data.snapshotContent = Zotero.Utilities.Connector.packString(await Zotero.SingleFile.retrievePageData());
			data.url = this._items[0].url;
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
				attachmentCallback(attachment, 0);
				if (attachment.isOpenAccess) continue;
				try {
					if (PRIMARY_ATTACHMENT_TYPES.has(attachment.mimeType)) {
						attachment.isPrimary = true;
					}
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
				await this.saveOAAttachment(item, attachmentCallback);
			}
		}
	},
	
	async saveOAAttachment(item, attachmentCallback) {
		let attachment = item.attachments.find(a => a.isPrimary);
		try {
			// Check if we can get an OA PDF from Zotero
			if (typeof item.hasAlternativeAttachment === "undefined") {
				// Change line for the primary attachment if we're going to look for OA alternatives
				if (attachment) {
					attachment.title = "Searching for Open Access files…";
					attachmentCallback(attachment, 0);
				}
				item.hasAlternativeAttachment = await Zotero.Connector.callMethod('hasOAAttachments', {
					sessionID: this._sessionID,
					itemID: item.id
				});
			}
			if (!item.hasAlternativeAttachment) {
				if (attachment) {
					attachment.title = "No Open Access PDFs found";
					attachmentCallback(attachment, false)
				}
				return;
			}

			// Translator didn't provide a primary attachment, but we've found an OA one so add an attachment to the item
			if (!attachment) {
				attachment = {
					id: Zotero.Utilities.randomString(),
					parent: item.id,
					title: "Open Access PDF",
					mimeType: 'application/pdf',
					isPrimary: true,
					isOpenAccess: true,
				};
				item.attachments.push(attachment);
			}
			attachmentCallback(attachment, 0);
			
			attachment.title = await Zotero.Connector.callMethod('saveOAAttachment', {
				sessionID: this._sessionID,
				itemID: item.id,
			});
			attachmentCallback(attachment, 100);
		} catch (e) {
			if (attachment) {
				attachment.title = "Failed to get Open Access PDF";
				attachmentCallback(attachment, false, e);
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
		var newItems = [], itemIndices = [], typedArraysSupported = false;
		try {
			typedArraysSupported = !!(new Uint8Array(1) && new Blob());
		} catch(e) {}
		
		for(var i=0, n=items.length; i<n; i++) {
			var item = items[i];
			// deproxify url
			if (this._proxy && item.url) {
				item.url = this._proxy.toProper(item.url);
			}
			itemIndices[i] = newItems.length;
			newItems = newItems.concat(Zotero.Utilities.Item.itemToAPIJSON(item));
			if (typedArraysSupported) {
				for (let attachment of item.attachments) {
					attachment.id = Zotero.Utilities.randomString();
				}
			} else {
				item.attachments = [];
			}
		}
		
		let response = await Zotero.API.createItem(newItems);
		try {
			var resp = JSON.parse(response);
		} catch(e) {
			throw new Error("Unexpected response received from server");
		}
		
		for (var key in resp.failed) {
			throw new Error("Save to server failed with " + statusCode + " " + response);
		}
		
		Zotero.debug("Translate: Save to server complete");
		return Zotero.Prefs.getAsync(["downloadAssociatedFiles", "automaticSnapshots"])
		.then(function (prefs) {
			if (typedArraysSupported) {
				for (var i=0; i<items.length; i++) {
					var item = items[i], key = resp.success[itemIndices[i]];
					if (item.attachments && item.attachments.length) {
						this._saveAttachmentsToServer(key, this._getFileBaseNameFromItem(item),
							item.attachments, prefs, attachmentCallback);
					}
				}
			}
			
			itemsDoneCallback(items);
			return items;
		}.bind(this));
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
	 * @returns {Promise} resolves upon all attachments being uploaded or first failure to upload
	 * @private
	 */
	_saveAttachmentsToServer: function(itemKey, baseName, attachments, prefs, attachmentCallback=()=>0) {
		var promises = [];
		for (let attachment of attachments) {
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
			
			let deferredHeadersProcessed = Zotero.Promise.defer();
			let itemKeyPromise = deferredHeadersProcessed.promise
				.then(() => this._createAttachmentItem(itemKey, attachment));
			let deferredAttachmentData = Zotero.Promise.defer();
			
			if (attachment.snapshot === false && attachment.mimeType) {
				// If we aren't taking a snapshot and we have the MIME type, we don't need
				// to download any data
				attachment.linkMode = "linked_url";
				attachmentCallback && attachmentCallback(attachment, 0);
				deferredHeadersProcessed.resolve();
				deferredAttachmentData.resolve();
			}
			else {
				let method = (attachment.snapshot === false ? "HEAD" : "GET");
				let options = { responseType: (isSnapshot ? "document" : "arraybuffer"), timeout: 60000 };
				Zotero.HTTP.request(method, attachment.url, options).then((xhr) => {
					deferredHeadersProcessed.resolve(this._processAttachmentHeaders(attachment, xhr, baseName));
					deferredAttachmentData.resolve(xhr.response);
				}, (e) => {
					deferredHeadersProcessed.reject(e);
					deferredAttachmentData.reject(e);
				});
				if (attachmentCallback) attachmentCallback(attachment, 0);
			}
			
			let promise = Zotero.Promise.all([itemKeyPromise, deferredAttachmentData.promise]).then(function(result) {
				attachmentCallback(attachment, 50);
				// Attachment item created on zotero.org, store the key
				attachment.key = result[0];
				// Attachment downloaded, store the data
				attachment.data = result[1];
				if (attachment.linkMode !== "linked_url") {
					return this._uploadAttachmentToServer(attachment, attachmentCallback);
				}
			}.bind(this)).then(function() {
				attachmentCallback(attachment, 100);
			}).catch(function(e) {
				Zotero.logError(e);
				attachmentCallback(Object.assign({}, attachment, {parentItem: itemKey}), false, e);
				throw e;
			});
			promises.push(promise);
		}
		// This throws if at least one upload fails
		return Zotero.Promise.all(promises);
	},

	/**
	 * Creates an attachment item on the Zotero server. This assigns a "key" to the item
	 * and allows to upload the attachment data
	 *
	 * @param parentItemKey
	 * @param attachment
	 * @returns {Promise.<String>} Item key
	 * @private
	 */
	_createAttachmentItem: function(parentItemKey, attachment) {
		// deproxify url
		if (this._proxy && attachment.url) {
			attachment.url = this._proxy.toProper(attachment.url);
		}
		var item = [{
			"itemType":"attachment",
			"parentItem":parentItemKey,
			"linkMode":attachment.linkMode,
			"title":(attachment.title ? attachment.title.toString() : "Untitled Attachment"),
			"accessDate":"CURRENT_TIMESTAMP",
			"url":attachment.url,
			"note":(attachment.note ? attachment.note.toString() : ""),
			"tags":(attachment.tags && attachment.tags instanceof Array ? attachment.tags : [])
		}];
		
		return Zotero.API.createItem(item).then(function(response) {
			try {
				return JSON.parse(response);
			} catch(e) {
				throw new Error(`Unexpected response from server ${response}`);
			}
		}).then(function(response) {
			Zotero.debug(`Attachment item created for ${attachment.title}`);
			return response.success[0];
		});
	},

	/**
	 * Performs attachment header processing and throws an error upon failure.
	 *
	 * @param {Object} attachment
	 * @param {XMLHttpRequest} xhr
	 * @param {String} baseName - attachment base filename on the server
	 * @private
	 */
	_processAttachmentHeaders: function(attachment, xhr, baseName) {
		// Validate status
		if (xhr.status === 0 || attachment.snapshot === false) {
			// Failed due to SOP, or we are supposed to be getting a snapshot
			attachment.linkMode = "linked_url";
		} else if (xhr.status !== 200) {
			throw new Error(`Zotero.org returned unexpected status code ${xhr.status}`);
		} else {
			// Validate content type
			var contentType = "application/octet-stream",
				charset = null,
				contentTypeHeader = xhr.getResponseHeader("Content-Type");
			if (contentTypeHeader) {
				// See RFC 2616 sec 3.7
				var m = /^[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+\/[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+/.exec(contentTypeHeader);
				if(m) contentType = m[0].toLowerCase();
				m = /;\s*charset\s*=\s*("[^"]+"|[^\x00-\x1F\x7F()<>@,;:\\"\/\[\]?={} ]+)/.exec(contentTypeHeader);
				if (m) {
					charset = m[1];
					if(charset[0] === '"') charset = charset.substring(1, charset.length-1);
				}
				
				if (attachment.mimeType
					&& attachment.mimeType.toLowerCase() !== contentType.toLowerCase()) {
					throw new Error("Attachment MIME type "+contentType+
						" does not match specified type "+attachment.mimeType);
				}
			}
			
			attachment.mimeType = contentType;
			attachment.linkMode = "imported_url";
			switch (contentType.toLowerCase()) {
			case "application/pdf":
				attachment.filename = baseName+".pdf";
				break;
			case "text/html":
			case "application/xhtml+xml":
				attachment.filename = baseName+".html";
				break;
			default:
				attachment.filename = baseName;
			}
			if (charset) attachment.charset = charset;
		}
	},

	/**
	 * Uploads an attachment to the Zotero server
	 * @param {Object} attachment Attachment object, including
	 * @param {Function} attachmentCallback A callback that receives information about attachment
	 *     save progress. The callback will be called as attachmentCallback(attachment, false, error)
	 *     on failure or attachmentCallback(attachment, progressPercent) periodically during saving.
	 */
	"_uploadAttachmentToServer":function(attachment, attachmentCallback) {
		Zotero.debug("Uploading attachment to server");
		switch(attachment.mimeType.toLowerCase()) {
			case "text/html":
			case "application/xhtml+xml":
				// It's possible that we didn't know if this was a snapshot until after the
				// download began. If this is the case, we need to convert it to a document.
				if(attachment.data instanceof ArrayBuffer) {
					var me = this,
						blob = new Blob([attachment.data], {"type":attachment.mimeType}),
						reader = new FileReader();
					reader.onloadend = function() {
						if(reader.error) {
							attachmentCallback(attachment, false, reader.error);
						} else {
							// Convert to an HTML document
							var result = reader.result, doc;
							try {
								// First try using DOMParser
								doc = (new DOMParser()).parseFromString(result, "text/html");
							} catch(e) {}
							
							// If DOMParser fails, use document.implementation.createHTMLDocument,
							// as documented at https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
							if(!doc) {
								doc = document.implementation.createHTMLDocument("");
								var docEl = doc.documentElement;
								// AMO reviewer: This code is not run in Firefox, and the document
								// is never rendered anyway
								docEl.innerHTML = result;
								if(docEl.children.length === 1 && docEl.firstElementChild === "html") {
									doc.replaceChild(docEl.firstElementChild, docEl);
								}
							}
							
							attachment.data = doc;
							me._uploadAttachmentToServer(attachment, attachmentCallback);
						}
					}
					reader.readAsText(blob, attachment.charset || "iso-8859-1");
					return;
				}
				
				// We are now assured that attachment.data is an HTMLDocument, so we can 
				// add a base tag
				
				// Get the head tag
				var doc = attachment.data,
					head = doc.getElementsByTagName("head");
				if(!head.length) {
					head = doc.createElement("head");
					var docEl = attachment.data.documentElement;
					docEl.insertBefore(head, docEl.firstChildElement);
				} else {
					head = head[0];
				}
				
				// Add the base tag
				var base = doc.createElement("base");
				base.href = attachment.url;
				head.appendChild(base);
				
				// Remove content type tags
				var metaTags = doc.getElementsByTagName("meta"), metaTag;
				for(var i=0; i<metaTags.length; i++) {
					metaTag = metaTags[i];
					var attr = metaTag.getAttribute("http-equiv");
					if(attr && attr.toLowerCase() === "content-type") {
						metaTag.parentNode.removeChild(metaTag);
					}
				}
				
				// Add UTF-8 content type
				metaTag = doc.createElement("meta");
				metaTag.setAttribute("http-equiv", "Content-Type");
				metaTag.setAttribute("content", attachment.mimeType+"; charset=UTF-8");
				head.insertBefore(metaTag, head.firstChild);
				
				// Serialize document to UTF-8
				var src = new XMLSerializer().serializeToString(doc),
					srcLength = Zotero.Utilities.getStringByteLength(src),
					srcArray = new Uint8Array(srcLength);
				Zotero.Utilities.stringToUTF8Array(src, srcArray);
				
				// Rewrite data
				attachment.data = srcArray.buffer;
				attachment.charset = "UTF-8";
			break;
		}
		
		var binaryHash = this._md5(new Uint8Array(attachment.data), 0, attachment.data.byteLength),
			hash = "";
		for(var i=0; i<binaryHash.length; i++) {
			if(binaryHash[i] < 16) hash += "0";
			hash += binaryHash[i].toString(16);
		}
		attachment.md5 = hash;
		
		ItemSaver._attachmentCallbacks[attachment.id] = function(status, error) {
			attachmentCallback(attachment, status, error);
		};
		Zotero.API.uploadAttachment(attachment);
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
		
		if(parts.length) return parts.join(" - ");
		return "Attachment";
	},
	
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
	"_md5":(function calculateMD5Closure() {
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
};

export default ItemSaver;