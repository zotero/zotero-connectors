/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
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

var cssBookmarkletFrameDimmer = {"background":"black", "opacity":"0.5", "position":"fixed",
	"top":"0px", "bottom":"0px", "left":"0px", "right":"0px", "zIndex":"16777270",
	"height":"100%", "width":"100%", "filter":"alpha(opacity = 50);"};
var cssBookmarkletFrame = {"position":"fixed", "zIndex":"16777271", "top":"50%",
	"left":"50%", "background":"white"};

Zotero.initInject();
Zotero.Connector_Types.init();

var sessionID;

/**
 * Creates a new frame with the specified width and height
 * @constructor
 */
var BookmarkletFrame = function(url, width, height) {
	var parentWin = window.parent,
		parentDoc = parentWin.document;
	
	this._appendFrameTo = (document.body ? document.body : document.documentElement);
	this._appendDimmerTo = (parentDoc.body ? parentDoc.body : parentDoc.documentElement);
	
	// Make sure iframe is not bigger than window
	var windowWidth, windowHeight;
	if(parentWin.innerWidth) {
		windowWidth = parentWin.innerWidth;
		windowHeight = parentWin.innerHeight;
	} else if(parentDoc.documentElement.offsetWidth) {
		windowWidth = parentDoc.documentElement.offsetWidth;
		windowHeight = parentDoc.documentElement.offsetHeight;
	} else if(parentDoc.body && parentDoc.body.offsetWidth) {
		windowWidth = parentDoc.body.offsetWidth;
		windowHeight = parentDoc.body.offsetHeight;
	} else {
		windowWidth = windowHeight = Infinity;
	}
	
	// Add width and height
	height = Math.min(windowHeight-10, height);
	width = Math.min(windowWidth-10, width);
	
	this._dimmer = parentDoc.createElement("div");
	for(var i in cssBookmarkletFrameDimmer) this._dimmer.style[i] = cssBookmarkletFrameDimmer[i];
	this._appendDimmerTo.appendChild(this._dimmer);
	
	// Add iframe
	if(url) {
		this._frame = document.createElement("iframe");
		this._frame.src = url;
	} else {
		this._frame = zoteroIFrame;
		zoteroIFrame.style.display = "block";
	}
	this._frame.style.position = "absolute";
	this._frame.style.top = "0px";
	this._frame.style.left = "0px";
	this._frame.style.width = "100%";
	this._frame.style.height = "100%";
	this._frame.style.borderStyle = "none";
	this._frame.setAttribute("frameborder", "0");
	
	var frameElementStyle = window.frameElement.style;
	for(var i in cssBookmarkletFrame) frameElementStyle[i] = cssBookmarkletFrame[i];
	frameElementStyle.display = "block";
	frameElementStyle.margin = "-"+height/2+"px 0 0 -"+width/2+"px";
	frameElementStyle.width = width+"px";
	frameElementStyle.height = height+"px";
	if(url) this._appendFrameTo.appendChild(this._frame);
}

/**
 * Removes the frame
 */
BookmarkletFrame.prototype.remove = function() {
	this._appendDimmerTo.removeChild(this._dimmer);
	if(this._frame == zoteroIFrame) {
		zoteroIFrame.style.display = "none";
	} else {
		this._appendFrameTo.removeChild(this._frame);
	}
	window.frameElement.style.display = "none";
}
	
function determineAttachmentIcon(attachment) {
	if(attachment.linkMode === "linked_url") {
		return Zotero.ItemTypes.getImageSrc("attachment-web-link");
	}
	var contentType = attachment.contentType || attachment.mimeType;
	return Zotero.ItemTypes.getImageSrc(
		contentType === "application/pdf" ? "attachment-pdf" : "attachment-snapshot"
	);
}

var translate = new Zotero.Translate.Web(),
	selectCallback, cancelled, haveItem, attachmentsSaving;
translate.setDocument(window.parent.document);
translate.setHandler("select", function(obj, items, callback) {
	// If the handler returns a non-undefined value then it is passed
	// back to the callback due to backwards compat code in translate.js
	(async function() {
		// Close the progress window before displaying Select Items
		Zotero.Messaging.sendMessage("progressWindow.close", null);
			
		// If the handler returns a non-undefined value then it is passed
		// back to the callback due to backwards compat code in translate.js
		try {
			let response = await Zotero.Connector.callMethod("getSelectedCollection", {});
			if (response.libraryEditable === false) {
				return callback([]);
			}
		} catch (e) {
			// Zotero is online but an error occured anyway, so let's log it and display
			// the dialog just in case
			if (e.status != 0) {
				Zotero.logError(e);
			}
		}
		
		var frame = new BookmarkletFrame(ZOTERO_CONFIG.BOOKMARKLET_URL+"itemSelector/itemSelector.html#"
			+encodeURIComponent(JSON.stringify([null, items])), 600, 350);
		
		let deferred = Zotero.Promise.defer();
		selectCallback = deferred.resolve;
		let returnItems = await deferred.promise;
		frame.remove();

		// If items were selected, reopen the save popup
		if (returnItems && !Zotero.Utilities.isEmpty(returnItems)) {
			Zotero.Messaging.sendMessage("progressWindow.show", [sessionID]);
		}
		
		callback(returnItems);
	})();
});
translate.setHandler("itemSaving", function(obj, item) {
	Zotero.Messaging.sendMessage(
		"progressWindow.itemProgress",
		{
			sessionID,
			id: item.id,
			iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
			title: item.title
		}
	);
});
translate.setHandler("itemDone", function(obj, dbItem, item) {
	Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
	// this relays an item from this tab to the top level of the window
	Zotero.Messaging.sendMessage(
		"progressWindow.itemProgress",
		{
			sessionID,
			id: item.id,
			iconSrc: Zotero.ItemTypes.getImageSrc(item.itemType),
			title: item.title,
			progress: 100
		}
	);
	for(var i=0; i<item.attachments.length; i++) {
		var attachment = item.attachments[i];
		if (!attachment.id) continue;
		Zotero.Messaging.sendMessage(
			"progressWindow.itemProgress",
			{
				sessionID,
				id: attachment.id,
				iconSrc: determineAttachmentIcon(attachment),
				title: attachment.title,
				parentItem: item.id
			}
		);
	}

	if (item.notes) {
		let _noteImgSrc = ZOTERO_CONFIG.BOOKMARKLET_URL+"images/treeitem-note.png";
		for (let note of item.notes) {
			Zotero.Messaging.sendMessage(
				'progressWindow.itemProgress',
				{
					sessionID,
					id: null,
					iconSrc: _noteImgSrc,
					title: Zotero.Utilities.cleanTags(note.note),
					parentItem: item.id,
					progress: 100
				}
			)
		}
	}
});
translate.setHandler("attachmentProgress", function(obj, attachment, progress) {
	Zotero.Messaging.sendMessage(
		"progressWindow.itemProgress",
		{
			sessionID,
			id: attachment.id,
			iconSrc: determineAttachmentIcon(attachment),
			title: attachment.title,
			parentItem: attachment.parentItem,
			progress
		}
	);
});

async function doTranslate(data, event) {
	sessionID = data;
	Zotero.Messaging.sendMessage('progressWindow.show', [sessionID, "Looking for Translators…"]);
	await Zotero.progressWindowReady;
	if(event.origin.substr(0, 6) === "https:" && ZOTERO_CONFIG.BOOKMARKLET_URL.substr(0, 5) === "http:") {
		ZOTERO_CONFIG.BOOKMARKLET_URL = "https:"+ZOTERO_CONFIG.BOOKMARKLET_URL.substr(5);
	}
	
	let translatorIDs = new Set();
	let translators = await translate.getTranslators();
	// Remove duplicate translators (returned from RPC vs native)
	translators = translators.filter(translator => {
		let keep = !translatorIDs.has(translator.translatorID);
		translatorIDs.add(translator.translatorID);
		return keep;
	});
	selectCallback = cancelled = haveItem = null;
	
	while (translators && translators.length) {
		var translator = translators.shift();
		if (translator.runMode === Zotero.Translator.RUN_MODE_IN_BROWSER) {
			Zotero.Messaging.sendMessage('progressWindow.show', [sessionID]);
		} else if (translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_SERVER) {
			Zotero.Messaging.sendMessage('progressWindow.show', [sessionID, "Saving to zotero.org…", true]);
		} else {
			Zotero.Messaging.sendMessage('progressWindow.show', [sessionID, "Saving to Zotero…"]);
		}
		translate.setTranslator(translator);	
		
		try {
			await translate.translate({ sessionID });
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			cleanup();
			return;
		} catch (e) {
			if (translator.itemType != "multiple") {
				if (translators.length) {
					sessionID = Zotero.Utilities.randomString();
					Zotero.Messaging.sendMessage("progressWindow.setSession", sessionID);
					Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', translator.label, translators[0].label]);
				}
				else {
					Zotero.logError(e);
					try {
						sessionID = Zotero.Utilities.randomString();
						Zotero.Messaging.sendMessage("progressWindow.setSession", sessionID);
						Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', translator.label, "Save as Webpage"]);
						await saveAsWebpage();
					} catch (e) {
						Zotero.Messaging.sendMessage("progressWindow.error", ["unexpectedError"])
					}
					return cleanup();
				}
			} else {
				Zotero.Messaging.sendMessage("progressWindow.done", [false]);
				return cleanup();
			}
		}
	}
	
	await saveAsWebpage();
	cleanup();
}

async function saveAsWebpage() {
	var doc = window.parent.document;
	var title = doc.title;
	var image;

	var data = {
		sessionID,
		url: doc.location.toString(),
		cookie: doc.cookie,
		html: doc.documentElement.innerHTML,
	};
	
	if (doc.contentType == 'application/pdf') {
		data.pdf = true;
		image = "attachment-pdf";
	} else {
		image = "webpage";
	}

	Zotero.Messaging.sendMessage('progressWindow.show', [sessionID]);

	Zotero.Messaging.sendMessage(
		"progressWindow.itemProgress",
		{
			sessionID,
			id: title,
			iconSrc: Zotero.ItemTypes.getImageSrc(image),
			title: title
		}
	);
	var clientAvailable = await Zotero.Connector.checkIsOnline();
	if (clientAvailable) {
		try {
			result = await Zotero.Connector.callMethodWithCookies("saveSnapshot", data);
			Zotero.Messaging.sendMessage("progressWindow.sessionCreated", { sessionID });
			Zotero.Messaging.sendMessage(
				"progressWindow.itemProgress",
				{
					sessionID,
					id: title,
					iconSrc: Zotero.ItemTypes.getImageSrc(image),
					title,
					parentItem: false,
					progress: 100
				}
			);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			return result;
		} catch (e) {
			// Unexpected error, including a timeout (which we don't want to
			// result in a save to the server, because it's possible the request
			// will still be processed)
			if (!e.value || e.value.libraryEditable != false) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	} else {
		// Attempt saving to server if not pdf
		if (doc.contentType != 'application/pdf') {
			let itemSaver = new Zotero.Translate.ItemSaver({});
			let items = await itemSaver.saveAsWebpage(doc);
			if (items.length) {
				Zotero.Messaging.sendMessage(
					"progressWindow.itemProgress",
					{
						id: title,
						iconSrc: Zotero.ItemTypes.getImageSrc(image),
						title,
						parentItem: false,
						progress: 100
					}
				);
			}
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			return;
		} else {
			Zotero.Messaging.sendMessage("progressWindow.done", [false, 'clientRequired']);
		}
	}
}

// Add message listener for translate, so we don't call until the iframe is loaded
Zotero.Messaging.addMessageListener("translate", doTranslate);
Zotero.Messaging.addMessageListener("selectDone", function(returnItems) {
	// if no items selected, close save dialog immediately
	if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
		cancelled = true;
		Zotero.Messaging.sendMessage('progressWindow.close', null);
	}
	selectCallback(returnItems);
});

// We use these for OAuth, so that we can load the OAuth pages in a child frame of the privileged
// iframe
var revealedFrame;
Zotero.Messaging.addMessageListener("revealZoteroIFrame", function() {
	if(revealedFrame) return;
	revealedFrame = new BookmarkletFrame(null, 800, 400);
});
Zotero.Messaging.addMessageListener("hideZoteroIFrame", function() {
	revealedFrame.remove();
});

window.zoteroIFrame = null;

/**
 * Load privileged iframe and begin translation
 */
function startTranslation() {
	zoteroIFrame = document.createElement("iframe");
	zoteroIFrame.id = "zotero-privileged-iframe";
	zoteroIFrame.src = ZOTERO_CONFIG.BOOKMARKLET_URL+"iframe.html";
	zoteroIFrame.style.display = "none";
	document.body.appendChild(zoteroIFrame);
	document.body.style.overflow = "hidden";
}

/**
 * Remove the frames
 */
async function cleanup() {
	await new Promise(function(resolve) {
		window.top.addEventListener('message', function progressWindowClose(event) {
			var [name, data] = event.data || [];
			if (name == 'progressWindowIframe.close') {
				resolve();
			}
			window.top.removeEventListener('message', progressWindowClose);
		});
	});
	zoteroIFrame.parentNode.removeChild(zoteroIFrame);
	window.frameElement.parentNode.removeChild(window.frameElement);
}

if(document.readyState && document.readyState !== "interactive" && document.readyState !== "complete") {
	window.onload = startTranslation;
} else {
	startTranslation();
}
