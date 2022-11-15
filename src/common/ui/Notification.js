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
var win = window,
	doc = window.document;
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

// TODO: Convert to CE and put style in the shadow root
Zotero.UI.Notification.rootStyle = {
	// Stay on top of other page elements
	position: "fixed",
	top: 0,
	left: 0,
	zIndex: 2147483647,
	width: "100%",
	background: "rgb(255, 234, 80)",
	borderBottom: "#a9a9a9 .5px solid",
	padding: "3px 2em 4px",
	display: "flex",
	flexDirection: "row",
	lineHeight: "2.2em",
	alignItems: "center",
	boxSizing: "border-box",
	cursor: "default",
};

Zotero.UI.Notification.textStyle = {
	fontFamily: "Lucida Grande, Tahoma, sans",
	fontSize: "13.5px",
	fontWeight: "bold",
	color: "black",
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
