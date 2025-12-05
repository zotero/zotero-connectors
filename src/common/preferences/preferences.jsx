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
	init: async function() {
		Zotero.isPreferences = true;
		Zotero.Messaging.init();
		await Zotero.i18n.init();

		await Zotero.Prefs.loadNamespace(['interceptKnownFileTypes', 'allowedInterceptHosts']);
		
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

		var checkboxes = document.querySelectorAll('[type="checkbox"][data-pref]');
		for (let checkbox of checkboxes) {
			checkbox.addEventListener('change', Zotero_Preferences.onPrefCheckboxChange);
			checkbox.checked = await Zotero.Prefs.getAsync(checkbox.dataset.pref);
		}		
		
		Zotero_Preferences.General.init();
		Zotero_Preferences.Advanced.init();

		if (Zotero.isBrowserExt) {
			Zotero.Prefs.loadNamespace('proxies').then(function() {
				Zotero_Preferences.Proxies.init();
			});
		}


		Zotero.initDeferred.resolve();
		Zotero.isInject = true;
		
		if (Zotero.isSafari) {
			// BrowserExt handles these in the background page
			window.addEventListener('focus', function() {
				Zotero.Connector_Browser.onTabFocus();
			}, true);
			Zotero.Connector_Browser.onTabFocus();
		}
		Zotero_Preferences.refreshData();
		window.setInterval(() => Zotero_Preferences.refreshData(), 1000);
	},

	/**
	 * Called when a pane is clicked.
	 */
	onPaneClick: function(e) {
		Zotero_Preferences.selectPane(e.currentTarget.id.substr(5));
	},
	
	onPrefCheckboxChange: function(event) {
		Zotero.Prefs.set(event.target.dataset.pref, event.target.checked);
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
		document.getElementById("general-button-clear-credentials").onclick = Zotero_Preferences.General.clearCredentials;

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
		window.open(Zotero.getExtensionURL("tools/testTranslators/testTranslators.html"), "translatorTester");
	}
};

Zotero_Preferences.Proxies = {
	init: function() {
		document.getElementById('pane-proxies').style.display = null;
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
		document.getElementById("advanced-checkbox-report-translator-failure").onchange =
			function() { Zotero.Prefs.set('reportTranslationFailure', this.checked); };
		document.getElementById("advanced-button-view-output").onclick = Zotero_Preferences.Advanced.viewDebugOutput;
		document.getElementById("advanced-button-clear-output").onclick = Zotero_Preferences.Advanced.clearDebugOutput;
		document.getElementById("advanced-button-submit-output").onclick = Zotero_Preferences.Advanced.submitDebugOutput;
		document.getElementById("advanced-button-reset-translators").addEventListener('click', async (event) => { 
			event.target.value = "Resetting translators…";
			try {
				// Otherwise "Resetting translators..." flash-appears and it looks glitchy
				await Promise.all([Zotero.Promise.delay(1000), (async () => {
					await Zotero.Prefs.removeAllCachedTranslators();
					return Zotero.Translators.updateFromRemote(true)
				})()]);
				event.target.value = "Translators updated!";
			} catch (e) {
				event.target.value = "Translator update failed";
			}
		});
		document.getElementById("advanced-button-report-errors").onclick = Zotero_Preferences.Advanced.submitErrors;

		const googleDocsEnabledCheckbox = document.getElementById("advanced-checkbox-google-docs-enabled");
		function onGoogleDocsEnabledChange() {
			let inputs = document.querySelectorAll('#advanced-google-docs-subprefs input');
			inputs.forEach(input => input.disabled = !googleDocsEnabledCheckbox.checked);
		}
		googleDocsEnabledCheckbox.addEventListener('change', onGoogleDocsEnabledChange);
		setTimeout(() => onGoogleDocsEnabledChange.call(googleDocsEnabledCheckbox), 20);


		var openTranslatorTesterButton = document.getElementById("advanced-button-open-translator-tester");
		if (openTranslatorTesterButton) openTranslatorTesterButton.onclick = Zotero_Preferences.General.openTranslatorTester;
		var testRunnerButton = document.getElementById("advanced-button-open-test-runner");
		if (testRunnerButton) testRunnerButton.onclick = function() {
			Zotero.Connector_Browser.openTab(Zotero.getExtensionURL(`test/test.html`));
		};
		document.getElementById("advanced-button-config-editor").onclick = function() {
			let msg = "Changing these advanced settings can be harmful to the stability, security, "
				+ "and performance of the browser and the Zotero Connector. You should only "
				+ "proceed if you are sure of what you are doing.";
			if (confirm(msg)) {
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

		// We have to request permissions within a user gesture (even though we use this in Zotero.getSystemInfo())
		if (Zotero.isBrowserExt && !Zotero.isDebug) {
			try {
				await browser.permissions.request({permissions: ['management']});
			} catch (e) {
				Zotero.debug(`Management permission request failed: ${e.message || e}`);
			}
		}
		
		try {
			let reportID = await Zotero.Connector_Debug.submitReport();
			let result = await Zotero.ModalPrompt.confirm({
				message: Zotero.getString('reports_debug_output_submitted', 'D' + reportID).replace(/\n/g, '<br/>'),
				button1Text: "OK",
				button2Text: !Zotero.isSafari ? Zotero.getString("general_copyToClipboard") : "",
			});
			if (result.button == 2) {
				navigator.clipboard.writeText('D' + reportID);
			}
		}
		catch (e) {
			alert(Zotero.getString("reports_submission_failed", e.message));
		}
		finally {
			toggleDisabled(submitOutputButton, false);
		}
	},

	/**
	 * Submits an error report
	 */
	submitErrors: async function() {
		var reportErrorsButton = document.getElementById('advanced-button-report-errors');
		toggleDisabled(reportErrorsButton, true);
		
		// We have to request permissions within a user gesture (even though we use this in Zotero.getSystemInfo())
		if (Zotero.isBrowserExt && !Zotero.isDebug) {
			try {
				await browser.permissions.request({permissions: ['management']});
			} catch (e) {
				Zotero.debug(`Management permission request failed: ${e.message || e}`);
			}
		}
		
		try {
			var reportID = await Zotero.Errors.sendErrorReport();
			let result = await Zotero.ModalPrompt.confirm({
				message: Zotero.getString('reports_report_submitted', reportID).replace(/\n/g, '<br/>'),
				button1Text: "OK",
				button2Text: !Zotero.isSafari ? Zotero.getString("general_copyToClipboard") : "",
			});
			if (result.button == 2) {
				navigator.clipboard.writeText(reportID);
			}
		} catch(e) {
			alert(Zotero.getString("reports_submission_failed", e.message));
		} finally {
			toggleDisabled(reportErrorsButton, false);
		}
	}
};

Zotero_Preferences.Components = {};

Zotero_Preferences.Components.ClientStatus = class ClientStatus extends React.Component {
	constructor(props) {
		super(props);
		this.checkStatus();
		this.state = {
			available: false
		};
		
		this.checkStatus = this.checkStatus.bind(this);
	}
	
	checkStatus() {
		return Zotero.Connector.checkIsOnline().then(function(status) {
			this.setState({available: status});
		}.bind(this));
	}
	
	render() {
		let available = <span>available.</span>;
		if (!this.state.available) {
			available = <span>unavailable. If Zotero is open, see the <a href="https://www.zotero.org/support/kb/connector_zotero_unavailable">troubleshooting page</a>.</span>
		}
		return (<div>
			<p>Zotero is currently {available}</p>
			<p><input type="button" value="Update Status" onClick={this.checkStatus}/></p>
		</div>)
	}
};


Zotero_Preferences.Components.ProxySettings = class ProxySettings extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			transparent: Zotero.Prefs.get('proxies.transparent')
		};
		
		this.handleTransparentChange = this.handleTransparentChange.bind(this);
	}

	handleTransparentChange(transparent) {
		this.setState({transparent});
	}

	render() {
		return (
			<div>
				<div className="group">
					<div className="group-title">Proxy Settings</div>
					<div className="group-content">
						<p>Zotero will transparently redirect requests through saved proxies. See the <a href="https://www.zotero.org/support/connector_preferences#proxies">proxy documentation</a> for more information.</p>
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
};


Zotero_Preferences.Components.ProxyPreferences = class ProxyPreferences extends React.Component {
	constructor(props) {
		super(props);
		let state = {};
		let settings = ['transparent', 'autoRecognize', 'showRedirectNotification',
			 'disableByDomain', 'disableByDomainString', 'loopPreventionTimestamp'];
		for (let setting of settings) {
			state[setting] = Zotero.Prefs.get('proxies.'+setting);
		}
		this.state = state;
		
		this.handleCheckboxChange = this.handleCheckboxChange.bind(this);
		this.handleTextInputChange = this.handleTextInputChange.bind(this);
	}
	
	handleCheckboxChange(event) {
		this.updateState(event.target.name, event.target.checked);
	}
	
	handleTextInputChange(event) {
		this.updateState(event.target.name, event.target.value);
	}
	
	reenableProxyRedirection = () => {
		Zotero.Proxies.toggleRedirectLoopPrevention(false);
		this.setState({ loopPreventionTimestamp: 0 });
	}
	
	updateState(name, value) {
		let newState = {};
		newState[name] = value;
		this.setState(newState);
		Zotero.Prefs.set('proxies.'+name, value);
		// Refresh prefs in the background page
		Zotero.Proxies.loadPrefs();
		if (name === 'transparent') {
			this.props.onTransparentChange(value);
		}
	}
	
	render() {
		let autoRecognise = '';
		if (Zotero.isBrowserExt) {
			autoRecognise = <label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="autoRecognize" defaultChecked={this.state.autoRecognize}/>&nbsp;Automatically detect new proxies</label>;
		}
		let redirectLoopPrevention = ''
		if (this.state.loopPreventionTimestamp > Date.now() && this.state.transparent) {
			redirectLoopPrevention = (
				<div className="group">
					<b>Zotero detected a proxy redirect loop and has temporarily suspended automatic proxy redirection.</b> <input type="button" onClick={this.reenableProxyRedirection} value="Re-enable proxy redirection"/>
				</div>
			)
		}
		return (
			<div>
				{redirectLoopPrevention}
				<div>
					<label><input type="checkbox" name="transparent" onChange={this.handleCheckboxChange} defaultChecked={this.state.transparent}/>&nbsp;Enable proxy redirection</label>
					<div style={{marginLeft: "1em"}}>
						<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="showRedirectNotification" defaultChecked={this.state.showRedirectNotification}/>&nbsp;Show a notification when redirecting through a proxy</label>
						<br/>
						{autoRecognise}
						<p>
							<label><input type="checkbox" disabled={!this.state.transparent} onChange={this.handleCheckboxChange} name="disableByDomain" defaultChecked={this.state.disableByDomain}/>&nbsp;Disable proxy redirection when my domain name contains (available when Zotero is running)</label>
							<br/>
							<input style={{marginTop: "0.5em", marginLeft: "1.5em"}} type="text" onChange={this.handleTextInputChange} disabled={!this.state.transparent || !this.state.disableByDomain} name="disableByDomainString" defaultValue={this.state.disableByDomainString}/>
						</p>
					</div>
				</div>
			</div>
		);
	}
};


Zotero_Preferences.Components.ProxyDetails = function ProxyDetails(props) {
	const { transparent, proxy, onProxyChange } = props;

	if (!transparent || !proxy) {
		return "";
	}

	const [toProxyScheme, setToProxyScheme] = React.useState(proxy.toProxyScheme);
	const [toProperScheme, setToProperScheme] = React.useState(proxy.toProperScheme);
	const [hosts, setHosts] = React.useState(proxy.hosts);
	const [currentHostIdx, setCurrentHostIdx] = React.useState(-1);
	const [autoAssociate, setAutoAssociate] = React.useState(proxy.autoAssociate);
	const [isOpenAthens, setIsOpenAthens] = React.useState(proxy.type === 'openathens');
	const [error, setError] = React.useState(null);

	const hostInputRef = React.useRef(null);
	const toProxyInputRef = React.useRef(null);
	const debouncedSetError = React.useRef(
		Zotero.Utilities.debounce(setError, 500)
	).current;

	React.useEffect(() => {
		setToProxyScheme(proxy.toProxyScheme);
		setToProperScheme(proxy.toProperScheme);
		setHosts(proxy.hosts);
		setCurrentHostIdx(-1);
		setAutoAssociate(proxy.autoAssociate);
		setIsOpenAthens(proxy.type === 'openathens');
	}, [proxy?.id]);

	React.useLayoutEffect(() => {
		// Focus the toProxyScheme input if proxy is new
		toProxyScheme.includes('example.com') && toProxyInputRef.current?.focus();
	}, [toProxyScheme])

	React.useLayoutEffect(() => {
		// Focus the host input if host is new
		hosts[currentHostIdx]?.length === 0 && hostInputRef.current?.focus();
	}, [currentHostIdx])

	React.useEffect(() => {
		(async () => {
			let updatedProxy = Object.assign(
				{},
				proxy,
				{
					toProxyScheme: toProxyScheme,
					toProperScheme: toProperScheme,
					hosts: hosts.filter(h => h.length),
					autoAssociate: autoAssociate
				}
			);
			if (isOpenAthens) {
				updatedProxy.type = 'openathens';
			} else {
				delete updatedProxy.type;
			}
			let error = await Zotero.Proxies.validate(updatedProxy);
			if (error?.[0] === "proxy_validate_schemeUnmodified") error = null;

			// Debounce showing errors, but clear them immediately when valid
			if (error) {
				debouncedSetError(error);
			} else {
				// But we still need to call it, otherwise the debounced function with the error
				// is called after the timeout
				debouncedSetError(null);
				setError(null);
			}
			if (error?.[0] === "proxy_validate_hostProxyExists") {
				updatedProxy.hosts = updatedProxy.hosts.filter(h => h != error[1]);
			}
			else if (error) return;

			saveProxy(updatedProxy);
			onProxyChange(updatedProxy);
		})();
	}, [toProxyScheme, toProperScheme, hosts, autoAssociate, isOpenAthens])

	var multiHost = toProperScheme?.includes('%h') || toProxyScheme?.includes('%u');

	const saveProxy = React.useRef(
		Zotero.Utilities.debounce(Zotero.Proxies.save.bind(Zotero.Proxies), 200)
	).current;

	let disableRemoveHost = currentHostIdx == -1;

	function handleSchemeChange(event) {
		var value = event.target.value;
		var name = event.target.name;
		if (name == 'toProxyScheme') {
			setToProxyScheme(value);
		}
		else if (name == 'toProperScheme') {
			setToProperScheme(value);
		}
	}

	function handleOpenAthensDomainChange(event) {
		var domain = event.target.value;
		var newToProxyScheme = domain ? `https://go.openathens.net/redirector/${domain}?url=%u` : '';
		setToProxyScheme(newToProxyScheme);
	}

	function handleCheckboxChange(event) {
		var target = event.target;
		setAutoAssociate(target.checked);
		
	}

	function handleTypeChange(event) {
		var value = event.target.value;
		const isOpenAthens = value === 'openathens';
		setIsOpenAthens(isOpenAthens);
		if (isOpenAthens) {
			setToProxyScheme('https://go.openathens.net/redirector/?url=%u');
		} else {
			setToProxyScheme('https://www.example.com/login?qurl=%u');
		}
	}

	function handleHostSelectChange(event) {
		setCurrentHostIdx(event.target.value !== "" ? parseInt(event.target.value) : -1);
	}

	function handleAddHost() {
		setHosts(hosts.concat(['']));
		setCurrentHostIdx(hosts.length);
	}

	function handleRemoveHost() {
		setHosts(hosts.filter((h, i) => i != currentHostIdx));
		if (hosts.length - 1) {
			setCurrentHostIdx(Math.max(0, currentHostIdx - 1));
		}
		else {
			setCurrentHostIdx(-1);
		}
	}

	function handleHostnameChange(event) {
		var value = event.target.value;
		setHosts(hosts.map((h, i) => i == currentHostIdx ? value : h));
	}

	function getOpenAthensDomain() {
		if (!toProxyScheme) return '';
		var match = toProxyScheme.match(/\/redirector\/([^?]+)/);
		return match ? match[1] : '';
	}
	function _renderProxyInput() {
		return (
			<div className="proxy-grid">
				<label htmlFor="to-proxy-scheme-input">Login URL Scheme:</label>
				<input id="to-proxy-scheme-input" style={{flexGrow: "1"}} type="text" name="toProxyScheme" onChange={handleSchemeChange} value={toProxyScheme || ""} ref={toProxyInputRef}/>
				<label htmlFor="to-proper-scheme-input">Proxied URL Scheme:</label>
				<input id="to-proper-scheme-input" style={{flexGrow: "1"}} type="text" name="toProperScheme" onChange={handleSchemeChange} value={toProperScheme || ""}/>
			</div>
		)
	}

	function _renderOpenAthensInput() {
		return (
			<div className="proxy-grid">
				<label htmlFor="openathens-domain-input">OpenAthens Redirector Domain:</label>
				<input id="openathens-domain-input" style={{flexGrow: "1"}} type="text" name="openathensDomain" onChange={handleOpenAthensDomainChange} value={getOpenAthensDomain() || ""} placeholder="yourinstitution.ac.uk"/>
			</div>
		)
	}

	return (
		<div className="group" style={{marginTop: "10px"}}>
			<p>
				<label><input type="radio" name="proxyType" value="ezproxy" checked={!isOpenAthens} onChange={handleTypeChange}/>URL-rewriting proxy (e.g., EZproxy)</label>
				<label><input type="radio" name="proxyType" value="openathens" checked={isOpenAthens} onChange={handleTypeChange}/>OpenAthens</label>
			</p>

			{multiHost && !isOpenAthens &&
				<p>
					<label><input type="checkbox" name="autoAssociate" onChange={handleCheckboxChange} checked={autoAssociate}/>&nbsp;Automatically associate new hosts</label>
				</p>
			}
			{isOpenAthens ? _renderOpenAthensInput() : _renderProxyInput()}

			{error && <p style={{color: "red"}}>{Zotero.getString(error[0], error.slice(1))}</p>}

			{!isOpenAthens &&
				<p>
					You may use the following variables in your proxy schemes:<br/>
					&#37;h - The hostname of the proxied site (e.g., www.example.com)<br/>
					&#37;p - The path of the proxied page excluding the leading slash (e.g., about/index.html)<br/>
					&#37;u - Full encoded proxied site url (e.g. https://www.example.com/about/index.html)
				</p>
			}
			
			<div style={{display: "flex", flexDirection: "column", marginTop: "10px"}}>
				<label>Hostnames</label>
				<select className="Preferences-Proxies-hostSelect" size="8" multiple
						value={[currentHostIdx != -1 ? currentHostIdx : '']}
						onChange={handleHostSelectChange}>
					{hosts.map((host, i) =>
						<option key={i} value={i}>{host}</option>)}
				</select>
				<p>
					<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={handleAddHost} value="+"/>
					<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={handleRemoveHost} disabled={disableRemoveHost} value="-"/>
				</p>
				
				<p style={{display: currentHostIdx === -1 ? 'none' : 'flex'}}>
					<label>Hostname:
						<input style={{flexGrow: '1'}}
							type="text"
							value={hosts[currentHostIdx] || ""}
							onChange={handleHostnameChange} ref={hostInputRef}/>
					</label>
				</p>
			</div>
		</div>
	);
};


Zotero_Preferences.Components.Proxies = function Proxies(props) {
	const [proxies, setProxies] = React.useState(() =>
		Zotero.Prefs.get('proxies.proxies').map((proxy) => {
			proxy.toProperScheme = proxy.toProperScheme || proxy.scheme;
			return proxy;
		})
	);
	const [currentProxyIdx, setCurrentProxyIdx] = React.useState(-1);

	function onProxyChange(updatedProxy) {
		setProxies((prev) => prev.map((p, i) => i == currentProxyIdx ? updatedProxy : p));
	}

	function handleProxySelectChange(event) {
		var target = event.target;
		setCurrentProxyIdx(proxies.findIndex(p => p.id == target.value));
	}

	function handleProxyAdd() {
		setProxies((prev) => prev.concat([{
			id: Date.now(),
			toProxyScheme: 'https://www.example.com/login?qurl=%u',
			toProperScheme: '%h.example.com/%p',
			autoAssociate: true,
			hosts: []
		}]));
		setCurrentProxyIdx(proxies.length);
	}

	function handleProxyRemove() {
		setProxies((prev) => prev.filter((p, i) => i != currentProxyIdx));
		setCurrentProxyIdx(Math.max(0, currentProxyIdx - 1));
		Zotero.Proxies.remove(proxies[currentProxyIdx]);
	}

	return (
		<div style={{display: "flex", flexDirection: "column"}}>
			<select className="Preferences-Proxies-proxySelect" size="8" multiple
					value={[currentProxyIdx != -1 ? proxies[currentProxyIdx].id : '']}
					onChange={handleProxySelectChange}
					disabled={!props.transparent}>
				{proxies.length && proxies.map((proxy, i) => {
					return <option key={i} value={proxy.id}>{proxy.toProxyScheme || proxy.toProperScheme}</option>;
				})}
			</select>
			<p style={{display: props.transparent ? null : 'none'}}>
				<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={handleProxyAdd} value="+"/>
				<input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={handleProxyRemove} disabled={!currentProxyIdx} value="-"/>
			</p>
			
			<Zotero_Preferences.Components.ProxyDetails
				transparent={props.transparent}
				proxy={proxies[currentProxyIdx]}
				onProxyChange={onProxyChange}
			/>
		</div>
	);
};


Zotero_Preferences.Components.MIMETypeHandling = class MIMETypeHandling extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			enabled: Zotero.Prefs.get('interceptKnownFileTypes'),
			hosts: Zotero.Prefs.get('allowedInterceptHosts'),
			currentHostIdx: -1
		};
		
		this.handleCheckboxChange = this.handleCheckboxChange.bind(this);
		this.handleSelectChange = this.handleSelectChange.bind(this);
		this.handleHostnameChange = this.handleHostnameChange.bind(this);
		this.handleHostRemove = this.handleHostRemove.bind(this);
	}

	componentWillMount() {
		this.updateHosts = Zotero.Utilities.debounce(this.updateHosts, 200);
	}
	
	handleCheckboxChange(event) {
		const isEnabled = event.target.checked;
		Zotero.Prefs.set('interceptKnownFileTypes', isEnabled);
		this.setState({enabled: isEnabled});
		if (isEnabled) {
			Zotero.ContentTypeHandler.enable();
		} else {
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	handleSelectChange(event) {
		this.setState({
			currentHostIdx: event.target.value !== "" ? event.target.value : -1
		});
	}
	
	handleHostnameChange(event) {
		this.state.hosts[this.state.currentHostIdx] = event.target.value;
		this.updateHosts(this.state.hosts);
	}
	
	handleHostRemove() {
		this.setState((prevState) => {
			var newState = {
				hosts: [
					...prevState.hosts.slice(0, this.state.currentHostIdx),
					...prevState.hosts.slice(this.state.currentHostIdx + 1)
				],
				currentHostIdx: -1
			};
			this.updateHosts(newState.hosts)
			return newState;
		});
	}
	
	updateHosts(hosts) {
		this.setState({hosts});
		Zotero.Prefs.set('allowedInterceptHosts', hosts);
	}
	
	render() {
		var hosts;
		if (this.state.hosts.length) {
			hosts = this.state.hosts.map((h, i) => <option value={i} key={i}>{h}</option>);
		} else {
			hosts = null;
		}
		let hostname = '';
		if (this.state.currentHostIdx != -1) {
			hostname = <p style={{display: this.state.currentHostIdx === -1 ? 'none' : 'flex'}}>
				<label style={{alignSelf: 'center'}}>Hostname: </label>
				<input style={{flexGrow: '1'}} type="text" defaultValue={this.state.hosts[this.state.currentHostIdx] || ''} onChange={this.handleHostnameChange}/>
			</p>
		}
		
		var disabled = this.state.currentHostIdx == -1;
		
		return (
			<div>
				<p>Available when Zotero is running</p>
				<p>
					<label><input type="checkbox" onChange={this.handleCheckboxChange} name="enabled" defaultChecked={this.state.enabled}/>&nbsp;Import BibTeX/RIS/Refer files into Zotero</label>
				</p>
				<div style={{display: this.state.enabled ? 'flex' : 'none', flexDirection: "column", marginTop: "10px"}}>
					<label>Enabled Hostnames</label>
					<select className="Preferences-MIMETypeHandling-hostSelect" size="8" multiple
							value={this.state.currentHostIdx}
							onChange={this.handleSelectChange}>
						{hosts}
					</select>
					<p> <input style={{minWidth: "80px", marginRight: "10px"}} type="button" onClick={this.handleHostRemove} disabled={disabled} value="Remove"/> </p>
					{hostname}
				</div>

			</div>
		);
	}
};



// Customized built-in web component: <input is="shortcut-input">
class ShortcutInput extends HTMLInputElement {
	constructor() {
		super();
		this._connected = false;
		this._keys = ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'];
	}

	async connectedCallback() {
		if (this._connected) return;
		this._connected = true;
		this.setAttribute('autocomplete', 'off');
		this.setAttribute('spellcheck', 'false');
		this.addEventListener('keydown', this._handleKeyDown);
		this.addEventListener('blur', this._handleBlur);
		await Zotero.initDeferred.promise;
		await this._updateFromPref();
	}

	disconnectedCallback() {
		this.removeEventListener('keydown', this._handleKeyDown);
		this.removeEventListener('blur', this._handleBlur);
		this._connected = false;
	}

	get _prefName() {
		return this.dataset.pref;
	}

	async _updateFromPref() {
		let modifiers = await Zotero.Prefs.getAsync(this._prefName) || {};
		this.value = Zotero.Utilities.Connector.kbEventToShortcutString(modifiers);
		this.classList.remove('invalid');
	}

	_handleKeyDown = async (e) => {
		if (e.key == 'Tab') return;
		e.preventDefault();
		let modifiers = {};
		let invalid = false;
		for (let key of this._keys) {
			modifiers[key] = e[key];
		}
		if (e.key.length == 1) {
			modifiers.key = e.key;
		} else {
			modifiers.key = '';
		}
		if (e.key == 'Backspace' || e.key == 'Escape' || e.key == 'Delete') {
			Zotero.Prefs.clear(this._prefName);
			await this._updateFromPref();
			return;
		}
		if (modifiers.key && this._keys.some(k => modifiers[k])) {
			Zotero.Prefs.set(this._prefName, modifiers);
		} else {
			invalid = true;
		}
		this.value = Zotero.Utilities.Connector.kbEventToShortcutString(modifiers);
		if (invalid) {
			this.classList.add('invalid');
		} else {
			this.classList.remove('invalid');
		}
	}

	_handleBlur = async () => {
		let saved = await Zotero.Prefs.getAsync(this._prefName) || {};
		if (!saved.key || !this._keys.some(k => saved[k])) {
			await this._updateFromPref();
		}
	}
}

try {
	customElements.define('shortcut-input', ShortcutInput, { extends: 'input' });
} catch (e) {}

window.addEventListener("load", Zotero_Preferences.init, false);
