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
	var _callback, _tokenSecret, _bookmarkletIFrame;
	
	/**
	 * Decodes application/x-www-form-urlencoded data
	 */
	function _decodeFormData(postData) {
		var splitData = postData.split("&");
		var decodedData = {};
		for(var i in splitData) {
			var variable = splitData[i];
			var splitIndex = variable.indexOf("=");
			decodedData[decodeURIComponent(variable.substr(0, splitIndex))] = decodeURIComponent(variable.substr(splitIndex+1));
		}
		return decodedData;
	}
	
	/**
	 * Performs OAuth authorization
	 * @param {Function} callback Callback to execute when OAuth is complete. The first argument
	 *                            passed to the callback indicates whether authorization succeeded
	 *                            successfully. The second will be either a string error message
	 *                            (if authorization failed) or the username (if authorization 
	 *                            succeeded)
	 */
	this.authorize = function(callback) {
		if(_callback) {
			callback(false, "An authorization request is already in progress.");
		}
		_callback = callback;
		
		var oauthSimple = new OAuthSimple(ZOTERO_CONFIG.OAUTH_CLIENT_KEY,
			ZOTERO_CONFIG.OAUTH_CLIENT_SECRET);
		oauthSimple.setURL(ZOTERO_CONFIG.OAUTH_REQUEST_URL);
		oauthSimple.setAction("POST");
		
		Zotero.HTTP.doPost(ZOTERO_CONFIG.OAUTH_REQUEST_URL, "", function(xmlhttp) {
			if(xmlhttp.status !== 200) {
				Zotero.logError("OAuth request failed with "+xmlhttp.status+'; response was '+xmlhttp.responseText);
				try {
					_callback(false, "An invalid response was received from the Zotero server");
				} finally {
					_callback = undefined;
					return;
				}
			}
			
			// parse output and store token_secret
			var data = _decodeFormData(xmlhttp.responseText);
			_tokenSecret = data.oauth_token_secret;
			
			// get signed URL
			oauthSimple.signatures(data);
			oauthSimple.setURL(ZOTERO_CONFIG.OAUTH_AUTHORIZE_URL);
			var signature = oauthSimple.sign();
			
			// add parameters
			var url = signature.signed_url+"&library_access=1&notes_access=0&write_access=1&name=";
			if(Zotero.isBookmarklet) {
				url += "Zotero Bookmarklet";
			} else if(Zotero.isChrome) {
				url += "Zotero Connector for Chrome";
			} else if(Zotero.isSafari) {
				url += "Zotero Connector for Safari";
			}
			
			// open
			if(Zotero.isBookmarklet) {
				_bookmarkletIFrame = document.createElement("iframe");
				_bookmarkletIFrame.src = url;
				_bookmarkletIFrame.style.borderStyle = "none";
				_bookmarkletIFrame.style.position = "absolute";
				_bookmarkletIFrame.style.top = "0px";
				_bookmarkletIFrame.style.left = "0px";
				_bookmarkletIFrame.style.width = "100%";
				_bookmarkletIFrame.style.height = "100%";
				document.body.appendChild(_bookmarkletIFrame);
				Zotero.Messaging.sendMessage("revealZoteroIFrame", null);
			} else if(Zotero.isChrome) {
				window.open(url, 'ZoteroAuthenticate',
					'height=600,width=900,location,toolbar=no,menubar=no,status=no');
			} else if(Zotero.isSafari) {
				var newTab = safari.application.openBrowserWindow().activeTab;
				newTab.url = url;
			}
				
		}, {"Authorization":oauthSimple.getHeaderString()});
	};
	
	/**
	 * Called when OAuth is complete
	 * @param {String} data The query string received from OAuth
	 * @param {Tab} tab The object corresponding to the tab where OAuth completed
	 */
	this.onAuthorizationComplete = function(data, tab) {
		// close auth window
		if(Zotero.isBookmarklet) {
			Zotero.Messaging.sendMessage("hideZoteroIFrame", null);
			document.body.removeChild(_bookmarkletIFrame);
		} else if(Zotero.isChrome) {
			chrome.tabs.remove(tab.id);
		} else if(Zotero.isSafari) {
			tab.close();
		}
		
		if(!_tokenSecret) {
			throw new Error("onAuthenticationComplete called with no outstanding OAuth request");
		}
		
		var oauthSimple = new OAuthSimple(ZOTERO_CONFIG.OAUTH_CLIENT_KEY,
			ZOTERO_CONFIG.OAUTH_CLIENT_SECRET);
		oauthSimple.setURL(ZOTERO_CONFIG.OAUTH_ACCESS_URL);
		oauthSimple.setParameters(_decodeFormData(data));
		oauthSimple.signatures({"oauth_token_secret":_tokenSecret});
		oauthSimple.setAction("POST");
		
		Zotero.HTTP.doPost(ZOTERO_CONFIG.OAUTH_ACCESS_URL, "", function(xmlhttp) {
			if(xmlhttp.status !== 200) {
				Zotero.logError("OAuth access failed with "+xmlhttp.status+'; response was '+xmlhttp.responseText);
				try {
					_callback(false, "An invalid response was received from the Zotero server");
				} finally {
					_callback = undefined;
					return;
				}
			}
			
			var data = _decodeFormData(xmlhttp.responseText);
			Zotero.HTTP.doGet(ZOTERO_CONFIG.API_URL+"users/"+encodeURI(data.userID)
					+"/keys/"+encodeURI(data.oauth_token_secret), function(xmlhttp) {
				var access;
				if(!xmlhttp.responseXML || !xmlhttp.responseXML.getElementsByTagName
						|| !(access = xmlhttp.responseXML.getElementsByTagName("access")).length) {
					Zotero.logError("Key verification failed with "+xmlhttp.status+'; response was '+xmlhttp.responseText);
					try {
						_callback(false, "API key could not be verified");
					} finally {
						_callback = undefined;
						return;
					}
				}
				
				access = access[0];
				
				if(access.getAttribute("library") != "1" || access.getAttribute("write") != "1") {
					Zotero.logError("Generated key had inadequate permissions; response was "+xmlhttp.responseText);
					try {
						_callback(false, "The key you have generated does not have adequate "+
							"permissions to save items to your Zotero library. Please try again "+
							"without modifying your key's permissions.");
					} finally {
						_callback = undefined;
						return;
					}
				}
				
				if(Zotero.isBookmarklet) {
					var cookieExpires = new Date(Date.now()+24*60*60*1000*365).toGMTString();
					document.cookie = 'bookmarklet-auth-token_secret='
						+encodeURIComponent(data.oauth_token_secret)+'; expires='+cookieExpires;
					document.cookie = 'bookmarklet-auth-userID='
						+encodeURIComponent(data.userID)+'; expires='+cookieExpires;
				} else {
					localStorage["auth-token"] = data.oauth_token;
					localStorage["auth-token_secret"] = data.oauth_token_secret;
					localStorage["auth-userID"] = data.userID;
					localStorage["auth-username"] = data.username;
				}
				
				try {
					_callback(true, {"username":data.username, "userID":data.userID});
				} finally {
					_callback = undefined;
				}
			});
		}, {"Authorization":oauthSimple.getHeaderString()});
		_tokenSecret = undefined;
	};
	
	/**
	 * Clears OAuth credentials from localStorage
	 */
	this.clearCredentials = function() {
		if(Zotero.isBookmarklet) {
			throw new Error("Zotero.OAuth.clearCredentials() not supported in bookmarklet");
			return;
		}
		
		delete localStorage["auth-token"];
		delete localStorage["auth-token_secret"];
		delete localStorage["auth-userID"];
		delete localStorage["auth-username"];
		// TODO revoke key
	};
	
	/**
	 * Gets authorized username
	 * @param {Function} callback Callback to receive username (or null if none is define)
	 */
	this.getUserInfo = function(callback) {
		if(Zotero.isBookmarklet) {
			Zotero.logError(new Error("Zotero.OAuth.getUserInfo() not supported in bookmarklet"));
			callback(null);
			return;
		}
		
		callback(localStorage.hasOwnProperty("auth-token")
			? {"username":localStorage["auth-username"], "userID":localStorage["auth-userID"]}
			: null);
	};
	
	/**
	 * Performs an authenticated POST request. Callback will be passed success (true or false)
	 * as first argument and status code or response body as second. This is separated here in order
	 * to avoid passing credentials to injected scripts.
	 *
	 * @param {String} url URL to request. %%USERID%% and %%APIKEY%% in the URL will be
	 *                     substituted for user-specific data.
	 * @param {String} body Request body
	 * @param {Function} onDone Callback to be executed upon request completion
	 * @param {String} headers Request HTTP headers
	 */
	this.doAuthenticatedPost = function(path, body, callback, askForAuth) {
		if(Zotero.isBookmarklet) {
			var idAndApiKey = _getUserIDAndAPIKey(),
				userID = idAndApiKey[0],
				apiKey = idAndApiKey[1];
		} else {
			var userID = localStorage["auth-userID"],
				apiKey = localStorage["auth-token_secret"];
		}
		
		if(!userID) {
			// ask user to authorize if necessary
			if(askForAuth) {
				Zotero.OAuth.authorize(function(status, msg) {
					if(!status) {
						Zotero.logError("Translate: Save to server failed with message "+msg);
						Zotero.debug("Translate: Save to server failed with message "+msg+"; payload:\n\n"+body);
						callback(false);
						return;
					}
					
					Zotero.OAuth.doAuthenticatedPost(path, body, callback, false);
				});
			} else {
				callback(false);
			}
			return;
		}
		
		// process url
		var url = ZOTERO_CONFIG.API_URL+path
			.replace("%%USERID%%", userID)
			.replace("%%APIKEY%%", apiKey);
		
		// do post
		Zotero.HTTP.doPost(url, body, function(xmlhttp) {
			callback([200, 201, 204].indexOf(xmlhttp.status) !== -1);
		}, {"Content-Type":"application/json"});
	};
	
	/**
	 * Gets user ID and API key from cookies (in bookmarklet only)
	 */
	function _getUserIDAndAPIKey() {
		var userID, apiKey, cookies = document.cookie.split(/ *; */);
		for(var i=0, n=cookies.length; i<n; i++) {
			var cookie = cookies[i],
				equalsIndex = cookie.indexOf("="),
				key = cookie.substr(0, equalsIndex);
			if(key === "bookmarklet-auth-userID") {
				userID = cookie.substr(equalsIndex+1);
			} else if(key === "bookmarklet-auth-token_secret") {
				apiKey = cookie.substr(equalsIndex+1);
			} 
		}
		
		return [userID, apiKey];
	}
}