/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2019 Center for History and New Media
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

const cssZoteroFrameDimmer = {
	background: "rgba(0, 0, 0, 0.5)",
	position: "fixed",
	top: "0px",
	bottom: "0px",
	left: "0px",
	right: "0px",
	zIndex: "16777270",
	height: "100%",
	width: "100%",
	filter: "alpha(opacity = 50);"
};
const cssZoteroFrame = {
	borderStyle: "none",
	position: "fixed",
	zIndex: "16777271",
	top: "50%",
	left: "50%",
	background: "white",
	display: "block"
};

/**
 * Creates a new frame with the specified width and height
 * @constructor
 */
class ZoteroFrame {
	constructor(url, width, height) {
		// Make sure iframe is not bigger than window
		height = Math.min(window.innerHeight-10, height);
		width = Math.min(window.innerWidth-10, width);
		
		this._dimmer = document.createElement("div");
		for (let key in cssZoteroFrameDimmer) {
			this._dimmer.style[key] = cssZoteroFrameDimmer[key];
		}
		document.body.appendChild(this._dimmer);
		
		// Add iframe
		this._frame = document.createElement("iframe");
		this._frame.src = url;
		for (let key in cssZoteroFrame) this._frame.style[key] = cssZoteroFrame[key];
		this._frame.style.margin = "-"+height/2+"px 0 0 -"+width/2+"px";
		this._frame.style.width = width+"px";
		this._frame.style.height = height+"px";
		this._frame.setAttribute("frameborder", "0");
		
		this._dimmer.appendChild(this._frame);
	}
	
	remove() {
		document.body.removeChild(this._dimmer);
	}
}

Zotero.Inject.onSafariSelect = async function(items) {
	var frame = new ZoteroFrame(`${safari.extension.baseURI}safari/`+"itemSelector/itemSelector.html#"
			+encodeURIComponent(JSON.stringify([null, items])), 600, 350);
	
	let deferred = Zotero.Promise.defer();
	Zotero.Inject._selectCallback = deferred.resolve;
	let returnItems = await deferred.promise;
	frame.remove();
	return returnItems
}

// BrowserExt handles these in the background page
window.addEventListener('focus', function() {
	Zotero.Connector.reportActiveURL(document.location.href);
	Zotero.Connector_Browser.onTabFocus();
}, true);

var isTopWindow = false;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {}
}

if (isTopWindow) {
	setInterval(() => safari.extension.dispatchMessage("ping", {}), 1000);
	
	window.addEventListener('popstate', function() {
		if (document.hasFocus()) {
			Zotero.Connector.reportActiveURL(document.location.href);
		}
	}, true);

	if (document.hasFocus()) {
		Zotero.Connector.reportActiveURL(document.location.href);
	}
	
	Zotero.Messaging.addMessageListener('buttonClick', function() {
		Zotero.Connector_Browser.onPerformCommand();
	});
	
	Zotero.Messaging.addMessageListener("selectDone", function(returnItems) {
		Zotero.Inject._selectCallback(returnItems);
	});
}
