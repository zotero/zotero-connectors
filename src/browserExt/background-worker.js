/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Center for History and New Media
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

// This is the Chrome MV3 background worker entrypoint script

// No way to inspect service-worker startup issues
// See https://groups.google.com/a/chromium.org/g/chromium-extensions/c/lLb3EJzjw0o
try {
	var scriptsToImport = [
		/*BACKGROUND SCRIPTS*/,
		"keep-mv3-alive.js",
		"background.js"
	];

	for (let script of scriptsToImport) {
		self.importScripts('./'+script);
	}
} catch (e) {
	console.error(e);
}
