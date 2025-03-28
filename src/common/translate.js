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


/**
 * Override to pass itemType to the Connector ItemSaver
 */
Zotero.Translate.Web.prototype._prepareTranslation = Zotero.Promise.method(function () {
	this._itemSaver = new Zotero.Translate.ItemSaver({
		libraryID: this._libraryID,
		collections: this._collections,
		itemType: this._currentTranslator.itemType,
		attachmentMode: Zotero.Translate.ItemSaver[(this._saveAttachments ? "ATTACHMENT_MODE_DOWNLOAD" : "ATTACHMENT_MODE_IGNORE")],
		forceTagType: 1,
		sessionID: this._sessionID,
		cookieSandbox: this._cookieSandbox,
		proxy: this._proxy,
		baseURI: this.location
	});
	this.newItems = [];
});