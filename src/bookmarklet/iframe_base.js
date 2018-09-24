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
	/**
	 * Performs authorization
	 * @param {Function} callback Callback to execute when auth is complete. The first argument
	 *                            passed to the callback indicates whether authorization succeeded
	 *                            successfully. The second will be either a string error message
	 *                            (if authorization failed) or the username (if authorization 
	 *                            succeeded)
	 */
	this.authorize = function() {return new Zotero.Promise(function(resolve, reject) {
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
			if(win.location.href === ZOTERO_CONFIG.AUTH_COMPLETE_URL) {
				// Authorization should be done
				var c = _getCredentials(win.document ? win.document : document),
					userID = c[0], sessionToken = c[1];
				if(!userID || !sessionToken) {
					if(!userID) {
						var str = "User ID";
					} else if(!sessionToken) {
						var str = "Session token";
					} else {
						var str = "User ID and session token";
					}
					str += " not available";
					return reject(new Error(str));
				}
				
				Zotero.Messaging.sendMessage("hideZoteroIFrame", null);
				document.body.removeChild(iframe);
				return resolve([userID, sessionToken]);
			}
		};
		
		document.body.appendChild(iframe);
		Zotero.Messaging.sendMessage("revealZoteroIFrame", null);
	})};
	
	/**
	 * Creates a new item
	 * @param {Object} payload Item(s) to create, in the object format expected by the server.
	 * @param {String|null} itemKey Parent item key, or null if a top-level item.
	 * @param {Boolean} [askForAuth] If askForAuth === false, don't ask for authorization if not 
	 *     already authorized.
	 */
	this.createItem = async function(payload, askForAuth) {
		var [userID, sessionToken] = _getCredentials(document);
		
		if((!userID || !sessionToken)) {
			if (askForAuth !== false) {
				[userID, sessionToken] = await Zotero.API.authorize();
				askForAuth = false;
			} else {
				throw new Error("Not authorized");
			}
		}
		
		var url = ZOTERO_CONFIG.API_URL+"users/"+userID+"/items?session="+sessionToken;
		try {
			let xmlhttp = await Zotero.HTTP.request('POST', url, {
				body: JSON.stringify(payload), 
				headers: {
					"Content-Type": "application/json",
					"Zotero-API-Version":"3"
				}
			});
			return xmlhttp.responseText;
		} catch (e) {
			if (e.status == 403 && askForAuth !== false) {
				Zotero.debug("API request failed with 403 ("+xmlhttp.responseText+"); reauthorizing");
				return this.createItem(payload, askForAuth);
			}
			throw (e);
		}
	};
	
	/**
	 * Uploads an attachment to the Zotero server
	 * @param {Object} attachment An attachment object. This object must have the following keys<br>
	 *     id - a unique identifier for the attachment used to identifiy it in subsequent progress
	 *          messages<br>
	 *     data - the attachment contents, as a typed array<br>
	 *     filename - a filename for the attachment<br>
	 *     key - the attachment item key<br>
	 *     md5 - the MD5 hash of the attachment contents<br>
	 *     mimeType - the attachment MIME type
	 */
	this.uploadAttachment = function(attachment) {
		const REQUIRED_PROPERTIES = ["id", "data", "filename", "key", "md5", "mimeType"];
		for(var i=0; i<REQUIRED_PROPERTIES.length; i++) {
			if(!attachment[REQUIRED_PROPERTIES[i]]) {
				_dispatchAttachmentCallback(attachment.id, false,
					'Required property "'+REQUIRED_PROPERTIES[i]+'" not defined');
			}
		}
		
		if(/[^a-zA-Z0-9]/.test(attachment.key)) {
			_dispatchAttachmentCallback(attachment.id, false, 'Attachment key is invalid');
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
		
		var c = _getCredentials(document), userID = c[0], sessionToken = c[1];
		var url = ZOTERO_CONFIG.API_URL+"users/"+userID+"/items/"+attachment.key+"/file?session="+sessionToken;
		
		Zotero.HTTP.doPost(url, data,
			function(xmlhttp) {
				if(xmlhttp.status !== 200) {
					var msg = xmlhttp.status+" ("+xmlhttp.responseText+")";
					_dispatchAttachmentCallback(attachment.id, false, msg);
				}
				
				try {
					var response = JSON.parse(xmlhttp.responseText);
				} catch(e) {
					_dispatchAttachmentCallback(attachment.id, false, "Error parsing JSON from server");
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
				
				Uploader.upload(response.contentType, uploadData, function(status, error) {
					if(status === 100) {
						// Upload complete; register it
						Zotero.HTTP.doPost(url, "upload="+response.uploadKey, function(xmlhttp) {
							if(xmlhttp.status === 204) {
								Zotero.debug("OAuth: Upload registered");
								_dispatchAttachmentCallback(attachment.id, 100);
							} else {
								var msg = "API request failed with "+xmlhttp.status+" ("+xmlhttp.responseText+")";
								_dispatchAttachmentCallback(attachment.id, false, msg);
							}
						}, {
							"Content-Type":"application/x-www-form-urlencoded",
							"If-None-Match":"*"
						});
					} else {
						// Upload progress/error
						_dispatchAttachmentCallback(attachment.id, status, error);
					}
				});
			},
			{
				"Content-Type":"application/x-www-form-urlencoded",
				"If-None-Match":"*",
				"Zotero-API-Version":"2"
			});
		Uploader.init();
	};
	
	/**
	 * Extracts credentials from cookies
	 */
	var userID, sessionToken;
	function _getCredentials(doc) {
		var cookies = doc.cookie.split(/ *; */);
		for(var i=0, n=cookies.length; i<n; i++) {
			var cookie = cookies[i],
				equalsIndex = cookie.indexOf("="),
				key = cookie.substr(0, equalsIndex);
			if (key === "zoteroUserInfo") {
				let val = decodeURIComponent(cookie.substr(equalsIndex+1));
				var m = /"userID";(?:s:[0-9]+:"|i:)([0-9]+)/.exec(val);
				if(m) userID = m[1];
				try {
					userID = JSON.parse(val).userID;
				} catch (e) {}
			} else if (key.indexOf("zotero_www_session") === 0) {
				sessionToken = cookie.substr(equalsIndex+1);
			} 
		}
		return [userID, sessionToken];
	}
	
	/**
	 * Dispatches an attachmentCallback message to the parent window
	 */
	function _dispatchAttachmentCallback(id, status, error) {
		Zotero.Messaging.sendMessage("attachmentCallback",
			(error ? [id, status, error.toString()] : [id, status]));
		if(error) throw error;
	}
	
	/**
	 * Loads an iframe on S3 to upload data
	 * @param {Function} [callback] Callback to be executed when iframe is loaded
	 */
	var Uploader = new function() {	
		var _uploadIframe,
			_waitingForUploadIframe,
			_attachmentCallbacks = [];
		
		this.init = function() {
			if(_uploadIframe) return;
			Zotero.debug("OAuth: Loading S3 iframe");
			
			_waitingForUploadIframe = [];
			
			_uploadIframe = document.createElement("iframe");
			_uploadIframe.src = ZOTERO_CONFIG.S3_URL+"bookmarklet_upload.html";
			
			var listener = function(event) {
				if(event.source != _uploadIframe.contentWindow) return;
				if(event.stopPropagation) {
					event.stopPropagation();
				} else {
					event.cancelBubble = true;
				}
				
				var data = event.data;
				if(_waitingForUploadIframe) {
					Zotero.debug("OAuth: S3 iframe loaded");
					// If we were previously waiting for this iframe to load, call callbacks
					var callbacks = _waitingForUploadIframe;
					_waitingForUploadIframe = false;
					for(var i=0; i<callbacks.length; i++) {
						callbacks[i]();
					}
				} else {
					// Otherwise, this is a callback for a specific attachment
					_attachmentCallbacks[data[0]](data[1], data[2]);
					if(data[1] === false || data[1] === 100) {
						delete _attachmentCallbacks[data[0]];
					}
				}
			};
			
			if(window.addEventListener) {
				window.addEventListener("message", listener, false);
			} else {
				window.attachEvent("message", function() { listener(event) });
			}
			
			document.body.appendChild(_uploadIframe);
		}
		
		this.upload = function(contentType, data, progressCallback) {
			this.init();
			if(_waitingForUploadIframe) {
				_waitingForUploadIframe.push(
					function() { Uploader.upload(contentType, data, progressCallback); });
				return;
			}
			
			Zotero.debug("OAuth: Uploading attachment to S3");
			var id = Zotero.Utilities.randomString();
			_attachmentCallbacks[id] = progressCallback;
			_uploadIframe.contentWindow.postMessage({"id":id, "contentType":contentType,
				"data":data}, ZOTERO_CONFIG.S3_URL);
		}
	};
}

Zotero.isBookmarklet = true;
Zotero.Debug.init();
Zotero.Messaging.init();

var sessionID = Zotero.Utilities.randomString();
(async function() {
	let status = await Zotero.Connector.checkIsOnline();
	Zotero.debug("Sending translate message");
	Zotero.Messaging.sendMessage("translate", sessionID);
})();
