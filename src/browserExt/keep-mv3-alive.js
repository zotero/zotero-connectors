/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Corporation for Digital Scholarship
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

//Based on
//https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/66618269#66618269

let lifeline;
keepAlive();

chrome.runtime.onConnect.addListener(port => {
	if (port.name === 'keepAlive') {
		lifeline = port;
		setTimeout(keepAliveForced, 295e3); // 5 minutes minus 5 seconds
		port.onDisconnect.addListener(keepAliveForced);
	}
});

function keepAliveForced() {
	lifeline?.disconnect();
	lifeline = null;
	keepAlive();
}

async function keepAlive() {
	if (lifeline) return;
	for (const tab of await chrome.tabs.query({ url: '*://*/*' })) {
		try {
			await chrome.scripting.executeScript({
				target: { tabId: tab.id },
				function: () => chrome.runtime.connect({ name: 'keepAlive' }),
				// `function` will become `func` in Chrome 93+
			});
			chrome.tabs.onUpdated.removeListener(retryOnTabUpdate);
			return;
		} catch (e) {}
	}
	chrome.tabs.onUpdated.addListener(retryOnTabUpdate);
}

async function retryOnTabUpdate(tabId, info, tab) {
	if (info.url && /^(file|https?):/.test(info.url)) {
		keepAlive();
	}
}
