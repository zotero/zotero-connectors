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
 * Creates a new frame managed by Zotero. Frames can optionally establish promise-based messaging
 * over a MessageChannel.
 */
Zotero.Frame = class ZoteroFrame {
	/**
	 * @param attributes {Object} Frame attributes.
	 * @param style {Object} CSSStyleDeclaration-type styles for the frame.
	 * @param messagingOptions {Object} If provided, sets up frame messaging. See messagingGeneric.js.
	 */
	constructor(attributes = {}, style = {}, messagingOptions) {
		if (!attributes.src) throw new Error('Attempted to construct a Zotero frame with no src attribute');
		this.nonce = Zotero.Utilities.randomString(16);
		this._initializedPromise = this._init(attributes, style, messagingOptions);
		this.initializedPromise = this._initializedPromise;
	}

	get frame() {
		return this._frame;
	}

	get contentWindow() {
		return this._frame?.contentWindow;
	}

	get src() {
		return this._frame?.src;
	}

	/**
	 * @returns {Promise} Resolves when the frame and any configured messaging are initialized.
	 */
	async init() {
		return this._initializedPromise;
	}

	async _init(attributes = {}, style = {}, messagingOptions) {
		attributes = Object.assign({
			id: Zotero.Utilities.randomString(),
			frameborder: '0'
		}, attributes);
		// Used to authenticate both Safari content-frame messaging and MessageChannel setup.
		attributes.src = this._addNonceToURL(attributes.src);

		// Making the frame less visible to website code via a closed shadow DOM
		// See https://stackoverflow.com/a/68689866
		this.parentDiv = document.createElement('div');
		const root = this.parentDiv.attachShadow({ mode: 'closed' });

		this._frame = document.createElement('iframe');
		root.appendChild(this._frame);
		this._setFrameAttributes(attributes, style);
		Zotero.Messaging.registerFrame?.(this);
		await new Promise((resolve, reject) => {
			this._frame.onload = resolve;
			this._frame.onerror = reject;
			(document.body || document.documentElement)?.appendChild(this.parentDiv);
		});

		if (messagingOptions) {
			await this._initMessaging(messagingOptions);
		}
	}

	_addNonceToURL(src) {
		let url = new URL(src, window.location.href);
		url.hash = encodeURIComponent(this.nonce);
		return url.href;
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
		Zotero.Messaging.unregisterFrame?.(this);
		this.parentDiv?.parentNode?.removeChild(this.parentDiv);
	}

	async _initMessaging(messagingOptions) {
		if (!messagingOptions.sendMessage) {
			const mc = new MessageChannel();
			this._frame.contentWindow.postMessage('zoteroChannel', '*', [mc.port2]);
			let response = await new Promise(cb => { mc.port1.onmessage = cb; });
			mc.port1.onmessage = null;
			if (response.data !== this.nonce) {
				throw new Error('Zotero.Frame: Invalid messaging nonce');
			}
			// Established an authenticated two-way messaging channel at this point
			messagingOptions.sendMessage = (...args) => {
				mc.port1.postMessage(args);
			};
			messagingOptions.addMessageListener = (fn) => {
				mc.port1.onmessage = (e) => fn(e.data);
			};
		}
		this._messaging = new Zotero.MessagingGeneric(messagingOptions);
		this.addMessageListener = this._messaging.addMessageListener.bind(this._messaging);
		this.sendMessage = this._messaging.sendMessage.bind(this._messaging);
	}
};
