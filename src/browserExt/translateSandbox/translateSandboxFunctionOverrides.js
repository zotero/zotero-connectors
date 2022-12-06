/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
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

function serializeTranslator(translator, properties) {
	let serializedTranslator = {};
	for (let key in properties) {
		var property = properties[key];
		serializedTranslator[property] = translator[property];
	}
	return serializedTranslator;
}

const requestOverride = {
	handler: {
		// avoid trying to post responseXML
		preSend: async function(xhr) {
			return {
				response: xhr.response,
				responseText: xhr.response,
				responseURL: xhr.responseURL,
				responseType: xhr.responseType,
				status: xhr.status,
				statusText: xhr.statusText,
				responseHeaders: xhr.getAllResponseHeaders()
			};
		},
	},
	local: {
		postReceive: async function(xhr) {
			xhr.getAllResponseHeaders = () => xhr.responseHeaders;
			xhr.getResponseHeader = function(name) {
				let match = xhr.responseHeaders.match(new RegExp(`^${name}: (.*)$`, 'mi'));
				return match ? match[1] : null;
			};
			xhr.responseText = xhr.response;
			if (xhr.responseType == 'document') {
				let contentType = xhr.getResponseHeader("Content-Type");
				if (contentType != 'application/xml' && contentType != 'text/xml') {
					contentType = 'text/html';
				}
				let doc = new DOMParser().parseFromString(xhr.responseText, contentType);
				
				xhr = new Proxy(xhr, {
					get: function (target, name) {
						return name == 'response' ? doc : target[name];
					}
				});
			}
			return xhr;
		}
	}
}

const CONTENT_SCRIPT_FUNCTION_OVERRIDES = {
	'Translators.get': {
		handler: {
			preSend: async function(translator) {
				return serializeTranslator(translator, TRANSLATOR_PASSING_PROPERTIES);
			}
		},
		local: {
			postReceive: async function(translator) {
				return new Zotero.Translator(translator);
			}
		}
	},
	'Translators.getAllForType': {
		handler: {
			preSend: async function(translators) {
				return translators.map(t => serializeTranslator(t, TRANSLATOR_PASSING_PROPERTIES));
			},
		},
		local: {
			postReceive: async function(translators) {
				return translators.map(function(translator) {return new Zotero.Translator(translator)});
			}
		}
	},
	'Translators.getWebTranslatorsForLocation': {
		handler: {
			preSend: async function(data) {
				return [data[0].map(t => serializeTranslator(t, TRANSLATOR_PASSING_PROPERTIES)), data[1]];
			}
		},
		local: {
			postReceive: async function(data) {
				// Deserialize to class objects
				data[0] = data[0].map((translator) => new Zotero.Translator(translator));
				data[1] = data[1].map((proxy) => proxy && new Zotero.Proxy(proxy));
				return [data[0], data[1]];
			}
		}
	},
	'Translators.getCodeForTranslator': {
		local: {
			preSend: async function(args) {
				const translator = args[0];
				return [{ translatorID: translator.translatorID }];
			}
		},
	},
	'Debug.log': true,
	'debug': true,
	'getExtensionURL': true,
	'getExtensionVersion': true,
	'Errors.log': true,
	'Messaging.sendMessage': true,
	'Connector.checkIsOnline': true,
	'Connector.callMethod': true,
	'Connector.callMethodWithCookies': true,
	'Prefs.getAll': true,
	'Prefs.getAsync': true,
	'API.authorize': true,
	'API.onAuthorizationComplete': false,
	'API.clearCredentials': false,
	'API.getUserInfo': true,
	'API.run': true,
	'API.uploadAttachment': true,
	'SingleFile.retrievePageData': true,
	'COHTTP.request': requestOverride,
	'HTTP.request': requestOverride,
};
