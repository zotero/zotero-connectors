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

/**
 * Creates a new frame managed by Zotero with promise-based messaging via window.postMessage
 */
class ZoteroFrame {
	/**
	 * @param attributes {Object} frame attributes.
	 * @param style {Object} CSSStyleDeclaration type style for the frame.
	 * @param messagingOptions {Object} If provided will set up frame messaging. See messagingGeneric.js
	 */
	constructor(attributes={}, style={}, messagingOptions) {
		if (!attributes.src) throw new Error("Attempted to construct a Zotero frame with no src attribute");
		this._initializedPromise = this._init(attributes, style, messagingOptions);
	}

	/**
	 * @returns {Promise} resolves when the frame messaging is initialized
	 */
	async init() {
		return this._initializedPromise;
	}
	
	async _init(attributes={}, style={}, messagingOptions) {
		attributes = Object.assign({
			id: Zotero.Utilities.randomString(),
			frameborder: "0"
		}, attributes);

		// Making the frame invisible to website code via a closed shadow DOM
		// See https://stackoverflow.com/a/68689866
		this.parentDiv = document.createElement('div');
		const root = this.parentDiv.attachShadow({mode: 'closed'});

		this._frame = document.createElement("iframe");
		this._frame.hidden = true;
		root.appendChild(this._frame);
		this._setFrameAttributes(attributes, style);
		await new Promise((resolve, reject) => {
			this._frame.onload = resolve;
			this._frame.onerror = reject;
			(document.body || document.documentElement)?.appendChild(this.parentDiv);
		});

		if (messagingOptions) {
			await this._initMessaging(messagingOptions);
		}
	}
	
	_setFrameAttributes(attributes, style) {
		for (let key in attributes) {
			if (this._frame.getAttribute(key) !== attributes[key]) {
				this._frame.setAttribute(key, attributes[key]);
			}
		}
		for (let key in style) {
			if (this._frame.style[key] !== style[key]) {
				this._frame.style[key] = style[key];
			}
		}
	}

	remove() {
		document.body?.removeChild(this._frame);
	}
	
	async _initMessaging(messagingOptions) {
		if (!messagingOptions.sendMessage) {
			const mc = new MessageChannel();
			// The webpage can technically capture this and snoop messages
			// but we're not sending any sensitive data anyway
			this._frame.contentWindow.postMessage("zoteroChannel", '*', [mc.port2]);
			await new Promise(cb => { mc.port1.onmessage = cb; });
			mc.port1.onmessage = null;
			// Established a 2-way secure messaging channel at this point
			
			messagingOptions.sendMessage = (...args) => {
				mc.port1.postMessage(args)
			};
			messagingOptions.addMessageListener = (fn) => {
				mc.port1.onmessage = (e) => fn(e.data);
			};
		}
		this._messaging = new Zotero.MessagingGeneric(messagingOptions);
		this.addMessageListener = this._messaging.addMessageListener.bind(this._messaging);
		this.sendMessage = this._messaging.sendMessage.bind(this._messaging)
	}
	
}

export default ZoteroFrame;