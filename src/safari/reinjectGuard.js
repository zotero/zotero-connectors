/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 Corporation for Digital Scholarship
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

(function() {
// Safari injects the extension's content scripts into already-loaded matching pages when the
// user grants new host permissions. The scripts run in the same content world as the first
// copy, which recreates the Zotero namespace and throws on top-level let and const
// redeclarations, breaking the page. Reload it for a clean single injection, which is also
// how Safari itself enables the extension on a page via the toolbar button.
//
// Safari can also inject the scripts twice while a page is loading, which a reload cannot
// fix, so reload only when the background page confirms that the user just granted a host
// permission, and never reload more than once a minute in a tab.
var RELOAD_INTERVAL = 60e3;

if (!document.documentElement.hasAttribute('data-zotero-connector-injected')) {
	document.documentElement.setAttribute('data-zotero-connector-injected', 'true');
	return;
}
console.warn('Zotero Connector: Duplicate content script injection detected');

async function permissionsRecentlyGranted() {
	if (await browser.runtime.sendMessage(['reinjectGuard.shouldReload', null])) {
		return true;
	}
	// The background page may not have registered the grant yet
	await new Promise(resolve => setTimeout(resolve, 3000));
	return browser.runtime.sendMessage(['reinjectGuard.shouldReload', null]);
}

permissionsRecentlyGranted().then(function(granted) {
	if (!granted) return;
	try {
		var lastReload = +sessionStorage.getItem('zotero-connector-reinject-reload') || 0;
		if (Date.now() - lastReload < RELOAD_INTERVAL) {
			return;
		}
		sessionStorage.setItem('zotero-connector-reinject-reload', Date.now());
	}
	catch (e) {}
	location.reload();
}, function() {});
})();
