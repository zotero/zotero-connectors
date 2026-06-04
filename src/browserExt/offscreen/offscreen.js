/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
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

/*
 * Entrypoint for offscreen page. Evals are disallowed here and we run them in a sandbox iframe instead.
 * 
 * This script orchestrates establishing a message channel for message passing between the background
 * page and the offscreen translate host page. Also handles possible situations where the background
 * service worker gets killed, but the offscreen page stays alive.
 * 
 * Content scripts then communicate with translate host
 * by message passing via background page.
 */

let offscreenTranslateHostReadyPromise = new Promise((resolve) => {
	self.onmessage = async (e) => {
		if (e.data === 'offscreen-translate-host-ready') {
			self.onmessage = null;
			resolve();
		}
	}
});

async function init() {
	console.log('Offscreen: awaiting offscreen translate host to be ready')
	await offscreenTranslateHostReadyPromise;
	
	let messageChannel = new MessageChannel();
	const iframe = document.querySelector('iframe');
	iframe.contentWindow.postMessage('offscreen-port', "*", [messageChannel.port1]);

	const backgroundServiceWorker = await navigator.serviceWorker.ready;
	backgroundServiceWorker.active.postMessage('offscreen-port', [messageChannel.port2]);
	console.log('Offscreen: messaging ports posted');
}

document.addEventListener('DOMContentLoaded', () => init());

navigator.serviceWorker.onmessage = async (e) => {
	if (e.data !== 'service-worker-restarted') return;
	console.log('Offscreen: owner service worker restarted. reinitializing messaging');
	await init();
};