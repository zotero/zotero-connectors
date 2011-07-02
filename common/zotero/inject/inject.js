/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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

/**
 * Only register progress window code in top window
 */
var isTopWindow = false;
try {
	isTopWindow = window.top == window;
} catch(e) {};

if(isTopWindow) {
	Zotero.ProgressWindow = new function() {
		const cssDivClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 0); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 0); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 0); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 0); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 0); content: none; counter-increment: none; counter-reset: none; cursor: auto; direction: ltr; display: block; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; left: auto; letter-spacing: normal; line-height: auto; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: start; text-decoration: none; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: embed; vertical-align: baseline; visibility: visible; white-space: normal; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;';
		const cssImgClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 0); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 0); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 0); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 0); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 0); content: none; counter-increment: none; counter-reset: none; cursor: auto; direction: ltr; display: inline; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; height: auto; left: auto; letter-spacing: normal; line-height: auto; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: start; text-decoration: none; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: normal; vertical-align: baseline; visibility: visible; white-space: normal; width: auto; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;';
		const cssAClearString = 'background-attachment: scroll; background-color: transparent; background-image: none; background-position: 0% 0%; background-repeat: repeat; border-bottom-color: rgb(0, 0, 238); border-bottom-style: none; border-bottom-width: 0px; border-collapse: separate; border-left-color: rgb(0, 0, 238); border-left-style: none; border-left-width: 0px; border-right-color: rgb(0, 0, 238); border-right-style: none; border-right-width: 0px; border-spacing: 0px 0px; border-top-color: rgb(0, 0, 238); border-top-style: none; border-top-width: 0px; bottom: auto; caption-side: top; clear: none; clip: auto; color: rgb(0, 0, 238); content: none; counter-increment: none; counter-reset: none; cursor: pointer; direction: ltr; display: inline; empty-cells: show; float: none; font-family: serif; font-size: 16px; font-size-adjust: none; font-stretch: normal; font-style: normal; font-variant: normal; font-weight: 400; height: auto; left: auto; letter-spacing: normal; line-height: 19.2px; list-style-image: none; list-style-position: outside; list-style-type: disc; margin-bottom: 0px; margin-left: 0px; margin-right: 0px; margin-top: 0px; marker-offset: auto; max-height: none; max-width: none; min-height: 0px; min-width: 0px; ime-mode: auto; opacity: 1; outline-color: rgb(0, 0, 0); outline-style: none; outline-width: 0px; outline-offset: 0px; overflow: visible; overflow-x: visible; overflow-y: visible; padding-bottom: 0px; padding-left: 0px; padding-right: 0px; padding-top: 0px; page-break-after: auto; page-break-before: auto; pointer-events: auto; position: static; quotes: "“" "”" "‘" "’"; right: auto; table-layout: auto; text-align: start; text-decoration: underline; text-indent: 0px; text-shadow: none; text-transform: none; top: auto; unicode-bidi: normal; vertical-align: baseline; visibility: visible; white-space: normal; width: auto; word-spacing: 0px; z-index: auto; background-clip: border-box; background-origin: padding-box; background-size: auto auto; border-bottom-left-radius: 0px; border-bottom-right-radius: 0px; border-top-left-radius: 0px; border-top-right-radius: 0px; box-shadow: none; resize: none; word-wrap: normal; clip-path: none; clip-rule: nonzero; color-interpolation: srgb; color-interpolation-filters: linearrgb; dominant-baseline: auto; fill: rgb(0, 0, 0); fill-opacity: 1; fill-rule: nonzero; filter: none; flood-color: rgb(0, 0, 0); flood-opacity: 1; lighting-color: rgb(255, 255, 255); image-rendering: auto; mask: none; marker-end: none; marker-mid: none; marker-start: none; shape-rendering: auto; stop-color: rgb(0, 0, 0); stop-opacity: 1; stroke: none; stroke-dasharray: none; stroke-dashoffset: 0px; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 4; stroke-opacity: 1; stroke-width: 1px; text-anchor: start; text-rendering: auto;'
		const cssBox = {"position":"fixed", "right":"25px", "bottom":"25px", "width":"240px",
			"borderWidth":"2px", "borderStyle":"solid", "borderColor":"#7a0000",
			"backgroundColor":"#ededed", "opacity":"0.9", "z-index":"9999999999999999999999999999",
			"padding":"6px", "minHeight":"45px"};
		const cssHeadline = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"11px",
			"fontWeight":"bold", "marginBottom":"8px"};
		const cssItem = {"marginBottom":"4px"};
		const cssIcon = {"width":"16px", "height":"16px", "marginRight":"4px", "float":"left"};
		const cssLabel = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"11px",
			"verticalAlign":"middle", "textOverflow":"ellipsis", "height":"16px",
			"overflow":"hidden", "whiteSpace":"nowrap", "lineHeight":"16px"};
		const cssDescription = {"fontFamily":"Lucida Grande, Tahoma, sans", "fontSize":"11px"};
		var _progressDiv, _headlineDiv, _timeoutID;
		
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
			_progressDiv.appendChild(_headlineDiv);
			_progressDiv = document.body.appendChild(_progressDiv);
		}
		
		/**
		 * Changes the headline of the save window
		 */
		this.changeHeadline = function(headline) {
			_headlineDiv.textContent = headline;
		}
		
		/**
		 * Shows the scraping error message in the progress window
		 */
		this.showError = function() {
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
		 * Adds lines to progress window
		 */
		this.addLines = function(label, icon) {
			for(var i in label) {
				var item = document.createElement('div');
				item.style.cssText = cssDivClearString;
				for(var j in cssItem) item.style[j] = cssItem[j];
				
				var newImage = document.createElement('img');
				newImage.style.cssText = cssImgClearString;
				for(var j in cssIcon) newImage.style[j] = cssIcon[j];
				newImage.src = icon[i];
				
				var textDiv = document.createElement('div');
				textDiv.style.cssText = cssDivClearString;
				for(var j in cssLabel) textDiv.style[j] = cssLabel[j];
				textDiv.appendChild(document.createTextNode(label[i]));
				
				item.appendChild(newImage);
				item.appendChild(textDiv)
				_progressDiv.appendChild(item);
			}
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
		}
	}
	
	
	/*
	 * Register save dialog listeners
	 *
	 * When an item is saved (by this page or by an iframe), the item will be relayed back to 
	 * the background script and then to this handler, which will show the saving dialog
	 */
	Zotero.Messaging.addMessageListener("saveDialog_show", function() {
		Zotero.ProgressWindow.show();
		// TODO localize
		Zotero.ProgressWindow.changeHeadline("Saving Item...");
	});
	Zotero.Messaging.addMessageListener("saveDialog_itemDone", function(item) {
		Zotero.ProgressWindow.show();
		Zotero.ProgressWindow.addLines([item.title], [Zotero.ItemTypes.getImageSrc(item.itemType)]);
		Zotero.ProgressWindow.startCloseTimer();
	});
	Zotero.Messaging.addMessageListener("saveDialog_close", function() {
		Zotero.ProgressWindow.close();
	});
	Zotero.Messaging.addMessageListener("saveDialog_error", function() {
		Zotero.ProgressWindow.show();
		Zotero.ProgressWindow.showError();
		Zotero.ProgressWindow.startCloseTimer(8000);
	});
}

/**
 * @namespace
 */
var instanceID = (new Date()).getTime();
Zotero.Inject = new function() {
	var _translate;
	var _detectionsRunning = 0;
	this.translators = [];
	
	/**
	 * Translates this page. First, retrieves schema and preferences from global script, then
	 * passes them off to _haveSchemaAndPrefs
	 */
	this.translate = function(translator) {
		// this relays an item from this tab to the top level of the window
		Zotero.Connector_Types.getSchema(function(schema) {
			Zotero.Messaging.sendMessage("saveDialog_show", null);
			Zotero.Connector_Types.schema = schema;
			Zotero.Connector_Types.init();
			_translate.setTranslator(translator);
			_translate.translate();
		});
	};
	
	/**
	 * Initializes the translate machinery and determines whether this page can be translated
	 */
	this.detect = function() {	
		// On OAuth completion, close window and call completion listener
		if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH_CALLBACK_URL+"?") {
			Zotero.OAuth.onAuthorizationComplete(document.location.href.substr(ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1));
			return;
		}
		
		// wrap this in try/catch so that errors will reach logError
		try {
			if(this.translators.length) return;
			if(document.location == "about:blank") return;
			
			var me = this;
			var cancelled = false;
			_translate = new Zotero.Translate.Web();
			_translate.setDocument(document);
			_translate.setHandler("translators", function(obj, translators) {
				_detectionsRunning--;
				if(_detectionsRunning === 0 || (translators.length && !me.translators.length)) {
					me.translators = translators;
					Zotero.Connector_Browser.onTranslators(translators, instanceID);
				}
			});
			_translate.setHandler("select", function(obj, items, callback) {
				Zotero.Connector_Browser.onSelect(items, function(returnItems) {
					// if no items selected, close save dialog immediately
					if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
						cancelled = true;
						Zotero.Messaging.sendMessage("saveDialog_close", null);
					}
					callback(returnItems);
				});
			});
			_translate.setHandler("itemDone", function(obj, dbItem, item) {
				// this relays an item from this tab to the top level of the window
				Zotero.Messaging.sendMessage("saveDialog_itemDone", item);
			});
			_translate.setHandler("done", function(obj, status) {
				if(!status || (!_translate.newItems.length && !cancelled)) {
					Zotero.Messaging.sendMessage("saveDialog_error", status);
				}
			});
			_translate.getTranslators();
		} catch(e) {
			Zotero.logError(e);
		}
	};
};

// add listener for translate message from extension
Zotero.Messaging.addMessageListener("translate", function(data) {
	if(data[0] !== instanceID) return;
	Zotero.Inject.translate(data[1]);
});
// initialize
Zotero.initInject();

/**
 * Send page load event to clear current save icon (but only in Safari, since in Chrome the page
 * action is automatically invalidated when the page changes, so we don't need this message)
 */
if(isTopWindow && Zotero.isSafari) Zotero.Connector_Browser.onPageLoad();

// wait until load is finished, then run detection
if(document.readyState == "loading") {
	document.addEventListener("load", function() { Zotero.Inject.detect() }, false);
} else {
	Zotero.Inject.detect();
}