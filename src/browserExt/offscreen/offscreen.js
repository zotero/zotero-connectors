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
 * Entrypoint for the MV3 offscreen page. MV3 service worker has no DOM, and we want to spawn
 * sandbox frames for each translate operation, which this does that.
 *
 * This script orchestrates establishing a message channel for message passing between the background
 * service worker and the offscreen translate host page. Also handles possible situations
 * where the background service worker gets killed, but the offscreen page stays alive.
 */
let managerMessaging;
const frameManager = Zotero.TranslateHostFrameManager;

async function init() {
	console.log('Offscreen: initializing translate host frame manager messaging');
	let messageChannel = new MessageChannel();
	let options = {
		functionOverrides: FRAME_MANAGER_FUNCTIONS,
		handlerFunctionOverrides: FRAME_MANAGER_MESSAGE_FUNCTIONS,
		overrideTarget: Zotero,
		sendMessage: (...args) => messageChannel.port1.postMessage(args),
		addMessageListener: fn => {
			messageChannel.port1.onmessage = (event) => fn(event.data);
		}
	};
	if (managerMessaging) {
		managerMessaging.reinit(options);
	}
	else {
		managerMessaging = new Zotero.MessagingGeneric(options);
	}

	const backgroundServiceWorker = await navigator.serviceWorker.ready;
	backgroundServiceWorker.active.postMessage('offscreen-port', [messageChannel.port2]);
	console.log('Offscreen: messaging port posted');
	await managerMessaging.sendMessage('TranslateHostFrameManager.initialized');
}

document.addEventListener('DOMContentLoaded', () => init());

navigator.serviceWorker.onmessage = async (e) => {
	if (e.data !== 'service-worker-restarted') return;
	console.log('Offscreen: owner service worker restarted. reinitializing messaging');
	await init();
};
