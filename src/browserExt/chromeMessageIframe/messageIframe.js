/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
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

let port, messaging;

var Zotero = {};

window.onmessage = async (e) => {
	if (e.data === "zoteroChannel") {
		window.onmessage = null;
		port = e.ports[0];
		// Resolve ZoteroFrame._initMessaging()
		messaging = new Zotero.MessagingGeneric({
			sendMessage: (...args) => port.postMessage(args),
			addMessageListener: fn => port.onmessage = (e) => fn(e.data),
		});
		messaging.addMessageListener("sendToBackground", async (args) => {
			let swr = await navigator.serviceWorker.ready;
			let promise = new Promise((resolve, reject) => {
				navigator.serviceWorker.addEventListener("message", (e) => {
					if (!e.data.error) {
						resolve(e.data.result);
					} else {
						reject(e.data.error);
					}
				});
			});
			swr.active.postMessage({ type: "inject-message", args });
			return promise;
		});
		port.postMessage(null);
	}
};