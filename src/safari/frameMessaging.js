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

// Safari tabs.sendMessage doesn't send messages to internal scripts
// so we work around it by using postMessage but we need to nonce-guard
// it so that web pages cannot hijack them
var frames = [];
var zoteroFrameNonce = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : null;

function sendMessageToZoteroFrame(frame, messageName, args) {
	return new Promise(function(resolve) {
		let responseId = Zotero.Utilities.randomString();
		let listener = function(event) {
			let msg = event.data;
			if (Array.isArray(msg)
					&& msg[0] == 'zotero-frame-response'
					&& msg[1] == frame.nonce
					&& msg[2] == responseId) {
				window.removeEventListener('message', listener);
				resolve(msg[3]);
			}
		};
		window.addEventListener('message', listener);
		frame.contentWindow.postMessage([
			'zotero-frame-message',
			frame.nonce,
			messageName,
			args,
			responseId
		], '*');
	});
}

Zotero.Messaging.registerFrame = function(frame) {
	if (frames.indexOf(frame) == -1) frames.push(frame);
};

Zotero.Messaging.unregisterFrame = function(frame) {
	let i = frames.indexOf(frame);
	if (i != -1) frames.splice(i, 1);
};

Zotero.Messaging.addMessageListener('zoteroFrame.sendMessage', function(args) {
	let [messageName, messageArgs] = args;
	if (!frames.length) return;
	return Promise.race(frames.map(frame => sendMessageToZoteroFrame(frame, messageName, messageArgs)));
});

window.addEventListener('message', async function(event) {
	let request = event.data;
	if (!zoteroFrameNonce
			|| !Array.isArray(request)
			|| request[0] != 'zotero-frame-message'
			|| request[1] !== zoteroFrameNonce) {
		return;
	}
	let result = await Zotero.Messaging.receiveMessage([request[2], request[3]]);
	if (request[4] && event.source) {
		event.source.postMessage(['zotero-frame-response', zoteroFrameNonce, request[4], result], '*');
	}
});
