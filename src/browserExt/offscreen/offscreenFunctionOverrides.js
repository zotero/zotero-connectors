/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
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
	for (let key of properties) {
		if (key === 'proxy' && translator[key]?.toJSON) {
			serializedTranslator[key] = translator[key].toJSON();
		}
		else {
			serializedTranslator[key] = translator[key];
		}
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
				if (!Zotero.HTTP.VALID_DOM_PARSER_CONTENT_TYPES.has(contentType)) {
					contentType = 'text/html';
				}
				let doc = new DOMParser().parseFromString(xhr.responseText, Zotero.HTTP.determineDOMParserContentType(contentType));
				
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

const OFFSCREEN_BACKGROUND_OVERRIDES = {
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
	'getVersion': true,
	'getExtensionURL': true,
	'Debug.log': true,
	'debug': true,
	'Errors.log': true,
	'Messaging.sendMessage': true,
	// Translator error reporting
	'Connector_Browser.isIncognito': true,
	'Prefs.getAll': true,
	'Prefs.getAsync': true,
	// Translator HTTP requests
	'COHTTP.request': requestOverride,
	'HTTP.request': requestOverride,
};
