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
Zotero.HTTP = new function() {
	/**
	* Send an HTTP GET request via XMLHTTPRequest
	* 
	* @param {nsIURI|String}	url				URL to request
	* @param {Function} 		onDone			Callback to be executed upon request completion
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doGet = function(url, onDone, responseCharset) {
		if(Zotero.isInject && !Zotero.HTTP.isSameOrigin(url)) {
			if(Zotero.isBookmarklet) {
				Zotero.debug("Attempting cross-site request from bookmarklet; this may fail");
			} else if(Zotero.isSafari || Zotero.HTTP.isLessSecure(url)) {
				Zotero.COHTTP.doGet(url, onDone, responseCharset);
				return;
			}
		}
		
		Zotero.debug("HTTP GET " + url);
		
		var xmlhttp = new XMLHttpRequest();
		try {
			xmlhttp.open('GET', url, true);
			
			if(xmlhttp.overrideMimeType && responseCharset) {
				xmlhttp.overrideMimeType("text/plain; charset=" + responseCharset);
			}
			
			/** @ignore */
			xmlhttp.onreadystatechange = function() {
				_stateChange(xmlhttp, onDone);
			};
			xmlhttp.send(null);
		} catch(e) {
			Zotero.logError(e);
			if(onDone) {
				window.setTimeout(function() {
					try {
						onDone({"status":0, "responseText":""});
					} catch(e) {
						Zotero.logError(e);
						return;
					}
				}, 0);
			}
		}
		
		return xmlhttp;
	}
	
	/**
	* Send an HTTP POST request via XMLHTTPRequest
	*
	* @param {String} url URL to request
	* @param {String} body Request body
	* @param {Function} onDone Callback to be executed upon request completion
	* @param {String} headers Request HTTP headers
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doPost = function(url, body, onDone, headers, responseCharset) {
		if(Zotero.isInject && !Zotero.HTTP.isSameOrigin(url)) {
			if(Zotero.isBookmarklet) {
				Zotero.debug("Attempting cross-site request from bookmarklet; this may fail");
			} else if(Zotero.isSafari || Zotero.HTTP.isLessSecure(url)) {
				Zotero.COHTTP.doPost(url, body, onDone, headers, responseCharset);
				return;
			}
		}
		
		var bodyStart = body.substr(0, 1024);
		Zotero.debug("HTTP POST "
			+ (body.length > 1024 ?
				bodyStart + '... (' + body.length + ' chars)' : bodyStart)
			+ " to " + url);
		
		var xmlhttp = new XMLHttpRequest();
		try {
			xmlhttp.open('POST', url, true);
			
			if (!headers) headers = {};
			if (!headers["Content-Type"]) {
				headers["Content-Type"] = "application/x-www-form-urlencoded";
			}
			
			for (var header in headers) {
				xmlhttp.setRequestHeader(header, headers[header]);
			}
			
			if(xmlhttp.overrideMimeType && responseCharset) {
				xmlhttp.overrideMimeType("text/plain; charset=" + responseCharset);
			}
			
			/** @ignore */
			xmlhttp.onreadystatechange = function(){
				_stateChange(xmlhttp, onDone);
			};
			
			xmlhttp.send(body);
		} catch(e) {
			Zotero.logError(e);
			if(onDone) {
				window.setTimeout(function() {
					try {
						onDone({"status":0, "responseText":""});
					} catch(e) {
						Zotero.logError(e);
						return;
					}
				}, 0);
			}
		}
			
		return xmlhttp;
	}
	
	/**
	 * Handler for XMLHttpRequest state change
	 *
	 * @param {nsIXMLHttpRequest} XMLHttpRequest whose state just changed
	 * @param {Function} [onDone] Callback for request completion
	 * @param {String} [responseCharset] Character set to force on the response
	 * @private
	 */
	function _stateChange(xmlhttp, callback) {
		switch (xmlhttp.readyState){
			// Request not yet made
			case 1:
				break;
			
			case 2:
				break;
			
			// Called multiple times while downloading in progress
			case 3:
				break;
			
			// Download complete
			case 4:
				if (callback) {
					try {
						callback(xmlhttp);
					} catch(e) {
						Zotero.logError(e);
						return;
					}
				}
			break;
		}
	}
}

// Alias as COHTTP = Cross-origin HTTP; this is how we will call it from children
// For injected scripts, this get overwritten in messaging.js (see messages.js)
Zotero.COHTTP = {
	"doGet":Zotero.HTTP.doGet,
	"doPost":Zotero.HTTP.doPost
};
