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
Zotero.ui = Zotero.ui || {};

/**
 * @param {String} text notification text
 * @param {Object[]} buttons (right to left)
 * 	- {String} title
 * 	- {Function} onClick
 * 	- {Boolean} dismiss	- whether the button click dismisses/removes the notification
 * @constructor
 */
Zotero.ui.Notification = function(text, buttons) {
	this.text = text;
	if (!buttons) {
		buttons = [{
			title: "Dismiss",
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

Zotero.ui.Notification.rootStyle = {
	position: (Zotero.isIE && document.compatMode === "BackCompat" ? "absolute" : "fixed"),
	top: "0", left: "0", width: "100%", 
	backgroundColor: "rgb(210, 82, 77)", color: "#fafafa",
	zIndex: "16777269", padding: "12px 10%", minHeight: "40px",
	display: "flex", flexDirection: "row", alignItems: "center",
	boxSizing: "border-box"
};

Zotero.ui.Notification.textStyle = {
	fontFamily: "Lucida Grande, Tahoma, sans", fontSize: "16px", lineHeight: "1.4em", 
};

Zotero.ui.Notification.buttonStyle = Object.assign({
	color: "#fafafa", fontWeight: "bold", padding: "3px", textDecoration: "none", margin: "0",
	marginRight: "30px", whiteSpace: "nowrap"
}, Zotero.ui.Notification.textStyle);

Zotero.ui.Notification.prototype = {
	show: function() {
		if (this.deferred) return deferred.promise;
		this.deferred = Zotero.Promise.defer();
		var elem = doc.createElement('div');
		for (let param in Zotero.ui.Notification.rootStyle) 
			elem.style[param] = Zotero.ui.Notification.rootStyle[param];
		for (let param in Zotero.ui.Notification.textStyle)
			elem.style[param] = Zotero.ui.Notification.textStyle[param];
		this.elems.root = elem;
		elem.classList.add('zotero-notificaton');

		elem = doc.createElement('span');
		elem.innerHTML = this.text;
		elem.style.flexGrow = 1;
		elem.style.textAlign = "center";
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
			for (let param in Zotero.ui.Notification.buttonStyle)
				elem.style[param] = Zotero.ui.Notification.buttonStyle[param];
			this.elems.buttons.push(elem);
			this.elems.root.appendChild(elem);
			button.onClick && elem.addEventListener('click', button.onClick);

			elem = doc.createTextNode(button.title);
			this.elems.buttons[this.buttons.length-1-i].appendChild(elem);
		}
		
		doc.body.appendChild(this.elems.root);
		
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
