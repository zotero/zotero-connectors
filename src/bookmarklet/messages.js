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
 * The MESSAGES array contains two levels. The first level is the NAMESPACE. The second level is the
 * METHOD. This sets up messaging so that a call to Zotero.NAMESPACE.METHOD(..., callback) in the 
 * injected script calls the same function on the global script, and when the global script calls
 * callback(data), the injected script calls callback(data).
 *
 * If the value in the JSON below is not false, then the function accepts a callback.
 *
 * In the bookmarklet, the following takes place:
 *  1. Injected script calls Zotero.NAMESPACE.METHOD(ARGS, CALLBACK)
 *  2. Injected script generates a REQUESTID from the current time, and adds CALLBACK to
 *     _callbacks indexed by REQUESTID
 *  3. Injected script sends message with name NAMESPACE+MESSAGE_SEPARATOR+METHOD and message
 *     [TABID, REQUESTID, [ARGS]]
 *  4. Iframe script receives message
 *  5. Iframe script executes Zotero.NAMESPACE.METHOD(ARGS, NEWCALLBACK, TABID)
 *  6. Zotero.NAMESPACE.METHOD calls its callback on the global side, with some CALLBACKDATA
 *  7. If MESSAGES[NAMESPACE][METHOD] has a preSend function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  8. Global script sends a message with name
 *     NAMESPACE+MESSAGE_SEPARATOR+METHOD+MESSAGE_SEPARATOR+"Response" and message
 *     [REQUESTID, CALLBACKDATA]
 *  9. Injected script receives message
 *  10. If MESSAGES[NAMESPACE][METHOD] has a postReceive function, this gets passed CALLBACKDATA
 *     and returns some result, which is used as the CALLBACKDATA below
 *  11. Injected script calls _callbacks[REQUESTID](CALLBACKDATA)
 *
 * See other messaging scripts for more details.
 */
window.MESSAGE_SEPARATOR = ".";
window.MESSAGES = {
	Translators: {
		get: {
			background: {
				preSend: function(translators) {
					return Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES);
				}
			},
			inject: {
				postReceive: function(translator) {
					return new Zotero.Translator(translator);
				}
			}
		},
		getAllForType: {
			background: {
				preSend: function(translators) {
					return Zotero.Translators.serialize(translators, TRANSLATOR_PASSING_PROPERTIES);
				},
			},
			inject: {
				postReceive: function(translators) {
					return translators.map(function(translator) {return new Zotero.Translator(translator)});
				}
			}
		},
		getWebTranslatorsForLocation: {
			background: {
				preSend: function(data) {
					return [Zotero.Translators.serialize(data[0], TRANSLATOR_PASSING_PROPERTIES), data[1]];
				}
			},
			inject: {
				postReceive: function(data) {
					// Deserialize to class objects
					data[0] = data[0].map((translator) => new Zotero.Translator(translator));
					data[1] = data[1].map((proxy) => proxy && new Zotero.Proxy(proxy));
					return [data[0], data[1]];
				}
			}
		},
	},
	Messaging: {
		sendMessage: true
	},
	Connector: {
		checkIsOnline: true,
		callMethod: true,
		callMethodWithCookies: true
	},
	API: {
		createItem: true,
		uploadAttachment: false
	}
};
