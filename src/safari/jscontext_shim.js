/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2019 Center for History and New Media
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

// These are shims to bring the Apple JSContext running in Swift
// closer to what a real browser is so that we can run our global page properly

const consFuncs = ['log', 'info', 'error', 'warn'];
for (const prop of consFuncs) {
	if (typeof console[prop] == "undefined") continue;
	const func = console[prop];
	console[prop] = function() {
		func.apply(this, arguments);
		typeof _consoleLog != "undefined" && _consoleLog(`console.${prop}: ` + arguments[0]);
	}
}

// Default variable name for "the global" variable in the JSContext
var window = globalThis;
