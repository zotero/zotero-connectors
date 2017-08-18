/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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

var tabID;
var items;
var checkboxes = {};
var responseSent = false;

/**
 * Called when item selector is loaded
 */
function load() {
	// decode JSON-ized data regading items to save
	var queryArg = window.location.hash.substr(1);
	// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
	queryArg = queryArg.replace(/ZOTEROCOLON/g, '%3A');
	var data = JSON.parse(decodeURIComponent(queryArg));
	var itemSelector = document.getElementById('item-selector');
	
	tabID = data[0];
	items = data[1];
	
	// add checkboxes to selector
	for(var i in items) {
		var title, checked = false;
		if(items[i] && typeof(items[i]) == "object" && items[i].title !== undefined) {
			title = items[i].title;
			checked = !!items[i].checked;
		} else {
			title = items[i];
		}

		var item = document.createElement('div');
		item.setAttribute('class', 'item-description');
		item.setAttribute('class', 'item');
		
		var checkbox = document.createElement('input');
		checkbox.setAttribute('type', 'checkbox');
		if(checked) checkbox.setAttribute('checked', 1);
		item.appendChild(checkbox);
		checkboxes[i] = checkbox;
		
		var span = document.createElement('span');
		span.appendChild(document.createTextNode(title));
		if(span.addEventListener) {
			span.addEventListener("click", makeClickHandler(checkbox), false);
		} else {
			span.onclick = makeClickHandler(checkbox);
		}
		item.appendChild(span);
		
		itemSelector.appendChild(item);
	}
	
	window.onbeforeunload = cancel;
	
	// OK on Return, Cancel on Esc
	window.addEventListener("keydown", function (event) {
		if (event.keyCode == 13 || event.keyCode == 14) {
			ok();
		} else if (event.keyCode == 27) {
			cancel();
		}
	});
}

/**
 * Called when the "OK" button is pressed to save selected items
 */
function ok() {
	var newItems = {},
		selected = false;
	for(var i in checkboxes) {
		if(checkboxes[i].checked) {
			selected = true;
			newItems[i] = items[i];
		}
	}
	items = selected && newItems;
	sendMessage();
}

/**
 * Called when the "Cancel" button is pressed
 */
function cancel() {
	items = false;
	sendMessage();
}

/**
 * Sets the checked attribute of all checkboxes to a given value
 */
function setAllCheckStates(state) {
	for(var i in checkboxes) {
		checkboxes[i].checked = state;
	}
}

/**
 * Makes a closure for attaching event listeners to text
 */
function makeClickHandler(checkbox) {
	return function() { checkbox.checked = !checkbox.checked };
}

// "Inline JavaScript will not be executed." Thanks, Google, for this mess.
document.getElementById("select").onclick = function() { setAllCheckStates(true) };
document.getElementById("deselect").onclick = function() { setAllCheckStates(false) };
document.getElementById("ok").onclick = ok;
document.getElementById("cancel").onclick = cancel;
load();
