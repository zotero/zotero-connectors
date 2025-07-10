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
 * The MESSAGES array contains two levels. The first level is the NAMESPACE. The second level is the
 * METHOD. This sets up messaging so that a call to Zotero.NAMESPACE.METHOD(...) in the 
 * injected script calls the same function on the global script.
 * 
 * In Chrome, the message passing takes place according to the following sequence:
 *  1. Injected script calls Zotero.NAMESPACE.METHOD(...ARGS)
 *  2. Injected script sends [NAMESPACE+MESSAGE_SEPARATOR+METHOD, [...ARGS]]
 *  3. Global script receives message
 *  4. Global script executes Zotero.NAMESPACE.METHOD(...ARGS, TAB, FRAME)
 *  5. Zotero.NAMESPACE.METHOD returns a value or promise RESPONSE
 *  6. If MESSAGES[NAMESPACE][METHOD] has a preSend function, the RESPONSE is processed
 *  	with the preSend function before sending the response off to injected page
 *  7. Global script responds with the RESPONSE
 *  8. Injected script receives message
 *  9. If MESSAGES[NAMESPACE][METHOD] has a postReceive function, this gets passed RESPONSE
 *     and returns some result, which is used as the RESPONSE below
 *  10. Injected script call Zotero.NAMESPACE.METHOD(...ARGS) resolves with RESPONSE
 *
 * In Safari, the following takes place:
 *  1. Injected script calls Zotero.NAMESPACE.METHOD(ARGS, CALLBACK)
 *  2. Injected script generates a REQUESTID from the current time, and adds CALLBACK to
 *     _safariCallbacks indexed by REQUESTID
 *  3. Injected script sends message with name NAMESPACE+MESSAGE_SEPARATOR+METHOD and message
 *     [TABID, REQUESTID, [ARGS]]
 *  4. Global script receives message
 *  5. Global script executes Zotero.NAMESPACE.METHOD(ARGS, NEWCALLBACK, TABID)
 *  6. Zotero.NAMESPACE.METHOD returns a value or promise RESPONSE
 *  7. If MESSAGES[NAMESPACE][METHOD] has a preSend function, the RESPONSE is processed
 *  	with the preSend function before sending the response off to injected page
 *  8. Global script sends a message with name
 *     NAMESPACE+MESSAGE_SEPARATOR+METHOD+MESSAGE_SEPARATOR+"Response" and message
 *     [REQUESTID, RESPONSE]
 *  9. Injected script receives message
 *  10. If MESSAGES[NAMESPACE][METHOD] has a postReceive function, this gets passed RESPONSE
 *     and returns some result, which is used as the RESPONSE below
 *  11. Injected script call Zotero.NAMESPACE.METHOD(...ARGS) resolves with RESPONSE
 *
 * See other messaging scripts for more details.
 */
const MESSAGE_SEPARATOR = ".";
var MESSAGES = {
	Translators: {
		updateFromRemote: true,
		get: {
			background: {
				preSend: async function(translators) {
					return Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES);
				}
			},
			inject: {
				postReceive: async function(translator) {
					return new Zotero.Translator(translator);
				}
			}
		},
		getAllForType: {
			background: {
				preSend: async function(translators) {
					return Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES);
				},
			},
			inject: {
				postReceive: async function(translators) {
					return translators.map(function(translator) {return new Zotero.Translator(translator)});
				}
			}
		},
		getWebTranslatorsForLocation: {
			background: {
				preSend: async function(data) {
					return [Zotero.Translators.serialize(data[0], TRANSLATOR_PASSING_PROPERTIES), data[1]];
				}
			},
			inject: {
				postReceive: async function(data) {
					// Deserialize to class objects
					data[0] = data[0].map((translator) => new Zotero.Translator(translator));
					data[1] = data[1].map((proxy) => proxy && new Zotero.Proxy(proxy));
					return [data[0], data[1]];
				}
			}
		},
		getCodeForTranslator: {
			inject: {
				preSend: async function(args) {
					const translator = args[0];
					return [{ translatorID: translator.translatorID }];
				}
			},
			background: {
				postReceive: async function(args) {
					let translatorInfo = args[0]
					return [await Zotero.Translators.getWithoutCode(translatorInfo.translatorID)];
				}
			}
		}
	},
	OffscreenManager: {
		sendMessage: true
	},
	Debug: {
		get: true,
		bgInit: false,
		clear: false,
		log: {
			response: false,
			background: {
				minArgs: 4
			}
		},
		setStore: false
	},
	Connector: {
		checkIsOnline: true,
		callMethod: true,
		callMethodWithCookies: true,
		saveSingleFile: {
			inject: {
				preSend: async function(args) {
					if (Zotero.isChromium) {
						args[1].snapshotContent = await Zotero.Messaging.sendAsChunks(args[1].snapshotContent);
					}
					return args;
				},
			},
			background: {
				postReceive: async function(args) {
					if (Zotero.isChromium) {
						args[1].snapshotContent = Zotero.Messaging.getChunkedPayload(args[1].snapshotContent);
					}
					return args;
				}
			}
		},
		getClientVersion: true,
		reportActiveURL: false,
		getPref: true
	},
	Connector_Browser: {
		onSelect: true,
		onPageLoad: false,
		onTranslators: {
			inject: {
				preSend: async function([translators, ...args]) {
					return [translators.map(t => t.serialize(TRANSLATOR_PASSING_PROPERTIES)), ...args]
				},
			}
		},
		injectScripts: true,
		injectSingleFile: true,
		isIncognito: true,
		newerVersionRequiredPrompt: true,
		openTab: false,
		openConfigEditor: false,
		openPreferences: false,
		bringToFront: true
	},
	Connector_Debug: {
		storing: true,
		get: true,
		count: true,
	},
	ItemSaver: {
		saveAttachmentToZotero: true,
		saveStandaloneAttachmentToZotero: true,
		saveAttachmentToServer: {
			inject: {
				preSend: async function(args) {
					if (Zotero.isChromium) {
						let attachment = args[0];
						if (typeof attachment.data === 'string' && attachment.mimeType === 'text/html') {
							attachment.data = await Zotero.Messaging.sendAsChunks(attachment.data);
						}
					}
					return args;
				},
			},
			background: {
				postReceive: async function(args, tab) {
					if (Zotero.isChromium) {
						let attachment = args[0];
						if (typeof attachment.data === 'string' && attachment.mimeType === 'text/html') {
							attachment.data = Zotero.Messaging.getChunkedPayload(attachment.data);
						}
					}
					args.push(tab);
					return args;
				}
			}
		}
	},
	Errors: {
		log: false,
		getErrors: true,
		getSystemInfo: true,
	},
	Messaging: {
		sendMessage: {
			background: {
				postReceive: async function(args, tab, frameId) {
					// Ensure arg[2] is the current tab
					if (args.length > 2) {
						args[2] = tab;
					} else {
						args.push(tab);
					}
					// If frameId not set then use the top frame
					if (args.length <= 3) {
						args.push(0);
					}
					return args;
				}
			},
		},
		receiveChunk: true
	},
	API: {
		authorize: true,
		onAuthorizationComplete: false,
		clearCredentials: false,
		getUserInfo: true,
		run: true,
		uploadAttachment: {
			inject: {
				preSend: async function(args) {
					args[0].data = packArrayBuffer(args[0].data);
					return args;
				}
			},
			background: {
				postReceive: async function(args) {
					args[0].data = await unpackArrayBuffer(args[0].data);
					return args;
				}
			}
		}
	},
	GoogleDocs_API: {
		onAuthComplete: false,
		run: {
			background: {minArgs: 3}
		},
		getDocument: true,
		batchUpdateDocument: true
	},
	Prefs: {
		set: false,
		getAll: true,
		getDefault: true,
		getAsync: true,
		removeAllCachedTranslators: true,
		clear: false
	},
	Proxies: {
		loadPrefs: false,
		save: false,
		remove: false,
		toggleRedirectLoopPrevention: false
	},
	WebRequestIntercept: {
		replaceUserAgent: true,
	},
	ContentTypeHandler: {
		handleImportableStyle: true,
		handleImportableContent: true,
		enable: false,
		disable: false,
	}
};

MESSAGES.COHTTP = {
	request: {
		background: {
			// avoid trying to post responseXML
			preSend: async function(xhr) {
				let result = {
					response: xhr.response,
					responseType: xhr.responseType,
					status: xhr.status,
					statusText: xhr.statusText,
					responseHeaders: xhr.getAllResponseHeaders(),
					responseURL: xhr.responseURL
				};
				if (result.response instanceof ArrayBuffer) {
					result.response = packArrayBuffer(xhr.response);
				}
				return result;
			},
		},
		inject: {
			postReceive: async function(xhr) {
				xhr.getAllResponseHeaders = () => xhr.responseHeaders;
				xhr.getResponseHeader = function(name) {
					let match = xhr.responseHeaders.match(new RegExp(`^${name}: (.*)$`, 'mi'));
					return match ? match[1] : null;
				};
				if (Array.isArray(xhr.response) && xhr.responseType === "arraybuffer" || (xhr.response.startsWith && xhr.response.startsWith('blob:'))) {
					xhr.response = await unpackArrayBuffer(xhr.response);
				} else {
					xhr.responseText = xhr.response;
				}
				return xhr;
			}
		}
	}
};

if (Zotero.isSafari) {
	MESSAGES.API.createItem = true;
	MESSAGES.API.uploadAttachment = false;
	MESSAGES.i18n = {
		getStrings: true
	};
	MESSAGES.Connector_Browser = Object.assign(MESSAGES.Connector_Browser, {
		onPDFFrame: false,
		onPerformCommand: false,
		onTabFocus: false,
		onTabData: true,
		getExtensionVersion: true
	});
}

// Chrome does not support passing arrayBuffers via the message
// passing protocol, so we convert it to a blob url and then unconvert it
// on the receiving end.
// There's been an open bug on the chrome bugtracker to fix this since
// 2013: https://bugs.chromium.org/p/chromium/issues/detail?id=248548
// 
// And with manifestV3 service workers do not support URL.createObjectURL
// so our best chance is to just pass the array bytes
// but there's a 64MB limit or Chrome literally crashes
const MAX_CONTENT_SIZE = 8 * (1024 * 1024);
function packArrayBuffer(arrayBuffer) {
	if (Zotero.isFirefox) return arrayBuffer;
	if (Zotero.isSafari) {
		// Base64 encode the arrayBuffer
		return Zotero.Utilities.Connector.arrayBufferToBase64(arrayBuffer);
	}
	if (Zotero.isManifestV3) {
		let array = Array.from(new Uint8Array(arrayBuffer));
		if (array.length > MAX_CONTENT_SIZE) {
			// Truncating to MAX_CONTENT_SIZE. The largest filetype we save is images, and
			// 8MB limit should be good for 99.9% of the cases.
			array = array.slice(0, MAX_CONTENT_SIZE);
		}
		return array;
	}
	return URL.createObjectURL(new Blob([arrayBuffer]));
}

async function unpackArrayBuffer(packedBuffer) {
	if (Zotero.isFirefox) return packedBuffer;
	if (Zotero.isSafari) {
		return Zotero.Utilities.Connector.base64ToArrayBuffer(packedBuffer);
	}
	if (Zotero.isManifestV3) {
		return new Uint8Array(packedBuffer).buffer
	}
	let blob = await (await fetch(packedBuffer)).blob();
	return new Promise((resolve) => {
		var fileReader = new FileReader();
		fileReader.onload = function(event) {
			resolve(event.target.result);
		};
		fileReader.readAsArrayBuffer(blob);
	});
}
