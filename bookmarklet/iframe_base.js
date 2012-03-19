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

Zotero.OAuth = new function() {	
	/**
	 * Performs authorization
	 * @param {Function} callback Callback to execute when auth is complete. The first argument
	 *                            passed to the callback indicates whether authorization succeeded
	 *                            successfully. The second will be either a string error message
	 *                            (if authorization failed) or the username (if authorization 
	 *                            succeeded)
	 */
	this.authorize = function(callback) {
		var iframe = document.createElement("iframe");
		iframe.src = ZOTERO_CONFIG.LOGIN_URL;
		iframe.style.borderStyle = "none";
		iframe.style.position = "absolute";
		iframe.style.top = "0px";
		iframe.style.left = "0px";
		iframe.style.width = "100%";
		iframe.style.height = "100%";
		iframe.onload = function() {
			var win = iframe.contentWindow;
			if(win.location.href !== ZOTERO_CONFIG.LOGIN_URL
					&& win.location.href !== "about:blank") {	
				Zotero.Messaging.sendMessage("hideZoteroIFrame", null);
				document.body.removeChild(iframe);
			
				// Authorization should be done
				var c = _getCredentials(), userID = c[0], sessionToken = c[1];
				if(!userID || !sessionToken) {
					if(!userID) {
						var str = "User ID";
					} else if(!sessionToken) {
						var str = "Session token";
					} else {
						var str = "User ID and session token";
					}
					str += " not available";
					callback(false, str);
					return;
				}
				callback(true);
			}
		};
		
		document.body.appendChild(iframe);
		Zotero.Messaging.sendMessage("revealZoteroIFrame", null);
	}
	
	/**
	 * Performs an authenticated POST request. Callback will be passed success (true or false)
	 * as first argument and status code or response body as second. This is separated here in order
	 * to avoid passing credentials to injected scripts.
	 *
	 * @param {String} url URL to request. %%USERID%% in the URL will be substituted for the user ID
	 * @param {String} body Request body
	 * @param {Function} callback Callback to be executed upon request completion. Passed true if
	 *     succeeded, or false if failed.
	 * @param {Boolean} [askForAuth] Whether to ask the user for authorization if not already
	 *     authorized.
	 */
	this.doAuthenticatedPost = function(path, body, callback, askForAuth) {
		var c = _getCredentials(), userID = c[0], sessionToken = c[1],
			reauthorize = function() {
			Zotero.OAuth.authorize(function(status, msg) {
				if(!status) {
					Zotero.logError("Translate: Authentication failed with message "+msg);
					callback(false);
					return;
				}
				
				Zotero.OAuth.doAuthenticatedPost(path, body, callback, false);
			});
		};
		
		if(!userID || !sessionToken) {
			if(askForAuth) {
				reauthorize();
				return;
			} else {
				callback(false, "Not authorized");
			}
		}
		
		var url = ZOTERO_CONFIG.API_URL+path
			.replace("%%USERID%%", userID)+
			(path.indexOf("?") === -1 ? "?" : "&")+"session="+sessionToken;
		
		Zotero.HTTP.doPost(url, body, function(xmlhttp) {
			if([200, 201, 204].indexOf(xmlhttp.status) !== -1) {
				callback(true);
			} else if(xmlhttp.status == 403 && askForAuth) {
				Zotero.debug("Translate: API request failed with 403 ("+xmlhttp.responseText+"); reauthorizing");
				reauthorize();
			} else {
				var msg = xmlhttp.status+" ("+xmlhttp.responseText+")";
				Zotero.logError("Translate: API request failed with "+msg);
				Zotero.debug("Translate: API request failed with "+msg+"; payload:\n\n"+body);
				callback(false);
			}
		}, {"Content-Type":"application/json"});
	}
	
	/**
	 * Extracts credentials from cookies
	 */
	function _getCredentials() {
		var userID, sessionToken, cookies = document.cookie.split(/ *; */);
		for(var i=0, n=cookies.length; i<n; i++) {
			var cookie = cookies[i],
				equalsIndex = cookie.indexOf("="),
				key = cookie.substr(0, equalsIndex);
			if(key === "zoteroUserInfo") {
				var m = /"userID";(?:s:[0-9]+:"|i:)([0-9]+)/.exec(unescape(cookie.substr(equalsIndex+1)));
				if(m) userID = m[1];
			} else if(key === "zotero_www_session_v2") {
				sessionToken = cookie.substr(equalsIndex+1);
			} 
		}
		return [userID, sessionToken];
	}
}

Zotero.isBookmarklet = true;
Zotero.Debug.init();
Zotero.Messaging.init();
if(Zotero.isIE) {
	Zotero.Connector.checkIsOnline(function(status) {
		if(!status && window.location.protocol === "http:") {
			Zotero.debug("Switching to https");
			window.location.replace("https:"+window.location.toString().substr(5));
		} else {
			Zotero.debug("Sending translate message");
			Zotero.Messaging.sendMessage("translate", null);
		}
	});
} else {
	Zotero.Messaging.sendMessage("translate", null);
}