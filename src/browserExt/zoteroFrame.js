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
	 * @property initializedPromise {Promise} resolves when the frame messaging is initialized
	 * @param attributes {Object} frame attributes.
	 * @param style {Object} CSSStyleDeclaration type style for the frame.
	 * @param messagingOptions {Object} If provided will set up frame messaging. See messagingGeneric.js
	 */
	constructor(attributes={}, style={}, messagingOptions) {
		if (!attributes.src) throw new Error("Attempted to construct a Zotero frame with no src attribute");
		attributes = Object.assign({
			id: Zotero.Utilities.randomString()
		}, attributes);
		this._frame = document.createElement("iframe");
		for (let key in attributes) {
			this._frame[key] = attributes[key];
		}
		for (let key in style) {
			this._frame.style[key] = style[key];
		}
		this._frame.setAttribute("frameborder", "0");

		if (!messagingOptions) {
			this.initializedPromise = Zotero.Promise.resolve();
		}
		else {
			this._initializedDeferred = Zotero.Promise.defer();
			this.initializedPromise = this._initializedDeferred.promise;
			this._initMessaging(messagingOptions);
		
			this.addMessageListener('frameReady', () => {
				this._initializedDeferred.resolve();
				return true;
			});
		}
		
		document.body.appendChild(this._frame);
	}

	remove() {
		document.body.removeChild(this._frame);
	}
	
	_initMessaging(messagingOptions) {
		if (!messagingOptions.sendMessage) {
			messagingOptions.sendMessage = (...args) => this._frame.contentWindow.postMessage(args, '*');
		}
		if (!messagingOptions.addMessageListener) {
			messagingOptions.addMessageListener = (fn) => window.addEventListener('message', (messageEvent) => {
				if (messageEvent.data && Array.isArray(messageEvent.data)) {
					fn(messageEvent.data);
				}
			});
		}
		this._messaging = new Zotero.MessagingGeneric(messagingOptions);
		this.addMessageListener = this._messaging.addMessageListener.bind(this._messaging);
		this.sendMessage = this._messaging.sendMessage.bind(this._messaging)
	}
	
}
