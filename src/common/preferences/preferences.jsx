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


/**
 * Sets or removes the "disabled" attribute on an element.
 */
function toggleDisabled(element, status) {
	if(status) {
		element.setAttribute("disabled", "true");
	} else if(element.hasAttribute("disabled")) {
		element.removeAttribute("disabled");
	}
}

var Zotero_Preferences = {
	pane: {},
	content: {},
	visiblePaneName: null,
	init: function() {
		Zotero.isPreferences = true;
		Zotero.Messaging.init();
		
		var panesDiv = document.getElementById("panes");
		var id;
		for(var i in panesDiv.childNodes) {
			var paneDiv = panesDiv.childNodes[i];
			id = paneDiv.id;
			if(id) {
				if(id.substr(0, 5) === "pane-") {
					var paneName = id.substr(5);
					Zotero_Preferences.pane[paneName] = paneDiv;
					Zotero_Preferences.content[paneName] = document.getElementById("content-"+paneName);
					paneDiv.addEventListener("click", Zotero_Preferences.onPaneClick, false);
				}
			}
		}
		
		let hashPane = window.location.hash && window.location.hash.substr(1);
		if (hashPane in Zotero_Preferences.pane) {
			Zotero_Preferences.selectPane(hashPane);
		} else {
			Zotero_Preferences.selectPane("general");
		}
		
		Zotero_Preferences.General.init();
		Zotero_Preferences.Advanced.init();

		Zotero.Prefs.loadNamespace('proxies').then(function() {
			Zotero_Preferences.Proxies.init();
		});

		Zotero.initDeferred.resolve();
		Zotero_Preferences.refreshData();
		window.setInterval(() => Zotero_Preferences.refreshData(), 1000);
	},

	/**
	 * Called when a pane is clicked.
	 */
	onPaneClick: function(e) {
		Zotero_Preferences.selectPane(e.currentTarget.id.substr(5));
	},
	
	/**
	 * Selects a pane.
	 */
	selectPane: function(paneName) {
		if(this.visiblePaneName === paneName) return;
		
		if(this.visiblePaneName) {
			this.pane[this.visiblePaneName].classList.toggle('selected', false);
			this.content[this.visiblePaneName].classList.toggle('selected', false);
		}
		
		this.visiblePaneName = paneName;

		this.pane[paneName].classList.toggle('selected', true);
		this.content[paneName].classList.toggle('selected', true);
	},
	
	/**
	 * Refreshes data that may have changed while the options window is open
	 */
	refreshData: function() {
		// get errors
		return Zotero.Errors.getErrors().then(function(errors) {
			if(errors.length) {
				document.getElementById('advanced-no-errors').style.display = "none";
				document.getElementById('advanced-have-errors').style.display = "block";
				document.getElementById('advanced-textarea-errors').textContent = errors.join("\n\n");
			}
			// get debug logging info
			return Zotero.Connector_Debug.count();
		}).then(function(count) {
			document.getElementById('advanced-span-lines-logged').textContent = count.toString();
			toggleDisabled(document.getElementById('advanced-button-view-output'), !count);
			toggleDisabled(document.getElementById('advanced-button-clear-output'), !count);
			toggleDisabled(document.getElementById('advanced-button-submit-output'), !count);
		});
	}
};

Zotero_Preferences.General = {
	init: function() {

		if (Zotero.isBrowserExt) {
			let elem = document.getElementById('intercept-and-import');
			elem.style.display = null;
			this.mimeTypeHandlingComponent = React.createElement(Zotero_Preferences.Components.MIMETypeHandling, null);
			ReactDOM.render(this.mimeTypeHandlingComponent, elem.querySelectorAll('.group-content')[0]);
		}
		
		ReactDOM.render(React.createElement(Zotero_Preferences.Components.ClientStatus, null),
			document.getElementById("client-status"));
		document.getElementById("general-button-authorize").onclick = 
			document.getElementById("general-button-reauthorize").onclick = Zotero_Preferences.General.authorize;
		document.getElementById("general-button-clear-credentials").onclick = Zotero_Preferences.General.clearCredentials;
		document.getElementById("general-checkbox-automaticSnapshots").onchange =
			function() { Zotero.Prefs.set('automaticSnapshots', this.checked) };
		document.getElementById("general-checkbox-downloadAssociatedFiles").onchange =
			function() { Zotero.Prefs.set('downloadAssociatedFiles', this.checked) };
		
		Zotero.Prefs.getAsync("downloadAssociatedFiles").then(function(status) {
			document.getElementById('general-checkbox-downloadAssociatedFiles').checked = !!status;
		});
		Zotero.Prefs.getAsync("automaticSnapshots").then(function(status) {
			document.getElementById('general-checkbox-automaticSnapshots').checked = !!status;
		});
		Zotero.API.getUserInfo().then(Zotero_Preferences.General.updateAuthorization);

	},

	/**
	 * Updates the "Authorization" group based on a username
	 */
	updateAuthorization: function(userInfo) {
		document.getElementById('general-authorization-not-authorized').style.display = (userInfo ? 'none' : 'block');
		document.getElementById('general-authorization-authorized').style.display = (!userInfo ? 'none' : 'block');
		if(userInfo) {
			document.getElementById('general-span-authorization-username').textContent = userInfo.username;
		}
	},

	/**
	 * Authorizes the user
	 */
	authorize: function() {
		Zotero.API.authorize().then(function(data) {
			Zotero_Preferences.General.updateAuthorization(data);
		}, function(e) {
			if (e.message.includes('cancelled')) return;
			alert("Authorization could not be completed.\n\n"+e.message)
		});
	},

	/**
	 * Clears authorization
	 */
	clearCredentials: function() {
		Zotero.API.clearCredentials();
		Zotero_Preferences.General.updateAuthorization(null);
	},

	/**
	 * Opens the translator tester in a new window.
	 */
	openTranslatorTester: function() {
		if(Zotero.isSafari) {
			window.open(safari.extension.baseURI+"tools/testTranslators/testTranslators.html", "translatorTester");
		} else if(Zotero.isBrowserExt) {
			window.open(browser.extension.getURL("tools/testTranslators/testTranslators.html"), "translatorTester");
		}
	}
};

Zotero_Preferences.Proxies = {
	init: function() {
		this.proxiesComponent = React.createElement(Zotero_Preferences.Components.ProxySettings, null);
		ReactDOM.render(this.proxiesComponent, document.getElementById('content-proxies'));
	}
};


Zotero_Preferences.Advanced = {
	init: function() {
		
		document.getElementById("advanced-checkbox-enable-logging").onchange =
			function() { Zotero.Debug.setStore(this.checked); };
		document.getElementById("advanced-checkbox-enable-at-startup").onchange =
			function() { Zotero.Prefs.set('debug.store', this.checked); };
		document.getElementById("advanced-checkbox-show-in-console").onchange = function() {
			Zotero.Prefs.set('debug.log', this.checked);
			Zotero.Debug.bgInit();
			// Zotero.Debug.init() sets store to false
			Zotero.Debug.setStore(document.getElementById("advanced-checkbox-enable-logging").checked);
			Zotero.Prefs.set('debug.store', document.getElementById("advanced-checkbox-enable-at-startup").checked);
		};
		document.getElementById("advanced-checkbox-report-translator-failure").onchange =
			function() { Zotero.Prefs.set('reportTranslationFailure', this.checked); };
		document.getElementById("advanced-button-view-output").onclick = Zotero_Preferences.Advanced.viewDebugOutput;
		document.getElementById("advanced-button-clear-output").onclick = Zotero_Preferences.Advanced.clearDebugOutput;
		document.getElementById("advanced-button-submit-output").onclick = Zotero_Preferences.Advanced.submitDebugOutput;
		document.getElementById("advanced-button-update-translators").onclick = function() { Zotero.Repo.update(false) };
		document.getElementById("advanced-button-reset-translators").onclick = function() { Zotero.Repo.update(true) };
		document.getElementById("advanced-button-report-errors").onclick = Zotero_Preferences.Advanced.submitErrors;


		var openTranslatorTesterButton = document.getElementById("advanced-button-open-translator-tester");
		if (openTranslatorTesterButton) openTranslatorTesterButton.onclick = Zotero_Preferences.General.openTranslatorTester;
		var testRunnerButton = document.getElementById("advanced-button-open-test-runner");
		if (testRunnerButton) testRunnerButton.onclick = function() {
			if (Zotero.isSafari) {
				Zotero.Connector_Browser.openTab(safari.extension.baseURI + "test/test.html");
			} else {
				Zotero.Connector_Browser.openTab(browser.extension.getURL(`test/test.html`));
			}
		};
		document.getElementById("advanced-button-config-editor").onclick = function() {
			if (confirm("Changing these advanced settings can be harmful to the stability, security, and performance of the browser and the Zotero Connector. \nYou should only proceed if you are sure of what you are doing.")) {
				Zotero.Connector_Browser.openConfigEditor();
			}
		};
		
		// get preference values
		Zotero.Connector_Debug.storing(function(status) {
			document.getElementById('advanced-checkbox-enable-logging').checked = !!status;
		});
		Zotero.Prefs.getAsync("debug.store").then(function(status) {
			document.getElementById('advanced-checkbox-enable-at-startup').checked = !!status;
		});
		Zotero.Prefs.getAsync("debug.log").then(function(status) {
			document.getElementById('advanced-checkbox-show-in-console').checked = !!status;
		});
		Zotero.Prefs.getAsync("reportTranslationFailure").then(function(status) {
			document.getElementById('advanced-checkbox-report-translator-failure').checked = !!status;
		});
	},
		
	/**
	 * Opens a new window to view debug output.
	 */
	viewDebugOutput: function() {
		Zotero.Connector_Debug.get(function(log) {
			var textarea = document.getElementById("advanced-textarea-debug");
			textarea.textContent = log;
			textarea.style.display = "";
		});
	},

	/**
	 * Clears stored debug output.
	 */
	clearDebugOutput: function() {
		Zotero.Debug.clear();
		Zotero_Preferences.refreshData();
		var textarea = document.getElementById("advanced-textarea-debug");
		textarea.style.display = 'none';
	},

	/**
	 * Submits debug output to server.
	 */
	submitDebugOutput: async function() {
		var submitOutputButton = document.getElementById('advanced-button-submit-output');
		toggleDisabled(submitOutputButton, true);

		// We have to request within a user gesture in chrome
		if (Zotero.isChrome) {
			try {
				await browser.permissions.request({permissions: ['management']});
			} catch (e) {
				Zotero.debug(`Management permission request failed: ${e.message || e}`);
			}
		}
		
		return Zotero.Connector_Debug.submitReport().then(function(reportID) {
			alert("Your debug output has been submitted.\n\n"
				+ `The Debug ID is D${reportID}.`);
		}, function(e) {
			alert(`An error occurred submitting your debug output.\n\n${e.message}\n\n`+
				'Please check your internet connection. If the problem persists, '+
				'please post a message to the Zotero Forums (forums.zotero.org).');
		}).then(() => toggleDisabled(submitOutputButton, false));
	},

	/**
	 * Submits an error report
	 */
	submitErrors: async function() {
		var reportErrorsButton = document.getElementById('advanced-button-report-errors');
		toggleDisabled(reportErrorsButton, true);
		
		// We have to request within a user gesture in chrome
		if (Zotero.isChrome) {
			try {
				await browser.permissions.request({permissions: ['management']});
			} catch (e) {
				Zotero.debug(`Management permission request failed: ${e.message || e}`);
			}
		}
		
		try {
			var reportID = await Zotero.Errors.sendErrorReport();
			alert(`Your error report has been submitted.\n\nReport ID: ${reportID}\n\n`+
				'Please post a message to the Zotero Forums (forums.zotero.org) with this Report '+
				'ID, a description of the problem, and any steps necessary to reproduce it.\n\n'+
				'Error reports are not reviewed unless referred to in the forums.');
		} catch(e) {
			alert(`An error occurred submitting your error report.\n\n${e.message}\n\n`+
				'Please check your internet connection. If the problem persists, '+
				'please post a message to the Zotero Forums (forums.zotero.org).');
		} finally {
			toggleDisabled(reportErrorsButton, false);
		}
	}
};

Zotero_Preferences.Components = {};

Zotero_Preferences.Components.ClientStatus = React.createClass({
	getInitialState: function() {
		this.checkStatus();
		return {available: false};
	},
	
	checkStatus: function() {
		return Zotero.Connector.checkIsOnline().then(function(status) {
			this.setState({available: status});
		}.bind(this));
	},
	
	render: function() {
		let available = <span>available.</span>;
		if (!this.state.available) {
			available = <span>unavailable. If Zotero is open, see the <a href="https://www.zotero.org/support/kb/connector_zotero_unavailable">troubleshooting page</a>.</span>
		}
		return (<div>
			<p>Zotero is currently {available}</p>
			<p><input type="button" value="Update Status" onClick={this.checkStatus}/></p>
		</div>)
	}
});

Zotero_Preferences.Components.ProxyPreferences = React.createClass({
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
		let autoRecognise = '';
		if (Zotero.isBrowserExt) {
			autoRecognise = <span><label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="autoRecognize" defaultChecked={this.state.autoRecognize}/>&nbsp;Automatically detect new proxies</label><br/></span>;
		}
		return (
			<div>
				<label><input type="checkbox" name="transparent" onChange={this.handleCheckboxChange} defaultChecked={this.state.transparent}/>&nbsp;Enable proxy redirection</label><br/>
				<div style={{marginLeft: "1em"}}>
					<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="showRedirectNotification" defaultChecked={this.state.showRedirectNotification}/>&nbsp;Show a notification when redirecting through a proxy</label><br/>
					{autoRecognise}
					<br/>
					<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="disableByDomain" defaultChecked={this.state.disableByDomain}/>&nbsp;Disable proxy redirection when my domain name contains<span>*</span></label><br/>
					<input style={{marginTop: "0.5em", marginLeft: "1.5em"}} type="text" onChange={this.handleTextInputChange} disabled={!this.state.transparent || !this.state.disableByDomain} name="disableByDomainString" defaultValue={this.state.disableByDomainString}/>
				</div>
				<p><span>*</span>Available when Zotero is running</p>
			</div>
		);
	}
});

Zotero_Preferences.Components.Proxies = React.createClass({
	getInitialState: function() {
		return {proxies: Zotero.Prefs.get('proxies.proxies'), currentHostIdx: -1, currentProxyIdx: -1};
	},
	
	componentWillMount: function() {
		this.saveCurrentProxy = Zotero.Utilities.debounce(Zotero.Proxies.save.bind(Zotero.Proxies), 200);
	},
	
	componentDidUpdate: function() {
		if (this.focusHostInput) {
			this.focusHostInput = false;
			this.refs.hostInput.focus();
		}
	},
	
	saveProxies: function(currentProxyIdx=-1, currentHostIdx=-1) {
		var currentProxy;
		if (currentHostIdx == -1) currentHostIdx = this.state.currentHostIdx;
		if (currentProxyIdx != -1) {
			currentProxy = this.state.proxies[currentProxyIdx];
			this.saveCurrentProxy(currentProxy);
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
			this.state.proxies.push({id: Date.now(), scheme: '%h.example.com/%p', autoAssociate: true,
				hosts: ['']});
			currentProxyIdx = this.state.proxies.length-1;
			currentHostIdx = 0;
			this.focusHostInput = true;
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
	
	handleCheckboxChange: function(event) {
		this.state.currentProxy[event.target.name] = event.target.checked;
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
			this.state.currentProxy.hosts.push('');
			currentHostIdx = this.state.currentProxy.hosts.length-1;
			this.focusHostInput = true;
		} else if (event.target.value == '-') {
			currentHostIdx = this.state.currentHostIdx;
			if (currentHostIdx == this.state.currentProxy.hosts.length-1) {
				currentHostIdx--;
			}
			this.state.currentProxy.hosts.splice(this.state.currentHostIdx, 1);
		}
		this.setState({currentHostIdx: currentHostIdx});
		this.saveProxies(this.state.currentProxyIdx, currentHostIdx);
	},
	
	handleHostnameChange: function(event) {
		this.state.currentProxy.hosts[this.state.currentHostIdx] = event.target.value;
		this.saveProxies(this.state.currentProxyIdx);
	},
	
	render: function(){
		var configuredProxies;
		if (this.state.proxies.length) {
			configuredProxies = this.state.proxies.map((proxy, i) => 
				<option value={i} key={i} selected={this.state.currentProxyIdx == i}>{proxy.scheme}</option>
			);
		} else {
			configuredProxies = <option value={-1}></option>;
		}
		
		var proxySettings = "";
		if (this.props.transparent && this.state.currentProxy) {
			let currentProxy = this.state.currentProxy;
			let multiHost = currentProxy.scheme.indexOf('%h') != -1;
			let configuredHosts = currentProxy.hosts.map((host, i) => 
				<option value={i} key={i} selected={this.state.currentHostIdx == i}>{host}</option>);
				
			let disableAddHost = currentProxy.hosts.length && currentProxy.hosts[currentProxy.hosts.length-1].trim().length == 0;
				
			proxySettings = (
				<div className="group" style={{marginTop: "10px"}}>
					<p style={{display: "flex", alignItems: "center", flexWrap: "wrap"}}>
						<label style={{visibility: multiHost ? null : 'hidden'}}><input type="checkbox" name="autoAssociate" onChange={this.handleCheckboxChange} checked={currentProxy.autoAssociate}/>&nbsp;Automatically associate new hosts</label><br/>
						<label><input type="checkbox" name="dotsToHyphens" onChange={this.handleCheckboxChange} checked={currentProxy.dotsToHyphens}/>&nbsp;Automatically convert hyphens to dots in proxied hostnames</label><br/>
					</p>
					<p style={{display: "flex", alignItems: "center"}}>
						<label style={{alignSelf: "center", marginRight: "5px"}}>Scheme: </label>
						<input style={{flexGrow: "1"}} type="text" name="scheme" onChange={this.handleSchemeChange} value={currentProxy.scheme}/>
					</p>
					<p>
						You may use the following variables in your proxy scheme:<br/>
						&#37;h - The hostname of the proxied site (e.g., www.example.com)<br/>
						&#37;p - The path of the proxied page excluding the leading slash (e.g., about/index.html)<br/>
						&#37;d - The directory path (e.g., about/)<br/>
						&#37;f - The filename (e.g., index.html)<br/>
						&#37;a - Any string
					</p>
					
					<div style={{display: "flex", flexDirection: "column", marginTop: "10px"}}>
						<label>Hostnames</label>
						<select size="8" multiple onChange={this.handleHostSelectChange}>
							{configuredHosts}
						</select>
						<p>
							<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleHostButtonClick} disabled={disableAddHost} value="+"/>
							<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleHostButtonClick} value="-"/>
						</p>

						<p style={{display: this.state.currentHostIdx === -1 ? 'none' : 'flex'}}>
							<label style={{alignSelf: 'center', marginRight: "5px"}}>Hostname: </label>
							<input style={{flexGrow: '1'}} type="text" value={currentProxy.hosts[this.state.currentHostIdx] || ''} onChange={this.handleHostnameChange} ref={"hostInput"}/>
						</p>
					</div> 
				</div>
			);
		}
		
		return (
			<div style={{display: "flex", flexDirection: "column"}}>
				<select size="8" multiple onChange={this.handleProxySelectChange} disabled={!this.props.transparent}>
					{configuredProxies}
				</select>
				<p style={{display: this.props.transparent ? null : 'none'}}>
					<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleProxyButtonClick} value="+"/>
					<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleProxyButtonClick} disabled={!this.state.currentProxy} value="-"/>
				</p>
				
				{proxySettings}
			</div>
		);
	}
});


Zotero_Preferences.Components.ProxySettings = React.createClass({
	getInitialState: function() {
		return {
			transparent: Zotero.Prefs.get('proxies.transparent')
		}
	},

	handleTransparentChange: function(transparent) {
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
						<Zotero_Preferences.Components.ProxyPreferences onTransparentChange={this.handleTransparentChange}/>
					</div>
				</div>
				<div className="group">
					<div className="group-title">Configured Proxies</div>
					<div className="group-content">
						<Zotero_Preferences.Components.Proxies transparent={this.state.transparent}/>
					</div>
				</div>
			</div>
		)
	}
});

Zotero_Preferences.Components.MIMETypeHandling = React.createClass({
	getInitialState: function() {
		return {
			enabled: Zotero.Prefs.get('interceptKnownFileTypes'),
			hosts: Zotero.Prefs.get('allowedInterceptHosts'),
			currentHostIdx: -1
		}
	},

	componentWillMount: function() {
		this.updateHosts = Zotero.Utilities.debounce(this.updateHosts, 200);
	},
	
	handleCheckboxChange: function(event) {
		Zotero.Prefs.set('interceptKnownFileTypes', event.target.checked);
		this.setState({enabled: event.target.checked});
	},
	
	handleSelectChange: function(event) {
		var currentHostIdx = -1;
		let selected = Array.from(event.target.options).filter((o) => o.selected);
		if (selected.length == 1) {
			currentHostIdx = parseInt(selected[0].value);
		}
		this.setState({currentHostIdx});
	},
	
	handleHostnameChange: function(event) {
		this.state.hosts[this.state.currentHostIdx] = event.target.value;
		this.updateHosts(this.state.hosts);
	},
	
	handleHostRemove: function() {
		this.state.hosts.splice(this.state.currentHostIdx, 1);
		this.setState({currentHostIdx: -1});
		this.updateHosts(this.state.hosts);
	},
	
	updateHosts: function(hosts) {
		this.setState({hosts});
		Zotero.Prefs.set('allowedInterceptHosts', hosts);
	},
	
	render: function() {
		var hosts;
		if (this.state.hosts.length) {
			hosts = this.state.hosts.map((h, i) => <option value={i} key={i} selected={this.state.currentHostIdx == i}>{h}</option>);
		} else {
			hosts = <option value={-1}></option>;
		}
		let hostname = '';
		if (this.state.currentHostIdx != -1) {
			hostname = <p style={{display: this.state.currentHostIdx === -1 ? 'none' : 'flex'}}>
				<label style={{alignSelf: 'center'}}>Hostname: </label>
				<input style={{flexGrow: '1'}} type="text" defaultValue={this.state.hosts[this.state.currentHostIdx] || ''} onChange={this.handleHostnameChange}/>
			</p>
		}
		
		return (
		<div>
			<p>Available when Zotero is running</p>
			<p>
				<label><input type="checkbox" onChange={this.handleCheckboxChange} name="enabled" defaultChecked={this.state.enabled}/>&nbsp;Import BibTeX/RIS/Refer files into Zotero</label><br/>
			</p>
			<div style={{display: this.state.enabled ? 'flex' : 'none', flexDirection: "column", marginTop: "10px"}}>
				<label>Enabled Hostnames</label>
				<select size="8" multiple onChange={this.handleSelectChange}>
					{hosts}
				</select>
				<p> <input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleHostRemove} disabled={this.state.currentHostIdx == -1} value="Remove"/> </p>
				{hostname}
			</div>
			
		</div>);
	}
});

window.addEventListener("load", Zotero_Preferences.init, false);