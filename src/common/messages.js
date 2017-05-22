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
 * METHOD. This sets up messaging so that a call to Zotero.NAMESPACE.METHOD(..., callback) in the 
 * injected script calls the same function on the global script, and when the global script calls
 * callback(data), the injected script calls callback(data).
 * 
 * UPDATE Zotero 5.0:
 * Some shared translation code between connectors and Zotero client has been promisified. 
 * Thus all Zotero.NAMESPACE.METHOD calls also return a promise, which resolves with
 * the same value as the callback on the last argument of Zotero.NAMESPACE.METHOD(..., callback)
 *
 * If the value in the JSON below is not false, then the function accepts a callback.
 *
 * In Chrome, the message passing takes place according to the following sequence:
 *  1. Injected script calls Zotero.NAMESPACE.METHOD(ARGS, CALLBACK)
 *  2. Injected script sends [NAMESPACE+MESSAGE_SEPARATOR+METHOD, [ARGS]]
 *  3. Global script receives message
 *  4. Global script executes Zotero.NAMESPACE.METHOD(ARGS, NEWCALLBACK, TABID)
 *  5. Zotero.NAMESPACE.METHOD calls its callback on the global side, with some CALLBACKDATA
 *  6. If MESSAGES[NAMESPACE][METHOD] has a preSend function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  7. Global script sends CALLBACKDATA to injected script as message response
 *  8. Injected script receives message
 *  9. If MESSAGES[NAMESPACE][METHOD] has a postReceive function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  10. Injected script calls CALLBACK(CALLBACKDATA)
 *
 * In Safari, the following takes place:
 *  1. Injected script calls Zotero.NAMESPACE.METHOD(ARGS, CALLBACK)
 *  2. Injected script generates a REQUESTID from the current time, and adds CALLBACK to
 *     _safariCallbacks indexed by REQUESTID
 *  3. Injected script sends message with name NAMESPACE+MESSAGE_SEPARATOR+METHOD and message
 *     [TABID, REQUESTID, [ARGS]]
 *  4. Global script receives message
 *  5. Global script executes Zotero.NAMESPACE.METHOD(ARGS, NEWCALLBACK, TABID)
 *  6. Zotero.NAMESPACE.METHOD calls its callback on the global side, with some CALLBACKDATA
 *  7. If MESSAGES[NAMESPACE][METHOD] has a preSend function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  8. Global script sends a message with name
 *     NAMESPACE+MESSAGE_SEPARATOR+METHOD+MESSAGE_SEPARATOR+"Response" and message
 *     [REQUESTID, CALLBACKDATA]
 *  9. Injected script receives message
 *  10. If MESSAGES[NAMESPACE][METHOD] has a postReceive function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  11. Injected script calls _safariCallbacks[REQUESTID](CALLBACKDATA)
 *
 * See other messaging scripts for more details.
 */
const MESSAGE_SEPARATOR = ".";
var MESSAGES = {
	Translators: 
		{
			get: {
				background: {
					preSend: function(translators) {
						return [Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES)];
					}
				},
				inject: {
					postReceive: function(translator) {
						return [new Zotero.Translator(translator)];
					}
				}
			},
			getAllForType: {
				background: {
					preSend: function(translators) {
						return [Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES)];
					},
				},
				inject: {
					postReceive: function(translators) {
						return [translators.map(function(translator) {return new Zotero.Translator(translator)})];
					}
				}
			},
			getWebTranslatorsForLocation: {
				background: {
					preSend: function(data) {
						return [[Zotero.Translators.serialize(data[0], TRANSLATOR_PASSING_PROPERTIES), data[1]]];
					}
				},
				inject: {
					postReceive: function(data) {
						// Deserialize to class objects
						data[0] = data[0].map((translator) => new Zotero.Translator(translator));
						data[1] = data[1].map((proxy) => proxy && new Zotero.Proxy(proxy));
						return [[data[0], data[1]]];
					}
				}
			}
		},
	Debug: 
		{
			clear: false,
			log: {
				response: false,
				background: {
					minArgs: 4
				}
			},
			setStore: false
		},
	Connector: 
		{
			checkIsOnline: true,
			callMethod: true,
			callMethodWithCookies: true
		},
	Connector_Browser: 
		{
			onSelect: true,
			onPageLoad: false,
			onTranslators: false,
			injectScripts: true,
			firstSaveToServerPrompt: true,
			openTab: false,
			openPreferences: false
		},
	Connector_Debug: 
		{
			storing: true,
			get: true,
			count: true,
			submitReport: true
		},
	Errors: 
		{
			log: false,
			getErrors: true,
			sendErrorReport: true
		},
	Messaging: 
		{
			sendMessage: {
				response: false,
				background: {
					minArgs: 4
				}
			}
		},
	API: 
		{
			authorize: true,
			onAuthorizationComplete: false,
			clearCredentials: false,
			getUserInfo: true
		},
	Prefs: 
		{
			set: false,
			getAsync: true
		},
	Proxies: 
		{
			loadPrefs: false,
			save: false,
			remove: false
		},
	Repo: 
		{
			getTranslatorCode: true,
			update: false
		}
};

MESSAGES["COHTTP"] = {
	doGet: {
		callbackArg: 1,
		background: {
			// avoid trying to post responseXML
			preSend: function(xhr) {
				return [{responseText: xhr.responseText,
					status: xhr.status,
					statusText: xhr.statusText}];
			},
		},
	},
	doPost: {
		callbackArg: 2,
		background: {
			// avoid trying to post responseXML
			preSend: function(xhr) {
				return [{responseText: xhr.responseText,
					status: xhr.status,
					statusText: xhr.statusText}];
			},
		}
	}
};

if(Zotero.isSafari) {
	MESSAGES["API"]["createItem"] = true;
	MESSAGES["API"]["uploadAttachment"] = false;
}