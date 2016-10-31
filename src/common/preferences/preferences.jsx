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

var Zotero_Preferences = {};
Zotero_Preferences.Proxies = {
	init: function() {
		this.proxiesComponent = React.createElement(Zotero_Preferences.Proxies.Components.Proxies, null);
		ReactDOM.render(this.proxiesComponent, document.getElementById('content-proxies'));
	}
};

Zotero_Preferences.Proxies.Components = {};

Zotero_Preferences.Proxies.Components.ProxySettings = React.createClass({
	getInitialState: function() {
		let state = {};
		let settings = ['transparent', 'autoRecognize', 'showRedirectNotification',
			 'disableByDomain', 'disableByDomainString'];
		for (let setting of settings) {
			state[setting] = Zotero.Prefs.get('proxies.'+setting);
		}
		
		return state;
	},
	
	handleCheckboxChange: function(event) {
		this.updateState(event.target.name, event.target.checked);
	},
	
	handleTextInputChange: function(event) {
		this.updateState(event.target.name, event.target.value);
	},
	
	updateState: function(name, value) {
		let newState = {};
		newState[name] = value;
		this.setState(newState);
		Zotero.Prefs.set('proxies.'+name, value);
		// Refresh prefs in the background page
		Zotero.Proxies.loadPrefs();
		if (name === 'transparent') {
			this.props.onTransparentChange(value);
		}
	},
	
	render: function() {
		return (
			<div>
				<label><input type="checkbox" name="transparent" onChange={this.handleCheckboxChange} defaultChecked={this.state.transparent}/>&nbsp;Enable proxy redirection</label><br/>
				<div style={{marginLeft: "1em"}}>
					<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="autoRecognize" defaultChecked={this.state.autoRecognize}/>&nbsp;Automatically detect new proxies</label><br/>
					<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="showRedirectNotification" defaultChecked={this.state.showRedirectNotification}/>&nbsp;Show a notification when redirecting through a proxy</label><br/>
					<br/>
					<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="disableByDomain" defaultChecked={this.state.disableByDomain}/>&nbsp;Disable proxy redirection when my domain name contains (only available when Zotero Client is running)</label><br/>
					<input style={{marginTop: "0.5em", marginLeft: "1.5em"}} type="text" onChange={this.handleTextInputChange} disabled={!this.state.transparent || !this.state.disableByDomain} name="disableByDomainString" defaultValue={this.state.disableByDomainString}/>
				</div>
			</div>
		);
	}
});

Zotero_Preferences.Proxies.Components.ConfiguredProxies = React.createClass({
	getInitialState: function() {
		return {proxies: Zotero.Prefs.get('proxies.proxies'), currentHostIdx: -1, currentProxyIdx: -1};
	},
	
	componentWillMount: function() {
		this.saveProxies = Zotero.Utilities.debounce(this.saveProxies, 200);
	},

	saveProxies: function(currentProxyIdx=-1, currentHostIdx=-1) {
		var currentProxy;
		if (currentHostIdx == -1) currentHostIdx = this.state.currentHostIdx;
		if (currentProxyIdx != -1) {
			currentProxy = this.state.proxies[currentProxyIdx];
			Zotero.Proxies.save(currentProxy);
		} else {
			currentHostIdx = -1;
		}
		this.setState({proxies: this.state.proxies, currentProxyIdx: currentProxyIdx, currentHostIdx: currentHostIdx,
			currentProxy: currentProxy, multiHost: currentProxy && currentProxy.scheme.indexOf('%h') != -1});
	},
	
	handleProxySelectChange: function(event) {
		var currentProxyIdx = -1, currentProxy;
		let selected = Array.from(event.target.options).filter((o) => o.selected);
		if (selected.length == 1) {
			currentProxyIdx = parseInt(selected[0].value);
			currentProxy = this.state.proxies[currentProxyIdx];
		}
		this.setState({currentProxyIdx: currentProxyIdx, currentProxy: currentProxy, currentHostIdx: 0});
	},
	
	handleProxyButtonClick: function(event) {
		var currentProxyIdx = -1, currentHostIdx = -1;
		if (event.target.value == '+') {
			this.state.proxies.push({id: Date.now(), scheme: 'http://%h.example.com/%p', autoAssociate: true, 
				hosts: ['www.example.com']});
			currentProxyIdx = this.state.proxies.length-1;
			currentHostIdx = 0;
		} else if (event.target.value == '-') {
			this.state.proxies.splice(this.state.currentProxyIdx, 1);
			Zotero.Proxies.remove(this.state.currentProxy);
		}
		this.saveProxies(currentProxyIdx, currentHostIdx);
	},
	
	handleSchemeChange: function(event) {
		this.state.currentProxy.scheme = event.target.value;
		this.saveProxies(this.state.currentProxyIdx);
	},
	
	handleAutoAssociateChange: function(event) {
		this.state.currentProxy.autoAssociate = event.target.checked;
		this.saveProxies(this.state.currentProxyIdx)
	},
	
	handleHostSelectChange: function(event) {
		var currentHostIdx = -1;
		let selected = Array.from(event.target.options).filter((o) => o.selected);
		if (selected.length == 1) {
			currentHostIdx = parseInt(selected[0].value);
		}
		this.setState({currentHostIdx: currentHostIdx});
	},
	
	handleHostButtonClick: function(event) {
		var currentHostIdx = -1;
		if (event.target.value == '+') {
			this.state.currentProxy.hosts.push('www.example.com');
			currentHostIdx = this.state.currentProxy.hosts.length-1;
		} else if (event.target.value == '-') {
			this.state.currentProxy.hosts.splice(this.state.currentHostIdx, 1);
		}
		this.setState({currentHostIdx: currentHostIdx});
		this.saveProxies(this.state.currentProxyIdx);
	},
	
	handleHostnameChange: function(event) {
		this.state.currentProxy.hosts[this.state.currentHostIdx] = event.target.value;
		this.saveProxies(this.state.currentProxyIdx);
	},
	
	render: function(){
		var configuredProxies;
		if (this.state.proxies.length) {
			configuredProxies = this.state.proxies.map((proxy, i) => 
				<option value={i} key={i}>{proxy.scheme}</option> 
			);
		} else {
			configuredProxies = <option>N/A</option>;
		}
		
		var proxySettings = "";
		if (this.props.transparent && this.state.currentProxy) {
			let multiHost = this.state.currentProxy.scheme.indexOf('%h') != -1;
			let configuredHosts = this.state.currentProxy.hosts.map((host, i) => 
				<option value={i} key={i}>{host}</option>);
				
			proxySettings = (
				<div>
					<div style={{display: "flex"}}>
						<label style={{alignSelf: "center"}}>Scheme: </label>
						<input style={{flexGrow: "1"}} type="text" name="scheme" onChange={this.handleSchemeChange} defaultValue={this.state.currentProxy.scheme}/>
						<label style={{visibility: multiHost ? null : 'hidden'}}><input type="checkbox" name="autoAssociate" onChange={this.handleAutoAssociateChange} value={this.state.currentProxy.autoAssociate}/>&nbsp;Automatically associate new hosts</label><br/>
					</div>
					<p>
						You may use the following variables in your proxy scheme:<br/>
						&#37;h - The hostname of the proxied site (e.g., www.zotero.org)<br/>
						&#37;p - The path of the proxied page excluding the leading slash (e.g., about/index.html)<br/>
						&#37;d - The directory path (e.g., about/)<br/>
						&#37;f - The filename (e.g., index.html)<br/>
						&#37;a - Any string
					</p>
					
					<div style={{display: "flex", flexDirection: "column", marginTop: "10px"}}>
						<label>Hostnames</label>
						<select size="8" multiple onChange={this.handleHostSelectChange} value={[this.state.currentHostIdx]}>
							{configuredHosts}
						</select>
						<div>
							<input type="button" onClick={this.handleHostButtonClick} value="+"/>
							<input type="button" onClick={this.handleHostButtonClick} disabled={this.state.currentHostIdx == -1} value="-"/>
						</div>

						<div style={{display: this.state.currentHostIdx === -1 ? 'none' : 'flex'}}>
							<label style={{alignSelf: 'center'}}>Hostname: </label>
							<input style={{flexGrow: '1'}} type="text" defaultValue={this.state.currentProxy.hosts[this.state.currentHostIdx] || ''} onChange={this.handleHostnameChange}/>
						</div>
					</div> 
				</div>
			);
		}
		
		return (
			<div style={{display: "flex", flexDirection: "column"}}>
				<select size="8" multiple onChange={this.handleProxySelectChange} disabled={!this.props.transparent} value={[this.state.currentProxyIdx]}>
					{configuredProxies}
				</select>
				<div style={{display: this.props.transparent ? null : 'none'}}>
					<input type="button" onClick={this.handleProxyButtonClick} value="+"/>
					<input type="button" onClick={this.handleProxyButtonClick} disabled={!this.state.currentProxy} value="-"/>
				</div>
				
				{proxySettings}
			</div>
		);
	}
});


Zotero_Preferences.Proxies.Components.Proxies = React.createClass({
	getInitialState: function() {
		return {
			transparent: Zotero.Prefs.get('proxies.transparent')
		}
	},

	onTransparentChange: function(transparent) {
		this.setState({transparent});
	},

	render: function() {
		return (
			<div>
				<div className="group">
					<div className="group-title">Proxy Settings</div>
					<div className="group-content">
						<p>Zotero will transparently redirect requests through saved proxies. See the <a href="https://www.zotero.org/support/proxies">proxy documentation</a> for more information.</p>
						<p></p>
						<Zotero_Preferences.Proxies.Components.ProxySettings onTransparentChange={this.onTransparentChange}/>
					</div>
				</div>
				<div className="group">
					<div className="group-title">Configured Proxies</div>
					<div className="group-content">
						<Zotero_Preferences.Proxies.Components.ConfiguredProxies transparent={this.state.transparent}/>
					</div>
				</div>
			</div>
		)
	}
});

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

	if (Zotero.isBrowserExt) {
		document.getElementById('pane-proxies').style.display = null;
		Zotero_Preferences.Proxies.init();
	}
	
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
	} else if(Zotero.isBrowserExt) {
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

var openTranslatorTesterButton = document.getElementById("advanced-button-open-translator-tester");
if(openTranslatorTesterButton) openTranslatorTesterButton.onclick = openTranslatorTester;

window.addEventListener("load", onLoad, false);