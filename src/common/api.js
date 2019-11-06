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
	var _tokenSecret;
	var config = ZOTERO_CONFIG;
	
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
	 */
	this.authorize = function() {
		// TODO: switch to authorization request window
		if (this._deferred) {
			return this._deferred.promise;
		}
		this._deferred = Zotero.Promise.defer();
		this._deferred.promise
			.then((r) => {this._deferred = null; return r}, (e) => {this._deferred = null; throw e});
		
		var oauthSimple = new OAuthSimple(config.OAUTH.ZOTERO.CLIENT_KEY,
			config.OAUTH.ZOTERO.CLIENT_SECRET);
		oauthSimple.setURL(config.OAUTH.ZOTERO.REQUEST_URL);
		oauthSimple.setAction("POST");
		
		let options = {
			body: '',
			headers: {"Authorization": oauthSimple.getHeaderString()}
		};
		Zotero.HTTP.request("POST", config.OAUTH.ZOTERO.REQUEST_URL, options).then(function(xmlhttp) {
			// parse output and store token_secret
			var data = _decodeFormData(xmlhttp.responseText);
			_tokenSecret = data.oauth_token_secret;
			
			// get signed URL
			oauthSimple.signatures(data);
			oauthSimple.setURL(config.OAUTH.ZOTERO.AUTHORIZE_URL);
			var signature = oauthSimple.sign();
			
			// add parameters
			var url = signature.signed_url+"&library_access=1&notes_access=0&write_access=1&name=Zotero Connector for ";
			if (Zotero.isChrome) {
				url += "Chrome";
			} else if(Zotero.isSafari) {
				url += "Safari";
			} else if (Zotero.isFirefox) {
				url += "Firefox";
			} else if (Zotero.isEdge) {
				url += "Edge";
			}
			
			Zotero.Connector_Browser.openWindow(url, {width: 900, height: 600, type: 'normal',
				onClose: Zotero.API.onAuthorizationCancel.bind(Zotero.API)});
				
		}.bind(this), function(e) {
			Zotero.logError(`OAuth request failed with ${e.status}; response was ${e.responseText}`);
			return this._deferred.reject(new Error("An invalid response was received from the Zotero server"));
		}.bind(this));
		return this._deferred.promise;
	};
	
	/**
	 * Called when OAuth is complete
	 * @param {String} data The query string received from OAuth
	 * @param {Tab} tab The object corresponding to the tab where OAuth completed
	 */
	this.onAuthorizationComplete = async function(data, tab) {
		// close auth window
		// ensure that tab close listeners don't have a promise they can reject
		// this is kinda awful.
		let deferred = this._deferred;
		this._deferred = null;
		if(Zotero.isBrowserExt) {
			browser.tabs.remove(tab.id);
		} else if (Zotero.isSafari) {
			Zotero.Connector_Browser.closeTab(tab);
		}
		
		if(!_tokenSecret) {
			throw new Error("onAuthenticationComplete called with no outstanding OAuth request");
		}
		
		var oauthSimple = new OAuthSimple(config.OAUTH.ZOTERO.CLIENT_KEY,
			config.OAUTH.ZOTERO.CLIENT_SECRET);
		oauthSimple.setURL(config.OAUTH.ZOTERO.ACCESS_URL);
		oauthSimple.setParameters(_decodeFormData(data));
		oauthSimple.signatures({oauth_token_secret: _tokenSecret});
		oauthSimple.setAction("POST");
		_tokenSecret = undefined;

		let options = {
			body: '',
			headers: {"Authorization": oauthSimple.getHeaderString()}
		};
		try {
			var xmlhttp = await Zotero.HTTP.request("POST", config.OAUTH.ZOTERO.ACCESS_URL, options)
		}
		catch(e) {
			Zotero.logError(`OAuth access failed with ${e.status}; response was ${e.responseText}`);
			return deferred.reject(new Error("An invalid response was received from the Zotero server"));
		}
		data = _decodeFormData(xmlhttp.responseText);

		let keysUrl = config.API_URL+"users/"+encodeURI(data['auth-userID']) + "/keys/current";
		xmlhttp = await Zotero.HTTP.request("GET", keysUrl, {
			headers: {
				"Zotero-API-Key": data.oauth_token_secret,
				"Zotero-API-Version": "3"
			}
		});
		try {
			var json = JSON.parse(xmlhttp.responseText),
				access = json.access;
		} catch(e) {};
		
		let responseText = xmlhttp.responseText.replace(data.oauth_token_secret, '[API_KEY_HIDDEN]');

		if(!access || !access.user) {
			Zotero.logError("Key verification failed with "+xmlhttp.status+'; response was '+responseText);
			Zotero.logError("Key verification failed with "+xmlhttp.status+'; response was '+xmlhttp.responseText);
			return deferred.reject(new Error("API key could not be verified"));
		}
		
		if(!access.user.library || !access.user.write) {
			Zotero.logError("Generated key had inadequate permissions; response was "+responseText);
			return deferred.reject(new Error("The key you have generated does not have adequate "+
				"permissions to save items to your Zotero library. Please try again "+
				"without modifying your key's permissions."));
		}
	
		Zotero.Prefs.set('auth-token', data.oauth_token);
		Zotero.Prefs.set('auth-token_secret', data.oauth_token_secret);
		Zotero.Prefs.set('auth-userID', data.userID);
		Zotero.Prefs.set('auth-username', data.username);
		
		return deferred.resolve({"auth-username": data.username, "auth-userID": data.userID});
	};
	
	this.onAuthorizationCancel = function() {
		if (this._deferred) {
			this._deferred.reject(new Error('Authorization cancelled.'));
		}
	};
	
	/**
	 * Clears OAuth credentials from storage
	 */
	this.clearCredentials = function() {
		let keys = ['auth-token', 'auth-token_secret', 'auth-userID', 'auth-username'];
		Zotero.Prefs.clear(keys);
		// TODO revoke key
	};
	
	/**
	 * Gets authorized username
	 * @param {Function} callback Callback to receive username (or null if none is define)
	 */
	this.getUserInfo = Zotero.Promise.method(function() {
		let keys = ['auth-token_secret', 'auth-userID', 'auth-username'];
		return Zotero.Prefs.getAsync(keys).catch(function() {
			return null;
		});
	});
	
	/**
	 * Creates a new item. In Safari, this runs in the background script. In Chrome, it
	 * runs in the injected script.
	 * @param {Object} payload Item(s) to create, in the object format expected by the server.
	 * @param {String|null} itemKey Parent item key, or null if a top-level item.
	 * @param {Boolean} [askForAuth] If askForAuth === false, don't ask for authorization if not 
	 *     already authorized.
	 */
	this.createItem = async function(payload, askForAuth) {
		var userInfo = await Zotero.API.getUserInfo();
		if(!userInfo) {
			if(askForAuth === false) {
				throw new Error("Not authorized");
			}
			return Zotero.API.authorize().then(function() {
				return Zotero.API.createItem(payload, false);
			}, function(e) {
				e.message = `Authentication failed: ${e.message}`;
				throw e;
			})
		}
		
		var url = config.API_URL + "users/" + userInfo['auth-userID'] + "/items";
		var options = {
			body: JSON.stringify(payload),
			headers: {
				"Content-Type": "application/json",
				"Zotero-API-Key": userInfo['auth-token_secret'],
				"Zotero-API-Version": "3"
			}
		};
		try {
			var xhr = await Zotero.HTTP.request("POST", url, options);
			return xhr.responseText;
		}
		catch(e) {
			if (askForAuth && e.status === 403) {
				return Zotero.API.createItem(payload, true);
			}
			Zotero.logError(e);
			throw e;
		};
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
			if(Zotero.isBrowserExt && !Zotero.isBookmarklet) {
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
		
		Zotero.API.getUserInfo().then(function(userInfo) {
			if(!userInfo) {
				// We should always have authorization credentials, since an item needs to
				// be created before we can upload data. Thus, this code is probably
				// unreachable, but it's here just in case.
				_dispatchAttachmentCallback(attachment.id, false, "No authorization credentials available");
				return;
			}
			
			var url = config.API_URL + "users/" + userInfo['auth-userID'] + "/items/" + attachment.key + "/file";
			let options = {
				body: data,
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					"If-None-Match": "*",
					"Zotero-API-Key": userInfo['auth-token_secret'],
					"Zotero-API-Version": "3"
				}
			};
			return Zotero.HTTP.request("POST", url, options).then(function(xmlhttp) {
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
				xhr.setRequestHeader("Zotero-API-Key", userInfo['auth-token_secret']);
				xhr.setRequestHeader("Zotero-API-Version", 3);
				xhr.onloadend = function() {
					if(this.status !== 200 && this.status !== 201) {
						var msg = this.status+" ("+this.responseText+")";
						_dispatchAttachmentCallback(attachment.id, false, msg);
						return;
					}
				
					// Upload complete; register it
					let options = {
						body: "upload="+response.uploadKey,
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							"If-None-Match": "*",
							"Zotero-API-Key": userInfo['auth-token_secret'],
							"Zotero-API-Version": "3"
						},
						successCodes: false
					};
					return Zotero.HTTP.request("POST", url, options).then(function(xmlhttp) {
						if (xmlhttp.status === 204) {
							Zotero.debug("OAuth: Upload registered");
							_dispatchAttachmentCallback(attachment.id, 100);
						} else {
							_dispatchAttachmentCallback(attachment.id, false, `${xmlhttp.status} (${xmlhttp.responseText})`);
							throw new Zotero.HTTP.StatusError(xmlhttp, url);
						}
					});
				};
				xhr.onprogress = function(event) {
					if(event.loaded == event.total) return;
					_dispatchAttachmentCallback(attachment.id, event.loaded/event.total*100);
				};
				xhr.setRequestHeader("Content-Type", response.contentType);
				xhr.send(uploadData.buffer);
			}, function(e) {
				_dispatchAttachmentCallback(attachment.id, false, `${e.status} (${e.responseText})`);
				throw (e);
			});
		});
	};
}