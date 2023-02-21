/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2020 Corporation for Digital Scholarship
            Vienna, Virginia, USA
            https://www.zotero.org
    
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

Zotero.SingleFile = {
	backgroundFetch: async function(url, options = {}) {
		options.responseType = 'arraybuffer';
		let xhr = await Zotero.COHTTP.request("GET", url, options);
		if (Zotero.isSafari) {
			xhr.response = this._base64StringToUint8Array(xhr.response).buffer;
		}
		return {
			status: xhr.status,
			arrayBuffer: async () => xhr.response,
			headers: { get: header => xhr.getResponseHeader(header) },
		}
	},
	
	retrievePageData: async function() {
		try {
			if (typeof singlefile === 'undefined') {
				if (Zotero.isSafari) {
					await this._injectSingleFileSafari();
				} else {
					// Call to background script to inject SingleFile
					await Zotero.Connector_Browser.injectSingleFile();
				}
			}

			Zotero.debug("SingleFile: Retrieving page data");
			let pageData = await singlefile.getPageData(Zotero.SingleFile.CONFIG, {
				fetch: (...args) => Zotero.SingleFile.backgroundFetch(...args)
			});
			Zotero.debug("SingleFile: Done retrieving page data");

			return pageData.content;
		} catch (e) {
			Zotero.debug("SingleFile: Error retrieving page data", 2);
			Zotero.debug(e.stack, 2);
			throw e;
		}
	},
	
	// This file must be injected in the non-extension space for deferred image loading to work
	_injectSingleFileHooks: function() {
		const scriptElement = document.createElement("script");
		scriptElement.src = Zotero.getExtensionURL("lib/SingleFile/single-file-hooks-frames.js");
		scriptElement.async = false;
		(document.documentElement || document).appendChild(scriptElement);
		scriptElement.remove();
	},

	async _injectSingleFileSafari() {
		const singleFileScripts = ["lib/SingleFile/single-file-bootstrap.js", "lib/SingleFile/single-file.js"]
		for (let src of singleFileScripts) {
			let script = await Zotero.Messaging.sendMessage('Swift.getFileContents', [src]);
			// I'm not happy to do it this way, but the other option is to include singleFile with every
			// load and that doesn't seem better.
			eval(script);
		}
	},
	
	_base64StringToUint8Array(base64) {
		const text = atob(base64);
		const length = text.length;
		const bytes = new Uint8Array(length);
		for (let i = 0; i < length; i++) {
			bytes[i] = text.charCodeAt(i);
		}
		return bytes;
	}
};

if (window.top) {
	try {
		if (window.top == window) {
			Zotero.SingleFile._injectSingleFileHooks();
		}
	} catch(e) {};
}