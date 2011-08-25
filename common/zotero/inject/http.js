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

/**
 * Functions for performing HTTP requests, both via XMLHTTPRequest and using a hidden browser
 * @namespace
 */
if(!Zotero.HTTP) Zotero.HTTP = {};
 
/**
 * Load one or more documents in a hidden iframe
 *
 * @param {String|String[]} urls URL(s) of documents to load
 * @param {Function} processor Callback to be executed for each document loaded
 * @param {Function} done Callback to be executed after all documents have been loaded
 * @param {Function} exception Callback to be executed if an exception occurs
 */
Zotero.HTTP.processDocuments = function(urls, processor, done, exception, dontDelete) {
	/**
	 * Removes event listener for the load event and deletes the hidden browser
	 */
	var removeListeners = function() {
		hiddenBrowser.removeEventListener("load", onLoad, true);
		if(!dontDelete) Zotero.Browser.removeHiddenBrowser(hiddenBrowser);
	}
	
	/**
	 * Loads the next page
	 * @inner
	 */
	var doLoad = function() {
		if(urls.length) {
			var url = urls.shift();
			try {
				Zotero.debug("HTTP.processDocuments: Loading "+url);
				hiddenBrowser.src = url;
			} catch(e) {
				removeListeners();
				if(exception) {
					exception(e);
					return;
				} else {
					throw(e);
				}
			}
		} else {
			removeListeners();
			if(done) done();
		}
	};
	
	/**
	 * Callback to be executed when a page load completes
	 * @inner
	 */
	var onLoad = function() {
		if(hiddenBrowser.contentDocument.location.href == "about:blank") return;
		Zotero.debug("HTTP.processDocuments: "+hiddenBrowser.contentDocument.location.href+" has been loaded");
		if(hiddenBrowser.contentDocument.location.href != prevUrl) {	// Just in case it fires too many times
			prevUrl = hiddenBrowser.contentDocument.location.href;
			try {
				processor(hiddenBrowser.contentDocument);
			} catch(e) {
				removeListeners();
				if(exception) {
					exception(e);
					return;
				} else {
					throw(e);
				}
			}
			doLoad();
		}
	};
	
	if(typeof(urls) == "string") urls = [urls];
	
	var prevUrl;
	
	var hiddenBrowser = Zotero.Browser.createHiddenBrowser();
	hiddenBrowser.addEventListener("load", onLoad, true);
	
	doLoad();
}

Zotero.Browser = {
	"createHiddenBrowser":function() {
		var hiddenBrowser = document.createElement("iframe");
		hiddenBrowser.style.display = "none";
		document.body.appendChild(hiddenBrowser);
		return hiddenBrowser;
	},
	"removeHiddenBrowser":function(hiddenBrowser) {
		if(hiddenBrowser) document.body.removeChild(hiddenBrowser);
	}
}