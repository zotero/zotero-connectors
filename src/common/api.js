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

Zotero.API = new function() {
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
			decodedData[decodeURIComponent(variable.substr(0, splitIndex))] =
				decodeURIComponent(variable.substr(splitIndex+1).replace(/\+/g, "%20"));
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
			if(Zotero.isChrome) {
				url += "Zotero Connector for Chrome";
			} else if(Zotero.isSafari) {
				url += "Zotero Connector for Safari";
			}
			
			// open
			if(Zotero.isChrome) {
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
		if(Zotero.isChrome) {
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
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.open("GET", ZOTERO_CONFIG.API_URL+"users/"+encodeURI(data.userID)+
					"/keys/"+encodeURI(data.oauth_token_secret), true);
			xmlhttp.onreadystatechange = function() {
				if(xmlhttp.readyState != 4) return;
				try {
					var json = JSON.parse(xmlhttp.responseText),
					    access = json.access;
				} catch(e) {};

				if(!access || !access.user) {
					Zotero.logError("Key verification failed with "+xmlhttp.status+'; response was '+xmlhttp.responseText);
					try {
						_callback(false, "API key could not be verified");
					} finally {
						_callback = undefined;
						return;
					}
				}
				
				if(!access.user.library || !access.user.write) {
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
			
				localStorage["auth-token"] = data.oauth_token;
				localStorage["auth-token_secret"] = data.oauth_token_secret;
				localStorage["auth-userID"] = data.userID;
				localStorage["auth-username"] = data.username;
				
				try {
					_callback(true, {"username":data.username, "userID":data.userID});
				} finally {
					_callback = undefined;
				}
			};
			xmlhttp.setRequestHeader("Zotero-API-Version", "3");
			xmlhttp.send();
		}, {
			"Authorization":oauthSimple.getHeaderString()
		});
		_tokenSecret = undefined;
	};
	
	/**
	 * Clears OAuth credentials from localStorage
	 */
	this.clearCredentials = function() {
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
		callback(localStorage.hasOwnProperty("auth-token")
			? {"username":localStorage["auth-username"],
			   "userID":localStorage["auth-userID"],
			   "apiKey":localStorage["auth-token_secret"]}
			: null);
	};
	
	/**
	 * Creates a new item. In Safari, this runs in the background script. In Chrome, it
	 * runs in the injected script.
	 * @param {Object} payload Item(s) to create, in the object format expected by the server.
	 * @param {String|null} itemKey Parent item key, or null if a top-level item.
	 * @param {Function} callback Callback to be executed upon request completion. Passed true if
	 *     succeeded, or false if failed, along with the response body.
	 * @param {Boolean} [askForAuth] If askForAuth === false, don't ask for authorization if not 
	 *     already authorized.
	 */
	this.createItem = function(payload, callback, askForAuth) {
		Zotero.API.getUserInfo(function(userInfo) {
			var userID = localStorage["auth-userID"],
				apiKey = localStorage["auth-token_secret"];
			
			if(!userInfo) {
				if(askForAuth === false) {
					callback(403, "Not authorized");
				} else {
					Zotero.API.authorize(function(status, msg) {
						if(!status) {
							Zotero.logError("Translate: Authentication failed with message "+msg);
							callback(403, "Authentication failed");
							return;
						}
						
						Zotero.API.createItem(payload, callback, false);
					});
				}
				return;
			}
			
			var url = ZOTERO_CONFIG.API_URL+"users/"+userInfo.userID+"/items?key="+userInfo.apiKey;
			Zotero.HTTP.doPost(url, JSON.stringify(payload), function(xmlhttp) {
				if(xmlhttp.status !== 0 && xmlhttp.status < 400) {
					callback(xmlhttp.status, xmlhttp.responseText);
				} else if(askForAuth && xmlhttp.status === 403) {
					Zotero.API.authorize(function(status, msg) {
						if(!status) {
							Zotero.logError("Translate: Authentication failed with message "+msg);
							callback(403, "Authentication failed");
							return;
						}
						
						Zotero.API.createItem(payload, callback, false);
					});
				} else {
					var msg = xmlhttp.status+" ("+xmlhttp.responseText+")";
					Zotero.logError("API request failed with "+msg);
					callback(xmlhttp.status, msg);
				}
			}, {
				"Content-Type":"application/json",
				"Zotero-API-Version":"2"
			});
		});
	};
	
	/**
	 * Uploads an attachment to the Zotero server. In Safari, this runs in the background
	 * script. In Chrome, it runs in the injected script.
	 * @param {Object} attachment An attachment object. This object must have the following keys<br>
	 *     id - a unique identifier for the attachment used to identifiy it in subsequent progress
	 *          messages<br>
	 *     data - the attachment contents, as a typed array<br>
	 *     filename - a filename for the attachment<br>
	 *     key - the attachment item key<br>
	 *     md5 - the MD5 hash of the attachment contents<br>
	 *     mimeType - the attachment MIME type
	 */
	this.uploadAttachment = function(attachment, callbackOrTab) {
		var _dispatchAttachmentCallback = function(id, status, error) {
			if(Zotero.isChrome && !Zotero.isBookmarklet) {
				// In Chrome, we don't use messaging for Zotero.API.uploadAttachment, 
				// since we can't pass ArrayBuffers to the background page
				callbackOrTab(status, error);
			} else {
				Zotero.Messaging.sendMessage("attachmentCallback",
					(error ? [id, status, error.toString()] : [id, status]), callbackOrTab);
			}
			if(error) throw error;
		};
		
		const REQUIRED_PROPERTIES = ["id", "data", "filename", "key", "md5", "mimeType"];
		for(var i=0; i<REQUIRED_PROPERTIES.length; i++) {
			if(!attachment[REQUIRED_PROPERTIES[i]]) {
				_dispatchAttachmentCallback(attachment.id, false,
					'Required property "'+REQUIRED_PROPERTIES[i]+'" not defined');
				return;
			}
		}
		
		if(/[^a-zA-Z0-9]/.test(attachment.key)) {
			_dispatchAttachmentCallback(attachment.id, false, 'Attachment key is invalid');
			return;
		}
		
		var data = {
			"md5":attachment.md5,
			"filename":attachment.filename,
			"filesize":attachment.data.byteLength,
			"mtime":(+new Date),
			"contentType":attachment.mimeType
		};
		if(attachment.charset) data.charset = attachment.charset;
		var dataString = [];
		for(var i in data) {
			dataString.push(i+"="+encodeURIComponent(data[i]));
		}
		data = dataString.join("&");
		
		Zotero.API.getUserInfo(function(userInfo) {
			if(!userInfo) {
				// We should always have authorization credentials, since an item needs to
				// be created before we can upload data. Thus, this code is probably
				// unreachable, but it's here just in case.
				_dispatchAttachmentCallback(attachment.id, false, "No authorization credentials available");
				return;
			}
			
			var url = ZOTERO_CONFIG.API_URL+"users/"+userInfo.userID+"/items/"+attachment.key+"/file?key="+userInfo.apiKey;
			Zotero.HTTP.doPost(url, data, function(xmlhttp) {
				if(xmlhttp.status !== 200) {
					var msg = xmlhttp.status+" ("+xmlhttp.responseText+")";
					_dispatchAttachmentCallback(attachment.id, false, msg);
					return;
				}
				
				try {
					var response = JSON.parse(xmlhttp.responseText);
				} catch(e) {
					_dispatchAttachmentCallback(attachment.id, false, "Error parsing JSON from server");
					return;
				}
				
				// { "exists": 1 } implies no further action necessary
				if(response.exists) {
					Zotero.debug("OAuth: Attachment exists; no upload necessary");
					_dispatchAttachmentCallback(attachment.id, 100);
					return;
				}
				
				Zotero.debug("OAuth: Upload authorized");
				
				// Append prefix and suffix to data array
				var prefixLength = Zotero.Utilities.getStringByteLength(response.prefix),
					suffixLength = Zotero.Utilities.getStringByteLength(response.suffix),
					uploadData = new Uint8Array(attachment.data.byteLength + prefixLength
						+ suffixLength);
				Zotero.Utilities.stringToUTF8Array(response.prefix, uploadData, 0);
				uploadData.set(new Uint8Array(attachment.data), prefixLength);
				Zotero.Utilities.stringToUTF8Array(response.suffix, uploadData,
					attachment.data.byteLength+prefixLength);
				
				var xhr = new XMLHttpRequest();
				xhr.open("POST", response.url, true);
				xhr.onloadend = function() {
					if(this.status !== 200 && this.status !== 201) {
						var msg = this.status+" ("+this.responseText+")";
						_dispatchAttachmentCallback(attachment.id, false, msg);
						return;
					}
				
					// Upload complete; register it
					Zotero.HTTP.doPost(url, "upload="+response.uploadKey, function(xmlhttp) {
						if(xmlhttp.status === 204) {
							Zotero.debug("OAuth: Upload registered");
							_dispatchAttachmentCallback(attachment.id, 100);
						} else {
							var msg = xmlhttp.status+" ("+xmlhttp.responseText+")";
							_dispatchAttachmentCallback(attachment.id, false, msg);
						}
					}, {
						"Content-Type":"application/x-www-form-urlencoded",
						"If-None-Match":"*"
					});
				};
				xhr.onprogress = function(event) {
					if(event.loaded == event.total) return;
					_dispatchAttachmentCallback(attachment.id, event.loaded/event.total*100);
				};
				xhr.setRequestHeader("Content-Type", response.contentType);
				xhr.send(uploadData.buffer);
			},
			{
				"Content-Type":"application/x-www-form-urlencoded",
				"If-None-Match":"*",
				"Zotero-API-Version":"2"
			});
		});
	};
}