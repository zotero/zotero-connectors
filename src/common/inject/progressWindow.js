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

const cssDivClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 0); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 0); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 0); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 0); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 0); content: none; counter-increment: none; counter-reset: none; cursor: auto; direction: ltr; display: block; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; left: auto; letter-spacing: normal; line-height: normal; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: left; text-decoration: none; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: embed; vertical-align: baseline; visibility: visible; white-space: normal; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;';
const cssAClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 238); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 238); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 238); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 238); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 238); content: none; counter-increment: none; counter-reset: none; cursor: pointer; direction: ltr; display: inline; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; height: auto; left: auto; letter-spacing: normal; line-height: normal; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: left; text-decoration: underline; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: normal; vertical-align: baseline; visibility: visible; white-space: normal; width: auto; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;'

Zotero.ProgressWindow = new function() {
	const cssBox = {"position":(Zotero.isIE && document.compatMode === "BackCompat" ? "absolute" : "fixed"),
		"right":"25px", "bottom":"25px", "width":"240px",
		"borderWidth":"2px", "borderStyle":"solid", "borderColor":"#7a0000",
		"backgroundColor":"#ededed", "opacity":"0.9", "filter":"alpha(opacity = 90)",
		"zIndex":"16777268", "padding":"6px 6px 6px 6px", "minHeight":"40px"};
	const cssHeadline = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"11px",
		"fontWeight":"bold", "marginBottom":"6px", "overflow":"hidden",
		"whiteSpace":"nowrap", "textOverflow":"ellipsis"};
	const cssHeadlineIcon = {"display":"none", "width":"16px", "height":"16px",
		"backgroundPosition":"center", "backgroundRepeat":"no-repeat",
		"verticalAlign":"-3px"};
	const cssItem = {"fontSize":"11px", "margin":"4px 0 4px 0"};
	const cssIcon = {"position":"absolute", "fontSize":"11px", "width":"16px", "height":"16px",
		"backgroundSize":"contain", "backgroundPosition":"0", "backgroundRepeat":"no-repeat"};
	const cssItemText = {"fontFamily":"Lucida Grande, Tahoma, sans",
		"fontSize":"11px", "verticalAlign":"middle", "overflow":"hidden",
		"whiteSpace":"nowrap", "lineHeight":"16px", "margin":"0 0 0 20px"};
	const cssDescription = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"11px",
		"lineHeight":"1.4em", "marginBottom":"4px"};
		
	if(Zotero.isBookmarklet) {
		var imageBase = ZOTERO_CONFIG.BOOKMARKLET_URL+"images/";
	} else if(Zotero.isBrowserExt) {
		var imageBase =  chrome.extension.getURL("images/");
	} else if(Zotero.isSafari) {
		var imageBase = safari.extension.baseURI+"images/";
	}
	const nArcs = 20;
	
	var win = Zotero.isBookmarklet ? window.parent : window,
		doc = Zotero.isBookmarklet ? window.parent.document : window.document,
		container, timeoutID,
		headlineDiv, headlinePreImageTextNode, headlinePostImageTextNode, headlineImage;
	
	/**
	 * Creates a new object representing a line in the progressWindow.
	 */
	this.ItemProgress = function(iconSrc, title, parentItemProgress) {
		Zotero.ProgressWindow.show();
		
		this._div = doc.createElement('div');
		this._div.className = "zotero-item-progress";
		this._div.style.cssText = cssDivClearString;
		for(var j in cssItem) this._div.style[j] = cssItem[j];
		this._div.style.opacity = "0.5";
		this._div.style.filter = "alpha(opacity = 50)";
		this._div.style.zoom = "1";
		if(parentItemProgress) this._div.style.marginLeft = "12px";
		
		this._image = doc.createElement('div');
		this._image.style.cssText = cssDivClearString;
		for(var j in cssIcon) this._image.style[j] = cssIcon[j];
		if(parentItemProgress) {
			this._div.zoteroIsChildItem = true;
			this._image.style.left = "18px";
		} else {
			this._image.style.left = "6px";
		}
		this.setIcon(iconSrc);
		this._div.appendChild(this._image);
		
		this._itemText = doc.createElement('div');
		this._itemText.style.cssText = cssDivClearString;
		for(var j in cssItemText) this._itemText.style[j] = cssItemText[j];
		if(Zotero.isIE) {
			this._itemText.appendChild(doc.createTextNode(title.substr(0, (parentItemProgress ? 30 : 35))+"\u2026"));
		} else {
			this._itemText.style.textOverflow = "ellipsis";
			this._itemText.appendChild(doc.createTextNode(title));
		}
		this._div.appendChild(this._itemText);
		
		if(parentItemProgress) {
			var nextItem = parentItemProgress._div.nextSibling;
			while(nextItem && nextItem.zoteroIsChildItem) {
				nextItem = nextItem.nextSibling;
			}
			container.insertBefore(this._div, nextItem);
		} else {
			container.appendChild(this._div);
		}
	};
	
	/**
	 * Sets the current save progress for this item.
	 * @param {Integer} percent A percentage from 0 to 100.
	 */
	this.ItemProgress.prototype.setProgress = function(percent) {
		if(percent != 0 && percent != 100) {
			// Indication of partial progress, so we will use the circular indicator
			this._image.style.backgroundImage = "url('"+imageBase+"progress_arcs.png')";
			this._image.style.backgroundPosition = "-"+(Math.round(percent/100*nArcs)*16)+"px 0";
			this._image.style.backgroundSize = "auto";
			this._div.style.opacity = percent/200+.5;
			this._div.style.filter = "alpha(opacity = "+(percent/2+50)+")";
		} else if(percent == 100) {
			this._image.style.backgroundImage = "url('"+this._iconSrc+"')";
			this._image.style.backgroundPosition = "";
			this._image.style.backgroundSize = "contain";
			this._div.style.opacity = "1";
			this._div.style.filter = "";
		}
	};
	
	/**
	 * Sets the icon for this item.
	 */
	this.ItemProgress.prototype.setIcon = function(iconSrc) {
		this._image.style.backgroundImage = "url('"+iconSrc+"')";
		this._image.style.backgroundPosition = "";
		this._iconSrc = iconSrc;
	};
	
	/**
	 * Indicates that an error occurred saving this item.
	 */
	this.ItemProgress.prototype.setError = function() {
		this._image.style.backgroundImage = "url('"+imageBase+"cross.png')";
		this._image.style.backgroundPosition = "";
		this._itemText.style.color = "red";
		this._div.style.opacity = "1";
		this._div.style.filter = "";
	};
	
	this.ErrorMessage = function(err) {
		Zotero.ProgressWindow.show();
		
		this._div = doc.createElement('div');
		this._div.style.cssText = cssDivClearString;
		for(var j in cssDescription) this._div.style[j] = cssDescription[j];
		
		var link = doc.createElement('a');
		link.style.cssText = cssAClearString;
		for(var j in cssDescription) link.style[j] = cssDescription[j];
		
		if (err === "translationError") {
			this._div.appendChild(doc.createTextNode("An error occurred while saving this item. See "));
			
			link.title = link.href = "https://www.zotero.org/support/troubleshooting_translator_issues";
			link.appendChild(doc.createTextNode("Troubleshooting Translator Issues"));
			
			this._div.appendChild(link);
			this._div.appendChild(doc.createTextNode(" for more information."));
		} else if (err === "noTranslator") {
			var textNode = doc.createTextNode("No items could be saved because this website "+
					"is not supported by any Zotero translator. If Zotero is not open, try "+
					"opening it to increase the number of supported sites.");
			this._div.appendChild(textNode);
		} else if (err === "collectionNotEditable") {
			this._div.appendChild(doc.createTextNode("The currently selected collection is not editable. "+
				"Please select a different collection in Zotero."));
		} else if (err === "clientRequired") {
			this._div.appendChild(doc.createTextNode("This item could not be saved because Zotero "+
				"is not open or is unreachable. Please open Zotero and try again."));
		} else if (err === "upgradeClient") {
			this._div.appendChild(doc.createTextNode("This feature is not supported by your version of " +
				"Zotero. Please upgrade to the "));
			link.title = link.href = ZOTERO_CONFIG.CLIENT_DOWNLOAD_URL;
			link.appendChild(doc.createTextNode("latest version"));

			this._div.appendChild(link);
			this._div.appendChild(doc.createTextNode("."));
		} else if (err === 'unexpectedError') {
			this._div.appendChild(doc.createTextNode("An error occurred while saving this item. Try again, " +
				"and if the issue persists see "));
			
			link.title = link.href = "https://www.zotero.org/support/getting_help";
			link.appendChild(doc.createTextNode("Getting Help"));
			
			this._div.appendChild(link);
			this._div.appendChild(doc.createTextNode(" for more information."));	
		}
		
		container.appendChild(this._div);
	};
	
	/**
	 * Initializes and shows the progress div
	 */
	this.show = function() {
		if (container) return;
		container = doc.createElement('div');
		container.id = 'zotero-progress-window';
		container.style.cssText = cssDivClearString;
		for(var i in cssBox) container.style[i] = cssBox[i];
		
		headlineDiv = doc.createElement('div');
		headlineDiv.style.cssText = cssDivClearString;
		for(var i in cssHeadline) headlineDiv.style[i] = cssHeadline[i];
		
		headlinePreImageTextNode = doc.createTextNode("Saving Item");
		headlineDiv.appendChild(headlinePreImageTextNode);
		
		headlineImage = doc.createElement("div");
		headlineImage.style.cssText = cssDivClearString;
		for(var j in cssHeadlineIcon) headlineImage.style[j] = cssHeadlineIcon[j];
		headlineDiv.appendChild(headlineImage);
		
		headlinePostImageTextNode = doc.createTextNode("\u2026");
		headlineDiv.appendChild(headlinePostImageTextNode);
		
		container.appendChild(headlineDiv);
		doc.body.appendChild(container);
	}
	
	/**
	 * Changes the headline of the save window
	 */
	this.changeHeadline = function(text, icon, postText) {
		headlinePreImageTextNode.nodeValue = text;
		if(icon) {
			headlineImage.style.display = "inline-block";
			headlineImage.style.backgroundImage = "url('"+imageBase+icon+"')";
		} else {
			headlineImage.style.display = "none";
		}
		if(postText !== undefined) {
			headlinePostImageTextNode.nodeValue = " "+postText;
		}
	}
	
	/**
	 * Starts the timer to close the progress div
	 */
	this.startCloseTimer = function(delay) {
		if(!container) return;
		if(!delay) delay = 2500;
		if(timeoutID) win.clearTimeout(timeoutID);
		timeoutID = win.setTimeout(() => Zotero.ProgressWindow.close(), delay);
	}
	
	/**
	 * Closes the progress div
	 */
	this.close = function() {
		if(!container) return;
		doc.body.removeChild(container);
		container = void(0);
		if(timeoutID) win.clearTimeout(timeoutID);
		timeoutID = void(0);
	}
}