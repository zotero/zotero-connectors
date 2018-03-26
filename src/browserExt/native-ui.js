/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
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

window.Zotero.Extension = window.Zotero.Extension || {};

function _getTranslatorLabel(translator) {
	var translatorName = translator.label ? ` (${translator.label})` : '';
	return `Save to Zotero${translatorName}`;
}

Zotero.Extension.Button = {
	update: function(tab, tabInfo={}) {
		browser.browserAction.enable(tab.id);
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) return this.showFirstUseUI(tab);

		if (Zotero.Connector_Browser.isDisabledForURL(tab.url, true)) {
			this.showZoteroStatus();
			return;
		}
		
		if (tabInfo.isPDF) {
			this.showPDFIcon(tab);
		} else if (tabInfo.translators && tabInfo.translators.length) {
			this.showTranslatorIcon(tab, tabInfo.translators[0]);
		} else {
			// Not clear what to show while refreshing. Not changing anything is probably fine?
		}
	},

	onClick: async function(tab, tabInfo={}) {
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) {
			// Wait for response (i.e. click) before setting firstUse to false.
			await Zotero.Messaging.sendMessage("firstUse", null, tab);
			Zotero.Prefs.set('firstUse', false);
			Zotero.Connector_Browser.updateExtensionUI(tab);
		}
		// Priority here is important!
		else if (tabInfo.isPDF) {
			Zotero.Connector_Browser.saveAsWebpage(tab, tabInfo.frameId);
		}
		else if (tabInfo.translators && tabInfo.translators.length) {
			Zotero.Connector_Browser.saveWithTranslator(tab, 0);
		}
		// Nothing occurs on click if there's no tabInfo
	},
		
	showZoteroStatus: function(tabID) {
		Zotero.Connector.checkIsOnline().then(function(isOnline) {
			var icon, title;
			if (isOnline) {
				icon = "images/zotero-new-z-16px.png";
				title = "Zotero is Online";
			} else {
				icon = "images/zotero-z-16px-offline.png";
				title = "Zotero is Offline";
			}
			browser.browserAction.setIcon({
				tabId:tabID,
				path:icon
			});
			
			browser.browserAction.setTitle({
				tabId:tabID,
				title: title
			});
		});
		browser.browserAction.disable(tabID);
		browser.contextMenus.removeAll();
	},
		
	showFirstUseUI: function(tab) {
		var icon = `${Zotero.platform}/zotero-z-${window.devicePixelRatio > 1 ? 32 : 16}px-australis.png`;
		browser.browserAction.setIcon({
			tabId: tab.id,
			path: `images/${icon}`
		});
		browser.browserAction.setTitle({
			tabId: tab.id,
			title: "Zotero Connector"
		});
		browser.browserAction.enable(tab.id);
	},
		
	showTranslatorIcon: function(tab, translator) {
		var itemType = translator.itemType;
		
		browser.browserAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		browser.browserAction.setTitle({
			tabId:tab.id,
			title: _getTranslatorLabel(translator)
		});
	},
	
	showPDFIcon: function(tab) {
		browser.browserAction.setIcon({
			tabId: tab.id,
			path: browser.extension.getURL('images/pdf.png')
		});
		browser.browserAction.setTitle({
			tabId: tab.id,
			title: "Save to Zotero (PDF)"
		});
	}
};

Zotero.Extension.ContextMenu = {
	update: function(tab, tabInfo={}) {
		browser.contextMenus.removeAll();

		if (!Zotero.Connector_Browser.isDisabledForURL(tab.url, true)) {
			var showSaveMenu = tabInfo.isPDF || tabInfo.translators;
			if (showSaveMenu) {
				var saveMenuID;
				saveMenuID = "zotero-context-menu-save-menu";
				browser.contextMenus.create({
					id: saveMenuID,
					title: "Save to Zotero",
					contexts: ['all']
				});
			
				if (tabInfo.isPDF) {
					this.addPDFOption(saveMenuID);
				} else if (tabInfo.translators) {
					this.addTranslatorOptions(tabInfo.translators, saveMenuID);
					this.addAttachmentCheckboxOptions(saveMenuID);
				}
			}

			var showProxyMenu = !tabInfo.isPDF
				&& Zotero.Proxies.proxies.length > 0
				// Don't show proxy menu if already proxied
				&& !Zotero.Proxies.proxyToProper(tab.url, true);
			
			// If unproxied, show "Reload via Proxy" options
			if (showProxyMenu) {
				this.addProxyOptions(tab.url);
			}
		}
		
		if (Zotero.isFirefox) {
			this.addPreferencesOption();
		}
	},
	
	addTranslatorOptions: function(translators, parentID) {
		for (let i = 0; i < translators.length; i++) {
			browser.contextMenus.create({
				id: "zotero-context-menu-translator-save" + i,
				title: _getTranslatorLabel(translators[i]),
				onclick: function(info, tab) {
					Zotero.Connector_Browser.saveWithTranslator(tab, i);
				},
				parentId: parentID,
				contexts: ['page', 'browser_action']
			});
		}
	},
	
	addPDFOption: function(parentID) {
		browser.contextMenus.create({
			id: "zotero-context-menu-pdf-save",
			title: "Save to Zotero (PDF)",
			onclick: function(info, tab) {
				Zotero.Connector_Browser.saveAsWebpage(tab);
			},
			parentId: parentID,
			contexts: ['all']
		});
	},
	
	addAttachmentCheckboxOptions: function(parentID) {
		let includeSnapshots = Zotero.Prefs.get("automaticSnapshots");
		browser.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-attachment-options-separator",
			parentId: parentID,
			contexts: ['all']
		});
		browser.contextMenus.create({
			type: 'checkbox',
			id: "zotero-context-menu-snapshots-checkbox",
			title: "Include Snapshots",
			checked: includeSnapshots,
			onclick: function(info) {
				Zotero.Prefs.set('automaticSnapshots', info.checked);
			},
			parentId: parentID,
			contexts: ['all']
		});
	},
	
	addProxyOptions: function(url) {
		var parentID = "zotero-context-menu-proxy-reload-menu";
		browser.contextMenus.create({
			id: parentID,
			title: "Reload via Proxy",
			contexts: ['page', 'browser_action']
		});
		
		var i = 0;
		for (let proxy of Zotero.Proxies.proxies) {
			let name = proxy.toDisplayName();
			let proxied = proxy.toProxy(url);
			browser.contextMenus.create({
				id: `zotero-context-menu-proxy-reload-${i++}`,
				title: `Reload via ${name}`,
				onclick: function() {
					browser.tabs.update({ url: proxied });
				},
				parentId: parentID,
				contexts: ['page', 'browser_action']
			});
		}
	},
	
	/**
	 * Get the proxies to show for a given URL
	 *
	 * This filters the available proxies to skip non-HTTPS proxies for HTTPS URLs
	 */
	_getProxiesForURL: function(url) {
		var proxies = Zotero.Proxies.proxies;
		// If not an HTTPS site, return all proxies
		if (!url.startsWith('https:')) {
			return proxies;
		}
		// Otherwise remove non-HTTPS proxies
		return proxies.filter(proxy => proxy.scheme.startsWith('https:'));
	},
	
	addPreferencesOption: function() {
		browser.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-pref-separator",
			contexts: ['all']
		});
		browser.contextMenus.create({
			id: "zotero-context-menu-preferences",
			title: "Preferences",
			onclick: function() {
				browser.tabs.create({url: browser.extension.getURL('preferences/preferences.html')});
			},
			contexts: ['all']
		});
	},
};

})();
