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
	retrievePageData: async function() {
		try {
			// Call to background script to inject SingleFile
			await Zotero.Connector_Browser.injectSingleFile();

			// Set up the user script before running SingleFile
			Zotero.SingleFile.runUserScripts();

			Zotero.debug("SingleFile: Retrieving page data");
			let pageData = await singlefile.extension.getPageData(Zotero.SingleFile.CONFIG);
			Zotero.debug("SingleFile: Done retrieving page data");

			// Replace Uint8Array objects with a UUID and place the resources as top-
			// level Uint8Array objects ready for a multipart request. We can't convert
			// them to binary blobs yet because Chrome doesn't support moving binary
			// blobs from the injected page to the background.
			let form = {};
			function convertResources(resources) {
				Object.keys(resources).forEach((resourceType) => {
					resources[resourceType].forEach((data, index) => {
						// Frames have whole new set of resources
						// We handle these by recursion
						if (resourceType === "frames") {
							convertResources(resources[resourceType][index].resources);
							return;
						}
						// Some data is already encoded as string
						if (typeof data.content === "string") {
							return;
						}
						// For binary data, we replace the content with a
						// UUID and create a new part for the multipart
						// upload
						let uuid = 'binary-' + Zotero.Utilities.randomString();
						form[uuid] = data.content;
						resources[resourceType][index].content = uuid;
						resources[resourceType][index].binary = true;
					});
				});
			}
			convertResources(pageData.resources);
			
			Zotero.debug("SingleFile: Done encoding page data");
			return {
				pageData,
				form
			};
		} catch (e) {
			Zotero.debug("SingleFile: Error retrieving page data", 2);
			Zotero.debug(e.stack, 2);
			throw e;
		}
	}
};
