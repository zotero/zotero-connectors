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
function load(event) {
	// add event listeners for buttons
	document.getElementById('accept').addEventListener("click", accept, false);
	document.getElementById('cancel').addEventListener("click", cancel, false);
	
	// decode JSON-ized data regading items to save
	var queryArg = window.location.search.substr(1);
	var data = JSON.parse(decodeURIComponent(queryArg));
	var itemSelector = document.getElementById('item-selector');
	
	tabID = data[0];
	items = data[1];
	
	// add checkboxes to selector
	for(var i in items) {
		var item = document.createElement('div');
		item.setAttribute('class', 'item');
		
		var checkbox = document.createElement('input');
		checkbox.setAttribute('type', 'checkbox');
		item.appendChild(checkbox);
		checkboxes[i] = checkbox;
		
		var textDiv = document.createElement('div');
		textDiv.setAttribute('class', 'item-description');
		textDiv.appendChild(document.createTextNode(items[i]));
		textDiv.addEventListener("click", makeClickHandler(checkbox), false); 
		
		item.appendChild(textDiv);
		itemSelector.appendChild(item);
	}
}

/**
 * Called when the "OK" button is pressed to save selected items
 */
function accept() {
	var newItems = {};
	for(var i in checkboxes) {
		if(checkboxes[i].checked) {
			newItems[i] = items[i];
		}
	}
	items = newItems;
	sendMessage();
}

/**
 * Called when the "Cancel" button is pressed
 */
function cancel() {
	items = {};
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

window.addEventListener("load", load, false);
window.addEventListener("beforeunload", cancel, false);