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
		return {
			status: xhr.status,
			arrayBuffer: async () => xhr.response,
			headers: { get: header => xhr.getResponseHeader(header) },
		}
	},
	
	retrievePageData: async function() {
		try {
			// Call to background script to inject SingleFile
			await Zotero.Connector_Browser.injectSingleFile();

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
	}
};

Zotero.SingleFile._injectSingleFileHooks();