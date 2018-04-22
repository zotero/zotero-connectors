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
var win = Zotero.isBookmarklet ? window.parent : window,
	doc = Zotero.isBookmarklet ? window.parent.document : window.document;
win.Zotero = win.Zotero || {};
Zotero.UI = Zotero.UI || {};

/**
 * @param {String} text notification text
 * @param {Object[]} buttons (right to left)
 * 	- {String} title
 * 	- {Function} onClick
 * 	- {Boolean} dismiss	- whether the button click dismisses/removes the notification
 * @constructor
 */
Zotero.UI.Notification = function(text, buttons) {
	this.text = text;
	if (!buttons) {
		buttons = [{
			title: "✕",
			dismiss: true
		}]
	}
	for (let i = 0; i < buttons.length; i++) {
		let button = buttons[i];
		if (button.onClick && button.dismiss) {
			button.onClick = this.dismiss.bind(this, button.onClick, i);
		} else if (!button.onClick) {
			// if onClick undefined we dismiss
			button.onClick = this.dismiss.bind(this, null, i);
		}
	}
	this.buttons = buttons;
	this.elems = {};
};

// TODO: Put styles in a stylesheet that we insert, so we can use pseudo-classes properly, do proper
// resetting, etc.
Zotero.UI.Notification.rootStyle = {
	// Stay on top of other page elements
	position: "relative",
	zIndex: 2147483647,
	/* Copy the notification style from Firefox */
	background: "linear-gradient(#ffe13e, #ffc703)",
	color: "rgba(0,0,0,0.95)",
	borderBottom: "1px solid #bf8a01",
	padding: "3px 10px 4px",
	display: "flex",
	flexDirection: "row",
	alignItems: "center",
	boxSizing: "border-box",
	cursor: "default",
	transition: "margin-top 300ms, opacity 300ms"
};

Zotero.UI.Notification.textStyle = {
	fontFamily: "Lucida Grande, Tahoma, sans",
	fontSize: "8.5pt",
	lineHeight: "1.4em",
	fontWeight: "bold",
	color: "rgba(0,0,0,0.95)"
};

Zotero.UI.Notification.buttonStyle = Object.assign({
	padding: "3px",
	textDecoration: "none",
	margin: "0",
	marginLeft: "30px",
	whiteSpace: "nowrap"
}, Zotero.UI.Notification.textStyle);

Zotero.UI.Notification.prototype = {
	show: function() {
		if (this.deferred) return deferred.promise;
		this.deferred = Zotero.Promise.defer();
		var elem = doc.createElement('div');
		for (let param in Zotero.UI.Notification.rootStyle) {
			elem.style[param] = Zotero.UI.Notification.rootStyle[param];
		}
		for (let param in Zotero.UI.Notification.textStyle) {
			elem.style[param] = Zotero.UI.Notification.textStyle[param];
		}
		let margins = ['marginTop', 'marginRight', 'marginLeft'];
		let bodyStyle = getComputedStyle(doc.body);
		for (let margin of margins) {
			elem.style[margin] = '-' + bodyStyle[margin];
		}
		this.elems.root = elem;
		elem.classList.add('zotero-notificaton');

		elem = doc.createElement('span');
		elem.innerHTML = this.text;
		elem.style.flexGrow = 1;
		this.elems.text = elem;
		this.elems.root.appendChild(elem);

		elem = doc.createElement('span');
		elem.style.minWidth = "30px";
		this.elems.root.appendChild(elem);
		
		this.elems.buttons = [];
		for (let i = this.buttons.length-1; i >= 0; i--) {
			let button = this.buttons[i];
			elem = doc.createElement('a');
			elem.dataset.id = i;
			elem.setAttribute('href', 'javascript:void(0)');
			for (let param in Zotero.UI.Notification.buttonStyle) {
				elem.style[param] = Zotero.UI.Notification.buttonStyle[param];
			}
			for (let param in Zotero.UI.Notification.textStyle) {
				elem.style[param] = Zotero.UI.Notification.textStyle[param];
			}
			this.elems.buttons.push(elem);
			this.elems.root.appendChild(elem);
			button.onClick && elem.addEventListener('click', button.onClick);

			elem = doc.createTextNode(button.title);
			this.elems.buttons[this.buttons.length-1-i].appendChild(elem);
		}
		
		doc.body.insertBefore(this.elems.root, doc.body.firstChild);
		
		return this.deferred.promise;
	},
	
	dismiss: function(onClick, id) {
		onClick && onClick(this);
		if (!this.elems.root) return;
		doc.body.removeChild(this.elems.root);
		this.deferred.resolve(id);
		this.deferred = null;
	}
};
})();

window.addEventListener('load', function () {
	var style = document.createElement('style');
	style.type = 'text/css';
	style.innerHTML = `
	.zotero-notification a:hover { color: rgba(0,0,0,0.95) !important; }
	`;
	document.getElementsByTagName('head')[0].appendChild(style);
});
