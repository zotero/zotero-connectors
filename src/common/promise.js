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

/*
 * Polyfill some of bluebirds methods to retain code readability in shared
 * translator code.
 */

Zotero.Promise.method = function(fn) {
	return function() {
		try {
			var val = fn.apply(this, arguments);
			if (val && val.then) {
				return val;
			} else {
				return Promise.resolve(val);
			}
		} catch (e) {
			return Promise.reject(e);
		}
	}
};

Zotero.Promise.defer = function() {
	var deferred = {};
	deferred.promise = new Promise(function(resolve, reject) {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});
	return deferred;
}

Zotero.Promise.delay = function (timeout) {
	return new Promise(function (resolve) {
		setTimeout(resolve, timeout);
	});
}