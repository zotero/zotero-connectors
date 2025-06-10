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
var item_divs = {};
var responseSent = false;

/**
 * Called when item selector is loaded
 */
async function load() {
	Zotero.Messaging.init();
	await Zotero.i18n.init();

	// decode JSON-ized data regading items to save
	var queryArg = window.location.hash.substr(1);
	var data = JSON.parse(decodeURIComponent(queryArg));
	var itemSelector = document.getElementById('item-selector');
	
	tabID = data[0];
	items = data[1];
	
	// add checkboxes to selector
	let index = 0;
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
		checkbox.setAttribute('aria-labelledby', `item_${index}`);
		if(checked) checkbox.setAttribute('checked', 1);
		
		// Add event listener to reapply filter when checkbox state changes
		checkbox.addEventListener('change', setFilter);
		
		item.appendChild(checkbox);
		checkboxes[i] = checkbox;
		
		var span = document.createElement('span');
		span.appendChild(document.createTextNode(title));
		span.setAttribute("id", `item_${index}`);
		index++;
		if(span.addEventListener) {
			span.addEventListener("click", makeClickHandler(checkbox), false);
		} else {
			span.onclick = makeClickHandler(checkbox);
		}
		item.appendChild(span);
		
		item_divs[i] = item;
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
	
	Zotero.i18n.translateFragment(document);
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
		if (item_divs[i].style.display != "none") {
			checkboxes[i].checked = state;
		}
	}
	// Reapply filter after changing checkbox states
	setFilter();
}
/**
 * Hidden items that do not match `pattern`, except for checked items which are shown with grey text
 */
function setFilter() {
	pattern = document.getElementById('pattern').value;
	for(var i in item_divs) {
		var matched = pattern == "" || items[i].match(pattern) != null;
		var isChecked = checkboxes[i].checked;
		
		if (matched || isChecked) {
			item_divs[i].style.display = "";
			if (matched) {
				item_divs[i].classList.remove('filtered-out');
			} else {
				// Item is checked but doesn't match pattern - show with grey text
				item_divs[i].classList.add('filtered-out');
			}
		} else {
			// Item is not checked and doesn't match pattern - hide it
			item_divs[i].style.display = "none";
			item_divs[i].classList.remove('filtered-out');
		}
	}
}

/**
 * Makes a closure for attaching event listeners to text
 */
function makeClickHandler(checkbox) {
	return function() {
		checkbox.checked = !checkbox.checked;
		// Reapply filter when checkbox state changes
		setFilter();
	};
}

// "Inline JavaScript will not be executed." Thanks, Google, for this mess.
document.getElementById("pattern").onkeyup = setFilter;
document.getElementById("select").onclick = function() { setAllCheckStates(true) };
document.getElementById("deselect").onclick = function() { setAllCheckStates(false) };
document.getElementById("ok").onclick = ok;
document.getElementById("cancel").onclick = cancel;
load();
