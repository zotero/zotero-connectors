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

var submittingErrorReport = false;
var visiblePaneName = null;

var pane = {};
var content = {};

/**
 * Called on document load. Sets up panes and gets data.
 */
function onLoad() {
	Zotero.Messaging.init();
	
	var panesDiv = document.getElementById("panes");
	var id;
	for(var i in panesDiv.childNodes) {
		var paneDiv = panesDiv.childNodes[i];
		id = paneDiv.id;
		if(id) {
			if(id.substr(0, 5) === "pane-") {
				var paneName = id.substr(5);
				pane[paneName] = paneDiv;
				content[paneName] = document.getElementById("content-"+paneName);
				paneDiv.addEventListener("click", onPaneClick, false);
			}
		}
	}
	
	selectPane("general");
	
	// get standalone status
	updateStandaloneStatus();
	
	// get preference values
	Zotero.Connector_Debug.storing(function(status) {
		document.getElementById('advanced-checkbox-enable-logging').checked = status ? true : false;
	});
	Zotero.Prefs.getCallback("debug.store", function(status) {
		document.getElementById('advanced-checkbox-enable-at-startup').checked = status ? true : false;
	});
	Zotero.Prefs.getCallback("debug.log", function(status) {
		document.getElementById('advanced-checkbox-show-in-console').checked = status ? true : false;
	});
	Zotero.Prefs.getCallback("downloadAssociatedFiles", function(status) {
		document.getElementById('general-checkbox-downloadAssociatedFiles').checked = status ? true : false;
	});
	Zotero.Prefs.getCallback("automaticSnapshots", function(status) {
		document.getElementById('general-checkbox-automaticSnapshots').checked = status ? true : false;
	});
	Zotero.API.getUserInfo(updateAuthorization);
	
	refreshData();
	window.setInterval(refreshData, 1000);
}

/**
 * Called when a pane is clicked.
 */
function onPaneClick(e) {
	selectPane(e.currentTarget.id.substr(5));
}

/**
 * Refreshes data that may have changed while the options window is open
 */
function refreshData() {
	// get errors
	Zotero.Errors.getErrors(function(errors) {
		if(errors.length) {
			document.getElementById('general-no-errors').style.display = "none";
			document.getElementById('general-have-errors').style.display = "block";
			document.getElementById('general-textarea-errors').textContent = errors.join("\n\n");
		}
	});
	
	// get debug logging info
	Zotero.Connector_Debug.count(function(count) {
		document.getElementById('advanced-span-lines-logged').textContent = count.toString();
		setDisabled(document.getElementById('advanced-button-view-output'), !count);
		setDisabled(document.getElementById('advanced-button-clear-output'), !count);
		setDisabled(document.getElementById('advanced-button-submit-output'), !count);
	});
}

/**
 * Selects a pane.
 */
function selectPane(paneName) {
	if(visiblePaneName === paneName) return;
	
	if(visiblePaneName) {
		setSelected(pane[visiblePaneName], false);
		setSelected(content[visiblePaneName], false);
	}
	
	visiblePaneName = paneName;
	setSelected(pane[paneName], true);
	setSelected(content[paneName], true);
}

/**
 * Sets or unsets the "selected" class on an element.
 */
function setSelected(element, status) {
	var classes = element.className.split(" ");
	
	for(var i=0; i<classes.length; i++) {
		if(classes[i] === "selected") {
			if(status) return;	// already selected
			classes = classes.splice(i-1, 1);
			break;
		}
	}
	
	if(status) classes.push("selected");
	element.className = classes.join(" ");
}

/**
 * Sets or removes the "disabled" attribute on an element.
 */
function setDisabled(element, status) {
	if(status) {
		element.setAttribute("disabled", "true");
	} else if(element.hasAttribute("disabled")) {
		element.removeAttribute("disabled");
	}
}

/**
 * Updates Zotero Standalone status
 */
function updateStandaloneStatus() {
	Zotero.Connector.checkIsOnline(function(status) {
		document.getElementById('general-span-standalone-status').textContent = status ? "available" : "unavailable";
	});
}

/**
 * Updates the "Authorization" group based on a username
 */
function updateAuthorization(userInfo) {
	document.getElementById('general-authorization-not-authorized').style.display = (userInfo ? 'none' : 'block');
	document.getElementById('general-authorization-authorized').style.display = (!userInfo ? 'none' : 'block');
	if(userInfo) {
		document.getElementById('general-span-authorization-username').textContent = userInfo.username;
	}
}

/**
 * Authorizes the user
 */
function authorize() {
	Zotero.API.authorize(function(status, data) {
		if(status) {
			updateAuthorization(data);
		} else {
			alert("Authorization could not be completed.\n\n"+data);
		}
	});
}

/**
 * Clears authorization
 */
function clearCredentials() {
	Zotero.API.clearCredentials();
	updateAuthorization(null);
}

/**
 * Submits an error report
 */
function submitErrors() {
	var reportErrorsButton = document.getElementById('general-button-report-errors');
	setDisabled(reportErrorsButton, true);
	
	Zotero.Errors.sendErrorReport(function(status, message) {
		if(status) {
			alert('Your error report has been submitted.\n\nReport ID:'+message+'\n\n'+
				'Please post a message to the Zotero forums (forums.zotero.org) with this Report '+
				'ID, a description of the problem, and any steps necessary to reproduce it.\n\n'+
				'Error reports are not reviewed unless referred to in the forums.');
		} else {
			alert('An error occurred submitting your error report.\n\n'+message+'\n\n'+
				'Please ensure that you are connected to the Internet. If the problem persists, '+
				'please post a message to the Zotero forums (forums.zotero.org).');
		}
		setDisabled(reportErrorsButton, false);
	});
}

/**
 * Opens a new window to view debug output.
 */
function viewDebugOutput() {
	Zotero.Connector_Debug.get(function(log) {
		var textarea = document.getElementById("advanced-textarea-debug");
		textarea.textContent = log;
		textarea.style.display = "";
	});
}

/**
 * Clears stored debug output.
 */
function clearDebugOutput() {
	Zotero.Debug.clear();
	refreshData();
}

/**
 * Submits debug output to server.
 */
function submitDebugOutput() {
	var submitOutputButton = document.getElementById('advanced-button-submit-output');
	setDisabled(submitOutputButton, true);
	
	Zotero.Connector_Debug.submitReport(function(status, message) {
		if(status) {
			alert("Debug output has been sent to the Zotero server.\n\n"
				+ "The Debug ID is D" + message + ".");
		} else {
			alert('An error occurred submitting your debug output.\n\n'+message+'\n\n'+
				'Please ensure that you are connected to the Internet.');
		}
		setDisabled(submitOutputButton, false);
	});
}

/**
 * Opens the translator tester in a new window.
 */
function openTranslatorTester() {
	if(Zotero.isSafari) {
		window.open(safari.extension.baseURI+"tools/testTranslators/testTranslators.html", "translatorTester");
	} else if(Zotero.isChrome) {
		window.open(chrome.extension.getURL("tools/testTranslators/testTranslators.html"), "translatorTester");
	}
}

document.getElementById("general-button-update-standalone-status").onclick = updateStandaloneStatus;
document.getElementById("general-button-authorize").onclick = 
	document.getElementById("general-button-reauthorize").onclick = authorize;
document.getElementById("general-button-clear-credentials").onclick = clearCredentials;
document.getElementById("general-checkbox-automaticSnapshots").onchange =
	function() { Zotero.Prefs.set('automaticSnapshots', this.checked) };
document.getElementById("general-checkbox-downloadAssociatedFiles").onchange =
	function() { Zotero.Prefs.set('downloadAssociatedFiles', this.checked) };
document.getElementById("general-button-report-errors").onclick = submitErrors;

document.getElementById("advanced-checkbox-enable-logging").onchange =
	function() { Zotero.Debug.setStore(this.checked); };
document.getElementById("advanced-checkbox-enable-at-startup").onchange =
	function() { Zotero.Prefs.set('debug.store', this.checked); };
document.getElementById("advanced-checkbox-show-in-console").onchange =
	function() { Zotero.Prefs.set('debug.log', this.checked); };
document.getElementById("advanced-button-view-output").onclick = viewDebugOutput;
document.getElementById("advanced-button-clear-output").onclick = clearDebugOutput;
document.getElementById("advanced-button-submit-output").onclick = submitDebugOutput;
document.getElementById("advanced-button-update-translators").onclick = function() { Zotero.Repo.update(false) };
document.getElementById("advanced-button-reset-translators").onclick = function() { Zotero.Repo.update(true) };

var openTranslatorTester = document.getElementById("advanced-button-open-translator-tester");
if(openTranslatorTester) openTranslatorTester.onclick = openTranslatorTester;

window.addEventListener("load", onLoad, false);