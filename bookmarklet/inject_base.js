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

const cssItemSelectorDiv = {"background":"black", "opacity":"0.5", "position":"absolute",
	"top":"0px", "bottom":"0px", "left":"0px", "right":"0px", "z-index":"99999999999"};
const cssItemSelector = {"position":"absolute", "top":"50%", "left":"50%",
	"margin":"-175px 0 0 -250px", "width":"500px", "height":"350px", "z-index":"999999999999",
	"background":"#FFF"};

window.Zotero = Zotero;
window.ZOTERO_CONFIG = ZOTERO_CONFIG;
Zotero.isBookmarklet = true;
Zotero.Debug.init();
Zotero.Connector_Types.init();
Zotero.Messaging.init();

var translate = new Zotero.Translate.Web(),
	selectCallback;
translate.setDocument(document);
translate.setHandler("translators", function(obj, translators) {
	if(translators && translators.length) {
		translate.setTranslator(translators[0]);
		translate.translate();
	} else {
		Zotero.ProgressWindow.showNoTranslatorError();
		Zotero.ProgressWindow.startCloseTimer(8000);
		zoteroIFrame.parentNode.removeChild(zoteroIFrame);
	}
});
translate.setHandler("select", function(obj, items, callback) {
	var appendTo = (document.body ? document.body : document.documentElement);
	
	var itemSelectorDiv = document.createElement("div");
	itemSelectorDiv.style.cssText = cssDivClearString;
	for(var i in cssItemSelectorDiv) itemSelectorDiv.style[i] = cssItemSelectorDiv[i];
	appendTo.appendChild(itemSelectorDiv);
	
	var itemSelectorIFrame = document.createElement("iframe");
	for(var i in cssItemSelector) itemSelectorIFrame.style[i] = cssItemSelector[i];
	itemSelectorIFrame.src = ZOTERO_CONFIG.BOOKMARKLET_URL+"itemSelector.html?"+encodeURIComponent(JSON.stringify([null, items]));
	appendTo.appendChild(itemSelectorIFrame);
	
	selectCallback = function(items) {
		appendTo.removeChild(itemSelectorDiv);
		appendTo.removeChild(itemSelectorIFrame);
		callback(items);
	};
});
translate.setHandler("itemSaving", function(obj, item) {
	Zotero.ProgressWindow.itemSaving(Zotero.ItemTypes.getImageSrc(item.itemType),
		item);
});
translate.setHandler("itemDone", function(obj, dbItem, item) {
	Zotero.ProgressWindow.itemDone(Zotero.ItemTypes.getImageSrc(item.itemType),
		item);
});
translate.setHandler("done", function(obj, returnValue) {
	if(returnValue) {
		Zotero.ProgressWindow.startCloseTimer(2500);
	} else {
		Zotero.ProgressWindow.showError();
		Zotero.ProgressWindow.startCloseTimer(8000);
	}
	zoteroIFrame.parentNode.removeChild(zoteroIFrame);
});

// add message listener for translate, so we don't call until the iframe is loaded
Zotero.Messaging.addMessageListener("translate", function() {
	translate.getTranslators();
});
Zotero.Messaging.addMessageListener("selectDone", function(returnItems) {
	// if no items selected, close save dialog immediately
	if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
		Zotero.ProgressWindow.close();
	}
	selectCallback(returnItems);
});

// This closes the block of code to be injected only if the bookmarklet hasn't been previously
// injected on this page
}}

if(document.getElementById("zotero-iframe")) {
	alert("A previous translation process is still in progress. Please wait for it to complete, "+
		"or refresh the page.");
} else {
	Zotero.ProgressWindow.show();
	var zoteroIFrame = document.createElement("iframe");
	zoteroIFrame.id = "zotero-iframe";
	zoteroIFrame.src = ZOTERO_CONFIG.BOOKMARKLET_URL+"iframe.html";
	zoteroIFrame.style.display = "none";
	(document.body ? document.body : document.documentElement).appendChild(zoteroIFrame);
}