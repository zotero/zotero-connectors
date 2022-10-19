/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2020 Center for History and New Media
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

module.exports = function(filetext, config) {
	// Defaults to all false, so just need to set true flags in the build script
	config = Object.assign({
		firefox: false,
		safari: false,
		browserExt: false,
		manifestV3: false,
	}, config);
	for (let browserOption in config) {
		let value = config[browserOption];
		browserOption = browserOption[0].toUpperCase() + browserOption.slice(1);
		let regexp = new RegExp(`/\\* this\\.is${browserOption} = SET IN BUILD SCRIPT \\*/`);
		filetext = filetext.replace(regexp,
			`this.is${browserOption} = ${value}`)
	}
	return filetext
}
