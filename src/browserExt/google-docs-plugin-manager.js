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

Zotero.GoogleDocsPluginManager = {
	backgroundScriptPaths: [ 'api.js' ],
	contentScriptPaths: [ "kixAddZoteroMenu.js", "client.js", 'document.js' ],
	uiScriptPaths: [ "ui.js" ],
	
	scriptContents: {},
	
	init: async function() {
		await this.fetchScripts();
		this.initNavigationMonitor();
		await this.loadBackgroundScripts();
	},
	
	version: null,
	
	// Firefox has a better API to register scripts for injection
	// with the same parameters and effects as registration in manifest.json
	// but unfortunately it's not available in chromium, so we'll be
	// injecting these scripts on a nav handler instead
	// See https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contentScripts/register
	// They need to be injected before GDocs own JS runs otherwise
	// the google's JS will fail to register menu/button handlers
	// on Zotero UI
	initNavigationMonitor: function() {
		browser.webNavigation.onCommitted.addListener(async (details) => {
			if (details.frameId !== 0 || !details.url.startsWith("https://docs.google.com/document/")) return;
			Zotero.debug("Injecting Google Docs content scripts into " + details.url);
			for (let path of this.contentScriptPaths) {
				if (Zotero.version === '4.999.0') {
					await browser.tabs.executeScript(details.tabId, {
						file: "zotero-google-docs-integration/" + path,
						frameId: 0,
						runAt: 'document_start'
					});
					continue;
				}
				try {
					await browser.tabs.executeScript(details.tabId, {
						code: this.scriptContents[path],
						frameId: 0,
						runAt: 'document_start'
					});
				}
				catch (e) {
					Zotero.debug(`Failed to inject Google Docs content script "${path}"`, 1);
					Zotero.logError(e);
				}
			}
		});
	},
	
	fetchScripts: async function() {
		try {
			let paths = this.backgroundScriptPaths.concat(this.contentScriptPaths, this.uiScriptPaths);
			
			// Initially load bundled scripts
			if (!Object.keys(this.scriptContents).length) {
				Zotero.debug(`Loading bundled Google Docs scripts ${JSON.stringify(paths)}`);
				this.scriptContents = await this._fetchScripts(browser.runtime.getURL('zotero-google-docs-integration') + '/', paths);

				// Set bundled scripts version
				let xhr = await Zotero.HTTP.request('GET',
					browser.runtime.getURL("zotero-google-docs-integration/package.json"));
				this.version = JSON.parse(xhr.responseText).version;
			}
			
			// Then fetch code from server
			let serverURL = Zotero.Prefs.get('integration.googleDocs.codeRepositoryURL');
			if (!serverURL) return;

			try {
				Zotero.debug("Checking for updated remote Google Docs scripts");
				
				let xhr = await Zotero.HTTP.request('GET', serverURL + "package.json");
				let serverVersion = JSON.parse(xhr.responseText).version;
				let serverHasNewerVersion = Zotero.Utilities.semverCompare(this.version, serverVersion) < 0;
				if (!serverHasNewerVersion) {
					Zotero.debug("Google Docs scripts are up to date");
					return;
				}
				this.version = serverVersion;
				
				Zotero.debug(`Fetching Google Docs scripts from ${serverURL}: ${JSON.stringify(paths)}`);
				this.scriptContents = await this._fetchScripts(serverURL, paths);
				Zotero.debug('Remote Google Docs scripts fetched, reloading');
				this.loadBackgroundScripts();
			}
			catch (e) {
				Zotero.debug('An error occurred while trying to fetch remote Google Docs scripts', 1);
				Zotero.logError(e);
			}
		}
		finally {
			(async () => {
				await Zotero.Promise.delay(Zotero.Prefs.get('integration.googleDocs.repoCheckInterval'));
				this.fetchScripts();
			})();
		}
	},
	
	_fetchScripts: async function(baseURL, paths) {
		let scriptContents = {};
		for (let path of paths) {
			let xhr = await Zotero.HTTP.request('GET', baseURL + path);
			scriptContents[path] = xhr.responseText;
		}
		return scriptContents;
	},
	
	loadBackgroundScripts: async function() {
		if (Zotero.version === '4.999.0') return;
		Zotero.debug(`Loading Google Docs background scripts: ${JSON.stringify(this.backgroundScriptPaths)}`);
		for (let path of this.backgroundScriptPaths) {
			try {
				eval(this.scriptContents[path]);
			}
			catch (e) {
				Zotero.debug(`Failed to load Google Docs background script "${path}"`, 1);
				Zotero.logError(e);
			}
		}
	},
	
	injectUI: async function(tab) {
		Zotero.debug("Injecting Google Docs UI scripts");
		for (let path of this.uiScriptPaths) {
			if (Zotero.version === '4.999.0') {
				await browser.tabs.executeScript(tab.id, {
					file: "zotero-google-docs-integration/" + path,
					frameId: 0,
					runAt: 'document_start'
				});
				continue;
			}	
			await browser.tabs.executeScript(tab.id, {
				code: this.scriptContents[path],
				frameId: 0,
				runAt: 'document_end'
			});
		}
	}
};
