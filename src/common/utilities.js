
 /*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2016 Center for History and New Media
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

(function() {

"use strict";

Zotero.Utilities = Zotero.Utilities || {};

/**
 * Returns a function which will execute `fn` with provided arguments after `delay` miliseconds and not more
 * than once, if called multiple times. See 
 * http://stackoverflow.com/questions/24004791/can-someone-explain-the-debounce-function-in-javascript
 * @param fn {Function} function to debounce
 * @param delay {Integer} number of miliseconds to delay the function execution
 * @returns {Function}
 */
Zotero.Utilities.debounce = function(fn, delay) {
	var timer = null;
	return function () {
		let args = arguments;
		clearTimeout(timer);
		timer = setTimeout(function () {
			fn.apply(this, args);
		}.bind(this), delay);
	};
}

})();