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

// Safari doesn't implement webNavigation.onHistoryStateUpdated, so watch for
// same-document navigations here and report them to the background page, which
// re-runs translator detection. The Navigation API's currententrychange event
// covers all same-document navigations but is only available in Safari 26.2+.
// On older Safari, popstate and hashchange cover history traversals and
// fragment changes, but pushState/replaceState calls don't fire events and go
// undetected.
let lastReportedHistoryURL = document.location.href;

function reportHistoryStateUpdated() {
	// Coalesce rapid successive changes and read document.location after the
	// page is done updating it
	setTimeout(function() {
		let url = document.location.href;
		if (url === lastReportedHistoryURL) return;
		lastReportedHistoryURL = url;
		Zotero.Connector_Browser.onHistoryStateUpdated(url);
	});
}

if (window.navigation) {
	window.navigation.addEventListener('currententrychange', reportHistoryStateUpdated);
}
else {
	window.addEventListener('popstate', reportHistoryStateUpdated);
	window.addEventListener('hashchange', reportHistoryStateUpdated);
}
