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
		if("removeEventListener" in hiddenBrowser) {
			hiddenBrowser.removeEventListener("load", onLoad, false);
		}
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
				if(exception) {
					try {
						exception(e);
					} catch(e) {
						Zotero.logError(e);
					}
					return;
				} else {
					Zotero.logError(e);
				}
				
				removeListeners();
			}
		} else {
			if(done) {
				try {
					done();
				} catch(e) {
					Zotero.logError(done);
				}
			}
			
			removeListeners();
		}
	};
	
	/**
	 * Callback to be executed when a page load completes
	 * @inner
	 */
	var onLoad = function() {
		try {
			var newWin = hiddenBrowser.contentWindow,
				newDoc = (newWin ? newWin.document : hiddenBrowser.contentDocument),
				newLoc = (newWin ? newWin.location : newDoc.location).toString();
			if(newLoc === "about:blank") return;
			Zotero.debug("HTTP.processDocuments: "+newLoc+" has been loaded");
			if(newLoc !== prevUrl) {	// Just in case it fires too many times
				prevUrl = newLoc;
				
				if(Zotero.isIE) {
					// ugh ugh ugh ugh
					installXPathIfNecessary(newWin);
				}
				
				try {
					processor(newDoc);
				} catch(e) {
					Zotero.logError(e);
				}
				
				doLoad();
			}
		} catch(e) {
			if(exception) {
				try {
					exception(e);
				} catch(e) {
					Zotero.logError(e);
				}
			} else {
				Zotero.logError(e);
			}
			
			removeListeners();
			return;
		}
	};
	
	if(typeof(urls) == "string") urls = [urls];
	
	var prevUrl;
	
	var hiddenBrowser = Zotero.Browser.createHiddenBrowser();
	if(hiddenBrowser.addEventListener) {
		hiddenBrowser.addEventListener("load", onLoad, false);
	} else {
		hiddenBrowser.attachEvent("onload", onLoad);
	}
	
	doLoad();
	return hiddenBrowser;
}

Zotero.Browser = {
	"createHiddenBrowser":function() {
		var hiddenBrowser = document.createElement("iframe");
		hiddenBrowser.style.display = "none";
		document.body.appendChild(hiddenBrowser);
		return hiddenBrowser;
	},
	"deleteHiddenBrowser":function(hiddenBrowser) {
		document.body.removeChild(hiddenBrowser);
	}
}