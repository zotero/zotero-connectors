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

const cssDivClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 0); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 0); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 0); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 0); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 0); content: none; counter-increment: none; counter-reset: none; cursor: auto; direction: ltr; display: block; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; left: auto; letter-spacing: normal; line-height: auto; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: left; text-decoration: none; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: embed; vertical-align: baseline; visibility: visible; white-space: normal; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;';
const cssImgClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 0); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 0); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 0); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 0); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 0); content: none; counter-increment: none; counter-reset: none; cursor: auto; direction: ltr; display: inline; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; height: auto; left: auto; letter-spacing: normal; line-height: auto; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: left; text-decoration: none; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: normal; vertical-align: baseline; visibility: visible; white-space: normal; width: auto; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;';
const cssAClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 238); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 238); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 238); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 238); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 238); content: none; counter-increment: none; counter-reset: none; cursor: pointer; direction: ltr; display: inline; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; height: auto; left: auto; letter-spacing: normal; line-height: 19.2px; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: left; text-decoration: underline; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: normal; vertical-align: baseline; visibility: visible; white-space: normal; width: auto; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;'

Zotero.ProgressWindow = new function() {
	var document = Zotero.isBookmarklet ? window.parent.document : window.document;
	
	const cssBox = {"position":(Zotero.isIE && document.compatMode === "BackCompat" ? "absolute" : "fixed"),
		"right":"25px", "bottom":"25px", "width":"240px",
		"borderWidth":"1.5pt", "borderStyle":"solid", "borderColor":"#7a0000",
		"backgroundColor":"#ededed", "opacity":"0.9", "filter":"alpha(opacity = 90)",
		"zIndex":"16777269", "padding":"6px", "minHeight":"33pt"};
	const cssHeadline = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"8.25pt",
		"fontWeight":"bold", "marginBottom":"4pt"};
	const cssItem = {"fontFamily":"Lucida Grande, Tahoma, sans",
		"fontSize":"8.25pt", "verticalAlign":"middle",
		"overflow":"hidden", "whiteSpace":"nowrap", "lineHeight":"12pt", "margin":"1.5pt 0 1.5pt 0"};
	const cssIcon = {"width":"16px", "height":"16px", "verticalAlign":"middle",
		"marginRight":"4pt"};
	const cssDescription = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"8.25pt",
		"lineHeight":"1.4em"};
	var _progressDiv, _headlineDiv, _timeoutID;
	var _shownItemDivsById = {};
	
	/**
	 * Initializes and shows the progress div
	 */
	this.show = function() {
		if(_progressDiv) return;
		_progressDiv = document.createElement('div');
		_progressDiv.style.cssText = cssDivClearString;
		for(var i in cssBox) _progressDiv.style[i] = cssBox[i];
		_headlineDiv = document.createElement('div');
		_headlineDiv.style.cssText = cssDivClearString;
		for(var i in cssHeadline) _headlineDiv.style[i] = cssHeadline[i];
		_headlineDiv.appendChild(document.createTextNode(""));
		_progressDiv.appendChild(_headlineDiv);
		_progressDiv = document.body.appendChild(_progressDiv);
		
		// TODO localize
		Zotero.ProgressWindow.changeHeadline("Saving Item...");
	}
	
	/**
	 * Changes the headline of the save window
	 */
	this.changeHeadline = function(headline) {
		_headlineDiv.firstChild.nodeValue = headline;
	}
	
	/**
	 * Shows the generic scraping error message in the progress window
	 */
	this.showError = function() {
		Zotero.ProgressWindow.show();
		
		var desc = document.createElement('div');
		desc.style.cssText = cssDivClearString;
		for(var j in cssDescription) desc.style[j] = cssDescription[j];
		
		// TODO localize
		desc.appendChild(document.createTextNode("An error occurred while saving this item. Check "));
		
		var link = document.createElement('a');
		link.style.cssText = cssAClearString;
		for(var j in cssDescription) link.style[j] = cssDescription[j];
		
		link.title = link.href = "http://www.zotero.org/documentation/known_translator_issues";
		// TODO localize
		link.appendChild(document.createTextNode("Known Translator Issues"));
		
		desc.appendChild(link);
		// TODO localize
		desc.appendChild(document.createTextNode(" for more information."));
		
		_progressDiv.appendChild(desc);
	}
	
	/**
	 * Shows the generic scraping error message in the progress window
	 */
	this.showNoTranslatorError = function() {
		Zotero.ProgressWindow.show();
		
		var desc = document.createElement('div');
		desc.style.cssText = cssDivClearString;
		for(var j in cssDescription) desc.style[j] = cssDescription[j];
		
		// TODO localize
		var textNode = document.createTextNode("No items could be saved because this website "+
				"is not supported by any Zotero translator. If Zotero Standalone is not open, try "+
				"opening it to increase the number of supported sites.");
		desc.appendChild(textNode);
		_progressDiv.appendChild(desc);
	}
	
	/**
	 * Shows the Standalone not running error message
	 */
	this.showStandaloneError = function() {
		Zotero.ProgressWindow.show();
		
		var desc = document.createElement('div');
		desc.style.cssText = cssDivClearString;
		for(var j in cssDescription) desc.style[j] = cssDescription[j];
		
		// TODO localize
		desc.appendChild(document.createTextNode("This item could not be saved because Zotero "+
			"Standalone is not open or unreachable. Please open Zotero Standalone and try again."));
		
		_progressDiv.appendChild(desc);
	}
	
	/**
	 * Adds an item to progress window
	 */
	this.itemSaving = function(icon, item) {
		Zotero.ProgressWindow.show();
		
		if(_shownItemDivsById[item.id]) return;
		
		var itemDiv = document.createElement('div');
		itemDiv.style.cssText = cssDivClearString;
		for(var j in cssItem) itemDiv.style[j] = cssItem[j];
		itemDiv.style.opacity = "0.5";
		itemDiv.style.filter = "alpha(opacity = 50)";
		itemDiv.style.zoom = "1";
		
		var newImage = document.createElement('img');
		newImage.style.cssText = cssImgClearString;
		for(var j in cssIcon) newImage.style[j] = cssIcon[j];
		if(Zotero.isWebKit) {
			newImage.style.marginBottom = "2px";
		}
		newImage.src = icon;
		itemDiv.appendChild(newImage);
		
		if(Zotero.isWebKit) {
			itemDiv.style.textOverflow = "ellipsis";
			itemDiv.appendChild(document.createTextNode(item.title));
		} else {
			itemDiv.appendChild(document.createTextNode(item.title.substr(0, 35)+"..."));
		}
		
		_progressDiv.appendChild(itemDiv);
		
		_shownItemDivsById[item.id] = itemDiv;
	}
	
	/**
	 * Marks an item as saved in the progress window
	 */
	this.itemDone = function(icon, item) {
		Zotero.ProgressWindow.show();
		
		if(!_shownItemDivsById[item.id]) Zotero.ProgressWindow.itemSaving(icon, item);
		var itemDiv = _shownItemDivsById[item.id];
		itemDiv.style.opacity = "1";
		itemDiv.style.filter = "";
	}
	
	/**
	 * Starts the timer to close the progress div
	 */
	this.startCloseTimer = function(delay) {
		if(!_progressDiv) return;
		if(!delay) delay = 2500;
		if(_timeoutID) window.clearTimeout(_timeoutID);
		_timeoutID = window.setTimeout(Zotero.ProgressWindow.close, delay);
	}
	
	/**
	 * Closes the progress div
	 */
	this.close = function() {
		document.body.removeChild(_progressDiv);
		_progressDiv = undefined;
		_headlineDiv = undefined;
		if(_timeoutID) window.clearTimeout(_timeoutID);
		_timeoutID = undefined;
		_shownItemDivsById = {};
	}
}