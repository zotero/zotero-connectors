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

import TranslateWeb from "../translateWeb.js";
import ItemSaver from "../itemSaver.js";

// Used to display a different message for failing translations on pages
// with site-access limits
const SITE_ACCESS_LIMIT_TRANSLATORS = new Set([
	"57a00950-f0d1-4b41-b6ba-44ff0fc30289" // GoogleScholar
]);

function determineAttachmentIcon(attachment) {
	if(attachment.linkMode === "linked_url") {
		return Zotero.ItemTypes.getImageSrc("attachment-web-link");
	}
	var contentType = attachment.contentType || attachment.mimeType;
	return Zotero.ItemTypes.getImageSrc(
		contentType === "application/pdf" ? "attachment-pdf" : "attachment-snapshot"
	);
}

function determineAttachmentType(attachment) {
	if (attachment.linkMode === "linked_url") return Zotero.getString("itemType_link");
	var contentType = attachment.contentType || attachment.mimeType;
	if (contentType == "application/pdf") return Zotero.getString("itemType_pdf");
	if (contentType == "application/epub+zip") return Zotero.getString("itemType_epub");
	if (contentType == "text/html") return Zotero.getString("itemType_snapshot");
	return Zotero.getString("itemType_attachment");
}

/**
 * Namespace for page saving related functions injected into pages by the connector
 */
let PageSaving = {
	sessionDetails: {},
	translators: [],
	
	/**
	 * @param itemType
	 * @returns {Promise<Zotero.Translate.Web>}
	 * @private
	 */
	async _initTranslate(itemType=null) {
		let translate;
		if (Zotero.isManifestV3) {
			try {
				translate = await Zotero.VirtualOffscreenTranslate.create();
			} catch (e) {
				Zotero.logError(new Error(`Inject: Initializing translate failed at ${document.location.href}`));
				Zotero.logError(e);
				throw e;
			}
		}
		else {
			translate = new Zotero.Translate.Web();
		}
		translate.setHandler('pageModified', () => {
			Zotero.Messaging.sendMessage("pageModified", true);
		});
		// Async in MV3
		if (Zotero.isManifestV3) {
			await translate.setDocument(document, itemType === 'multiple');
		}
		else {
			translate.setDocument(document);
		}
		return translate;
	},

	/**
	 * Checks for valid page translators and notifies background page
	 * @param force
	 * @returns {Promise<void|*>}
	 */
	async onPageLoad(force) {
		if (document.location == "about:blank") return;

		// Reset session on every init so a new save is triggered after JS-based changes
		// (monitorDOMChanges/ZoteroItemUpdated)
		this.sessionDetails = {};

		// wrap this in try/catch so that errors will reach logError
		try {
			if (this.translators.length) {
				if (force) {
					this.translators = [];
				}
				else {
					return;
				}
			}

			let translate = await this._initTranslate();
			let translators = await TranslateWeb.detect({ translate });
			// We check tab content type in bg pages on browser ext, but that's not available on Safari
			if (!translators.length && Zotero.isSafari) {
				if (!isTopWindow && document.contentType == 'application/pdf') {
					return Zotero.Connector_Browser.onPDFFrame(document.location.href, instanceID);
				}
			}
			this.translators = translators;
			Zotero.Connector_Browser.onTranslators(translators, instanceID, document.contentType);
		} catch (e) {
			Zotero.logError(e);
		}
	},

	_initSession(translatorID, saveOptions) {
		if (!saveOptions.resave && this.sessionDetails.id) {
			return this.sessionDetails.id;
		}
		const sessionID = Zotero.Utilities.randomString();
		this.sessionDetails = {
			id: sessionID,
			url: document.location.href,
			translatorID,
			saveOptions
		};
		return sessionID;
	},

	_clearSession() {
		this.sessionDetails = {};
	},

	_shouldReopenProgressWindow(translatorID, options, itemType=null) {
		// We have already saved something on this page
		return this.sessionDetails.id
			// Same page (no history push)
			&& document.location.href == this.sessionDetails.url
			// Same translator
			&& translatorID == this.sessionDetails.translatorID
			// Not a multiple page
			&& itemType != 'multiple'
			// Not "Create Zotero Item and Note from Selection"
			&& !options.note
			// Not from the context menu, which always triggers a resave
			&& !options.resave
	},

	/**
	 * Handles saving when highlighting text on the page and saving via right-click
	 * option "Create Zotero Item and Note from Selection"
	 * @param items
	 */	
	_processNote(items) {
		const saveOptions = this.sessionDetails.saveOptions;
		if (saveOptions && saveOptions.note && items.length == 1) {
			if (items[0].notes) {
				items[0].notes.push({note: saveOptions.note})
			} else {
				items[0].notes = {note: saveOptions.note};
			}
		}
		return items;
	},
	
	_onAttachmentProgress(attachment, progress) {
		const sessionID = PageSaving.sessionDetails.id;
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			{
				sessionID,
				id: attachment.id,
				iconSrc: determineAttachmentIcon(attachment),
				title: attachment.title,
				parentItem: attachment.parentItem,
				progress,
				itemType: determineAttachmentType(attachment)
			}
		);
	},

	/**
	 * Runs translation and attempts to save items to Zotero or Zotero account
	 * @param translators {Array}
	 * @returns {Promise<*>}
	 */
	async translateAndSave(translators, fallbackOnFailure = false) {
		const sessionID = this.sessionDetails.id;
		let itemsTotal = 0;
		let itemsSaved = 0;
		
		// Translate handlers
		const onSelect = (obj, items, callback) => {
			// Close the progress window before displaying Select Items
			Zotero.Messaging.sendMessage("progressWindow.close", null);

			// If the handler returns a non-undefined value then it is passed
			// back to the callback due to backwards compat code in translate.js
			(async () => {
				if (Zotero.isBrowserExt) {
					var returnItems = await Zotero.Connector_Browser.onSelect(items);
				} else {
					returnItems = await Zotero.Inject.onSafariSelect(items);
				}

				// If items were selected, reopen the save popup
				if (returnItems && !Zotero.Utilities.isEmpty(returnItems)) {
					let sessionID = this.sessionDetails.id;
					// Record how many items are being saved so that progress window can know
					// when all top-level items are loaded
					itemsTotal = Object.keys(returnItems).length;
					itemsSaved = 0;
					Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
				}
				callback(returnItems);
			})();
		};
		const onItemSaving = (obj, item) => {
			itemsSaved += 1;
			// this relays an item from this tab to the top level of the window
			Zotero.Messaging.sendMessage(
				"progressWindow.itemProgress",
				{
					sessionID,
					id: item.id,
					iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
					title: item.title,
					itemsLoaded: itemsSaved >= itemsTotal ? itemsSaved : false,
					itemType: item.itemType
				}
			);
		};
		const onTranslatorFallback = (oldTranslator, newTranslator) => {
			Zotero.debug(`Saving with ${oldTranslator.label} failed. Trying ${newTranslator.label}`);
			Zotero.Messaging.sendMessage("progressWindow.error",
				['fallback', oldTranslator.label, newTranslator.label]);
		}
		
		// Item saver handlers
		const onItemsSaved = () => {
			for (let item of items) {
				// this relays an item from this frame to the top level of the window
				Zotero.Messaging.sendMessage(
					"progressWindow.itemProgress",
					{
						sessionID,
						id: item.id,
						iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
						title: item.title,
						progress: 100,
						itemsLoaded: items.length,
						itemType: item.itemType
					}
				);
				
				if (item.notes) {
					for (let note of item.notes) {
						Zotero.Messaging.sendMessage(
							'progressWindow.itemProgress',
							{
								sessionID,
								id: null,
								iconSrc: Zotero.getExtensionURL("images/treeitem-note.png"),
								title: Zotero.Utilities.cleanTags(note.note),
								parentItem: item.id,
								progress: 100,
								itemType: Zotero.getString("itemType_note")
							}
						)
					}
				}
			}
		}

		let translate = await this._initTranslate(translators[0].itemType);
		let options = { translate, translators: translators.slice(), onSelect, onItemSaving, onTranslatorFallback };
		try {
			var { items, proxy } = await TranslateWeb.translate(options);
		} catch (e) {
			if (translators[0].itemType != 'multiple' && fallbackOnFailure) {
				Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', this.translators.at(-1).label, "Save as Webpage"]);
				Zotero.debug(`Saving with ${translators[0].label} failed. Falling back to saving as webpage`);
				return this.saveAsWebpage({ snapshot: true });
			}
			throw e;
		}
		if (Zotero.isManifestV3) {
			proxy = await translate.getProxy();
			if (proxy) proxy = new Zotero.Proxy(proxy);
		}
		items = this._processNote(items);
		this.sessionDetails.items = items;
		let itemType = translators[0].itemType;
		let itemSaver = new ItemSaver({ sessionID, itemType, baseURI: document.location.href, proxy });
		this.sessionDetails.itemSaver = itemSaver;
		return itemSaver.saveItems(items, PageSaving._onAttachmentProgress, onItemsSaved)
	},

	/**
	 * Saves the website without a translator which creates a webpage item in Zotero
	 * and optionally attaches the snapshot using SingleFile
	 * @param sessionID
	 * @param title
	 * @param saveSnapshot
	 * @returns {Promise<*>}
	 */
	async saveAsWebpage({ title=document.title, snapshot: saveSnapshot=true } = {}) {
		var result = await Zotero.Inject.checkActionToServer();
		if (!result) return;

		const isOnline = await Zotero.Connector.checkIsOnline();
		const supportsAttachmentUpload = await Zotero.Connector.getPref('supportsAttachmentUpload');

		if (!document.contentType.startsWith('text') && (supportsAttachmentUpload || !isOnline)) {
			return await this._saveAsStandaloneAttachment({title, saveSnapshot});
		}
		return await this._saveAsWebpage({title, saveSnapshot});
	},
	
	async _saveAsWebpage({ title, saveSnapshot } = {}) {
		const supportsAttachmentUpload = await Zotero.Connector.getPref('supportsAttachmentUpload');
		const sessionID = this.sessionDetails.id;
		var translatorID = 'webpage' + (saveSnapshot ? 'WithSnapshot' : '');
		try {
			var cookie = document.cookie;
		} catch (e) {}
		var data = {
			sessionID,
			url: document.location.toString(),
			referrer: document.referrer,
			cookie,
			title: title,
		};
		if (!supportsAttachmentUpload) {
			data.skipSnapshot = !saveSnapshot;
			data.singleFile = true;
		}

		var image;
		if (document.contentType == 'application/pdf') {
			data.pdf = true;
			image = "attachment-pdf";
		} else {
			image = "webpage";
		}

		Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
		let items = [{
			sessionID,
			id: 1,
			iconSrc: Zotero.ItemTypes.getImageSrc(image),
			title: title
		}];
		this.sessionDetails.items = items;
		Zotero.Messaging.sendMessage("progressWindow.itemProgress", items[0]);

		try {
			var result = await Zotero.Connector.callMethodWithCookies("saveSnapshot", data);
			Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
			items[0] = { ...items[0], progress: 100, itemsLoaded: 1 };
			Zotero.Messaging.sendMessage("progressWindow.itemProgress", items[0]);

			if (saveSnapshot) {
				await this._saveSingleFile(items[0], data);
			}

			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			Object.assign(this.sessionDetails, {
				id: sessionID,
				url: document.location.href,
				translatorID
			});
			return result;
		} catch (e) {
			// Client unavailable
			if (e.status === 0) {
				let itemSaver = new ItemSaver({});
				this.sessionDetails.itemSaver = itemSaver;
				let result = await itemSaver.saveAsWebpage();
				items[0].key = result[0].key;
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...items[0], progress: 100 });
				const automaticSnapshots = await Zotero.Prefs.getAsync("automaticSnapshots")
				if (automaticSnapshots) {
					await this._saveSingleFile(items[0], data, true);
				}
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
				return;
			}
			// Unexpected error, including a timeout (which we don't want to
			// result in a save to the server, because it's possible the request
			// will still be processed)
			else if (!e.value || e.value.libraryEditable != false) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	},

	async _saveSingleFile(item, data, toServer = false) {
		let isSingleFileAvailable = document.contentType.startsWith("text");
		// Once snapshot item is created, if requested, run SingleFile
		if (isSingleFileAvailable) {
			item.attachments = [{
				sessionID: data.sessionID,
				id: 2,
				iconSrc: Zotero.ItemTypes.getImageSrc("attachment-snapshot"),
				title: "Snapshot",
				parentItem: 1,
				parentKey: item.key,
				progress: 0,
				itemType: Zotero.getString("itemType_snapshot"),
				mimeType: "text/html",
				linkMode: "imported_url",
				itemsLoaded: 1
			}]
			let snapshotItem = item.attachments[0];

			Zotero.Messaging.sendMessage("progressWindow.itemProgress", snapshotItem);

			const snapshotContent = await Zotero.SingleFile.retrievePageData();

			if (toServer) {
				snapshotItem.data = snapshotContent;
				await Zotero.ItemSaver.saveAttachmentToServer(snapshotItem);
			}
			else {
				data.snapshotContent = snapshotContent;
				await Zotero.Connector.saveSingleFile({
						method: "saveSingleFile",
						headers: {"Content-Type": "application/json"}
					},
					data
				);
			}

			Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...snapshotItem, progress: 100 });
		}
	},

	async _saveAsStandaloneAttachment({ title=document.title } = {}) {
		const sessionID = this.sessionDetails.id;
		// document.title is empty on Safari
		if (!title) {
			title = new URL(document.location.href).pathname.split('/').pop();
		}
		let itemType = "webpage";
		if (document.contentType === 'application/pdf') {
			itemType = "pdf"
		}
		else if (document.contentType === 'application/epub+zip') {
			itemType = "epub";
		}

		let progressItem = {
			sessionID,
			id: 1,
			iconSrc: Zotero.ItemTypes.getImageSrc(`attachment-${itemType}`),
			title,
			progress: 0,
			// TODO passed to ProgressWindow for accessibility messages. Needs to be updated there
			itemType: Zotero.getString(`itemType_${itemType}`),
		};

		Zotero.Messaging.sendMessage("progressWindow.show", [sessionID, null, false, true]);
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			progressItem
		);

		let standaloneAttachment = {
			url: document.location.toString(),
			mimeType: document.contentType,
			title,
			linkMode: "imported_url",
			referrer: document.referrer
		}

		try {
			await ItemSaver.fetchAttachmentSafari(standaloneAttachment);
			let { canRecognize } = await Zotero.ItemSaver.saveStandaloneAttachmentToZotero(standaloneAttachment, sessionID)
			Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
			progressItem.progress = 100;
			Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });

			if (canRecognize) {
				let item = await Zotero.Connector.callMethod("getRecognizedItem", { sessionID: sessionID });
				if (item) {
					item.id = 2;
					item.iconSrc = Zotero.ItemTypes.getImageSrc(item.itemType);
					progressItem.parentItem = 2;
					Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...item, ...{ progress: 100 } });
					setTimeout(() => {
						Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });
					}, 50);
				}
			}

			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			Object.assign(this.sessionDetails, {
				id: sessionID,
				url: document.location.href,
			});
		} catch (e) {
			// Client unavailable
			if (e.status === 0) {
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 0 } });
				await Zotero.ItemSaver.saveAttachmentToServer(standaloneAttachment);
				Zotero.Messaging.sendMessage("progressWindow.itemProgress", { ...progressItem, ...{ progress: 100 } });
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
				return;
			}
			else if (!e.value || e.value.libraryEditable != false) {
				// Unexpected error, including a timeout (which we don't want to
				// result in a save to the server, because it's possible the request
				// will still be processed)
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	},

	/**
	 * Entry point for translation initiated by clicking on the Zotero button or via the
	 * browser extension context menu by selecting a specific translator or saving
	 * with selection as a note.
	 */
	async onTranslate(translatorID, options={}) {
		let result = await Zotero.Inject.checkActionToServer();
		if (!result) return;
		let translatorIndex = this.translators.findIndex(t => t.translatorID === translatorID);
		let translator = this.translators[translatorIndex];
		Zotero.debug(`PageSaving.onTranslate: Translating with ${translator.label}, ${JSON.stringify(options)}`);
		
		// Always resave if a different translator/mode
		if (this.sessionDetails.translatorID && translatorID != this.sessionDetails.translatorID) {
			options.resave = true;
		}
		
		// In some cases, we just reopen the popup instead of saving again
		if (this._shouldReopenProgressWindow(translatorID, options, translator.itemType)) {
			Zotero.debug(`PageSaving.onTranslate: Reopening popup`);
			return Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
		}

		const sessionID = this._initSession(translatorID, options);

		// If we're likely to show the Select Items window, delay the opening of the
		// popup until we've had a chance to hide it (which happens in the 'select'
		// callback in progressWindow_inject.js).
		let delay = translator.itemType == 'multiple' ? 100 : 0;
		setTimeout(() => {
			Zotero.Messaging.sendMessage(
				"progressWindow.show",
				[
					sessionID,
					null,
					false,
				]
			);
		}, delay)
		
		try {
			let translators = this.translators.slice(translatorIndex);
			// If no fallback on failure, only provide the selected translator
			if (!options.fallbackOnFailure) {
				translators = translators.slice(0, 1)
			}
			let items = await this.translateAndSave(translators, options.fallbackOnFailure);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			return items;
		} catch (e) {
			Zotero.logError(e);
			// Clear session details on failure, so another save click tries again
			this._clearSession();
			// We delay opening the progressWindow for multiple items so we don't have to flash it
			// for the select dialog. But it comes back to bite us in the butt if a translation
			// error occurs immediately since the below command will execute before the progressWindow show,
			// and then the delayed progressWindow.show will pop up another empty progress window.
			// Cannot have that!
			await Zotero.Promise.delay(500);
			const isAccessLimitingTranslator = SITE_ACCESS_LIMIT_TRANSLATORS.has(translator.translatorID);
			const errorMessage = e.toString();
			let statusCode = '';
			try {
				statusCode = errorMessage.match(/status code ([0-9]{3})/)[1];
			} catch (e) {}
			const isHTTPErrorForbidden = statusCode == '403';
			const isHTTPErrorTooManyRequests = statusCode == '429';
			if ((isAccessLimitingTranslator && isHTTPErrorForbidden) || isHTTPErrorTooManyRequests) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'siteAccessLimits', translator.label]);
			}
			else {
				Zotero.Messaging.sendMessage("progressWindow.done", [false]);
			}
		}
	},

	/**
	 * Entry point for clicking on the Zotero button to save when no translators are available
	 */
	async onSaveAsWebpage([ title=document.title, options={} ]) {
		var result = await Zotero.Inject.checkActionToServer();
		if (!result) return;

		Zotero.debug(`PageSaving.onSaveAsWebpage: Saving webpage, ${JSON.stringify(options)}`);

		var translatorID = 'webpage' + (options.snapshot ? 'WithSnapshot' : '');
		options.snapshot = !!options.snapshot;
		// Always resave if a different translator/mode
		if (this.sessionDetails.translatorID && translatorID != this.sessionDetails.translatorID) {
			options.resave = true;
		}
		
		// In some cases, we just reopen the popup instead of saving again
		if (this._shouldReopenProgressWindow(translatorID, options)) {
			return Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
		}
		
		var sessionID = this._initSession(translatorID, options);
		return await this.saveAsWebpage({sessionID, title, snapshot: options.snapshot, resave: options.resave});
	},

	/**
	 * Updates the session with the given data.
	 * @param {Object} data - The data to update the session with.
	 * @param {String} data.targetId - The target ID
	 * @param {Boolean} data.resaveAttachments - Whether attachments should be resaved
	 * @param {Boolean} data.removeAttachments - Whether attachments should be removed
	 * @param {String[]} data.tags - A list of tags
	 * @param {String[]} data.note - A child note to add to the items
	 */
	async onUpdateSession(data) {
		// This message is received in every frame from the progress window
		// iframe due to how messaging is set up, and we need to ignore it
		// on all but the frame that has sessionDetails.id - is translating.
		if (!this.sessionDetails.id) return;
		await Zotero.Connector.callMethod(
			"updateSession",
			{
				sessionID: this.sessionDetails.id,
				target: data.target,
				tags: data.tags,
				note: data.note
			}
		);

		if (data.resaveAttachments && this.sessionDetails.itemSaver) {
			Zotero.Messaging.sendMessage("progressWindow.show", [this.sessionDetails.id]);
			await this.sessionDetails.itemSaver.saveAttachmentsToZotero(
				PageSaving._onAttachmentProgress
			);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
		}
		else if (data.removeAttachments) {
			for (let item of this.sessionDetails.items) {
				for (let attachment of item.attachments) {
					Zotero.Messaging.sendMessage(
						"progressWindow.itemProgress",
						{
							sessionID: this.sessionDetails.id,
							id: attachment.id,
							progress: -1,
						}
					);
				}
			}
		}
	}
}

export default PageSaving
