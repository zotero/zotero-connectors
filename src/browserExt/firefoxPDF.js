/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Center for History and New Media
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

// Firefox currently does not allow to inject scripts into pdf pages
// This is a quick dirty fix for now, which initiates the pdf save from the bg page
// and changes the action button into a "tick.png" icon after the save is complete
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1454760#c3

if (Zotero.isFirefox) {
	Zotero.WebRequestIntercept.addListener('headersReceived', function(details) {
		if (!details.responseHeadersObject['content-type']
				|| !details.responseHeadersObject['content-type'].includes("application/pdf")
				// Proxy login is a POST method that gets redirected to the final destination via a 302
				|| (details.method != "GET" && details.statusCode < 300 && details.statusCode >= 400)) return;
		
		// Somehow browser.webNavigation.onCommitted runs later than headersReceived
		setTimeout(async function() {
			var tab = await browser.tabs.get(details.tabId);
			if (Zotero.Connector_Browser._tabInfo[tab.id]) {
				Zotero.Connector_Browser._tabInfo[tab.id].isPDF = true;
			} else {
				Zotero.Connector_Browser._tabInfo[tab.id] = {isPDF: true};
			}
			Zotero.Connector_Browser._updateExtensionUI(tab);
		}, 100);
	});
	
	Zotero.Utilities.saveFirefoxPDF = async function(tab) {
		var data = {
			url: tab.url,
			pdf: true
		};
		try {
			browser.browserAction.setIcon({
				tabId:tab.id,
				path: {
					'16': 'images/spinner-16px.png',
					'32': 'images/spinner-16px@2x.png'
				}
			});
			browser.browserAction.setTitle({
				tabId:tab.id,
				title: "Saving…"
			});
			
			await Zotero.Connector.callMethodWithCookies("saveSnapshot", data, tab);
			
			browser.browserAction.setIcon({
				tabId:tab.id,
				path: {
					'16': 'images/tick.png',
					'32': 'images/tick@2x.png'
				}
			});
			browser.browserAction.setTitle({
				tabId:tab.id,
				title: "Saved!"
			});
			Zotero.Connector_Browser._tabInfo[tab.id].isPDF = false;
		
		} catch (e) {
			Zotero.logError(e);
			
			browser.browserAction.setIcon({
				tabId:tab.id,
				path: "images/cross.png"
			});
			
			browser.browserAction.setTitle({
				tabId:tab.id,
				title: "Saving failed. Is Zotero running?"
			});
		}
	}
}