/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009-2012 Center for History and New Media
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

Zotero.Connector_Browser = new function() {
	var _tabInfo = {};
	var _incompatibleVersionMessageShown;
	var _injectTranslationScripts = [
		/*INJECT SCRIPTS*/
	];
	// Exposed for tests
	this._tabInfo = _tabInfo;
	
	/**
	 * Called when translators are available for a given page
	 */
	this.onTranslators = function(translators, instanceID, contentType, tab, frameId) {
		_enableForTab(tab.id);

		let existingTranslators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		// If translators already exist for tab we need to figure out if the new translators
		// are more important/higher priority
		if (existingTranslators) {
			if (!translators.length) return;
			
			if (existingTranslators.length) {
				let existingTranslatorsHaveHigherPriority = existingTranslators[0].priority < translators[0].priority;
				if (existingTranslatorsHaveHigherPriority) return;
				
				let priorityEqual = translators[0].priority == existingTranslators[0].priority;
				let newTranslatorsAreFromTopFrame = frameId == 0;
				if (priorityEqual && !newTranslatorsAreFromTopFrame) return;
			}	
		}
		
		var isPDF = contentType == 'application/pdf';
		_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {}, {translators, instanceID, isPDF});
		
		_updateExtensionUI(tab);
	}

	/**
	 * If there's a frame with a PDF mimeType this gets invoked
	 * @param frameURL
	 * @param tabId
	 */
	this.onPDFFrame = function(frameURL, frameId, tabId) {
		if (_tabInfo[tabId] && _tabInfo[tabId].translators.length) {
			return;
		}
		browser.tabs.get(tabId).then(function(tab) {
			_tabInfo[tab.id] = {translators: [], isPDF: true, frameId};
			Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
			_updateExtensionUI(tab);
		});
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, tab) {
		var width, height, left, top;
		return browser.windows.get(tab.windowId, null).then(function (win) {
			width = 600;
			height = 325;
			left = Math.floor(win.left + (win.width / 2) - (width / 2));
			top = Math.floor(win.top + (win.height / 2) - (height / 2));
			
			return browser.windows.create(
				{
					url: browser.extension.getURL("itemSelector/itemSelector.html")
						+ "#" + encodeURIComponent(JSON.stringify([tab.id, items]))
						// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
						.replace(/%3A/g, 'ZOTEROCOLON'),
					height: height,
					width: width,
					top: top,
					left: left,
					type: 'popup'
				})
		}).then(function (win) {
			// Fix positioning in Chrome when window is on second monitor
			// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
			if (Zotero.isChrome && win.left < left) {
				browser.windows.update(win.id, { left: left });
			}
			return new Promise(function(resolve) {
				_tabInfo[tab.id].selectCallback = resolve;
			});
		});
	}
	
	/**
	 * Called when a tab is removed or the URL has changed
	 */
	this.onPageLoad = function(tab) {
		if(tab) _clearInfoForTab(tab.id);
	}
	
	/**
	 * Called when Zotero goes online or offline
	 * @param [String|Boolean] version - either `false` or version string from X-Zotero-Version header
	 */
	this.onStateChange = function(version) {
		if (version) {
			Zotero.Prefs.set('firstSaveToServer', true);
			// TODO: Enable once 5.0 is out, so that ContentTypeHandlers show an upgradeClient message instead
			parseInt(version[0]) >= 5 && Zotero.ContentTypeHandler.enable();
		} else {
			for (var i in _tabInfo) {
				if (_tabInfo[i].translators && _tabInfo[i].translators.length) {
					_tabInfo[i].translators = _tabInfo[i].translators.filter(
						(t) => t.runMode !== Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE);
				}
			}
			
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	this.onTabActivated = function(tab) {
		_updateExtensionUI(tab);
	};
	
	/**
	 * Called if Zotero version is determined to be incompatible with Standalone
	 */
	this.onIncompatibleStandaloneVersion = function(zoteroVersion, standaloneVersion) {
		if(_incompatibleVersionMessageShown) return;
		alert('Zotero Connector for Chrome '+zoteroVersion+' is incompatible with the running '+
			'version of Zotero Standalone'+(standaloneVersion ? " ("+standaloneVersion+")" : "")+
			'. Zotero Connector will continue to operate, but functionality that relies upon '+
			'Zotero Standalone may be unavaliable.\n\n'+
			'Please ensure that you have installed the latest version of these components. See '+
			'https://www.zotero.org/download for more details.');
		_incompatibleVersionMessageShown = true;
	}

	/**
	 * Checks whether a given frame has any matching translators. Injects translation code
	 * if translators are found.
	 * 
	 * @param tab
	 * @param frameId
	 * @param url - url of the frame
	 */
	this.onFrameLoaded = Zotero.Promise.method(function(tab, frameId, url) {
		if (_isDisabledForURL(tab.url) && frameId == 0 || _isDisabledForURL(url)) {
			return;
		}
		if (frameId == 0) {
			// Always inject in the top-frame
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
		} else {
			if (!(tab.id in _tabInfo)) {
				_tabInfo[tab.id] = {};
			}
			if (!_tabInfo[tab.id].frameChecked) {
				// Also in the first frame detected
				// See https://github.com/zotero/zotero-connectors/issues/156
				_tabInfo[tab.id].frameChecked = true;
				return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
			}
		}
		return Zotero.Translators.getWebTranslatorsForLocation(url, tab.url).then(function(translators) {
			if (translators[0].length == 0) {
				Zotero.debug("Not injecting. No translators found for [tab.url, url]: " + tab.url + " , " + url);
				return;
			}
			Zotero.debug(translators[0].length+  " translators found. Injecting into [tab.url, url]: " + tab.url + " , " + url);
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
		});
	});

	/**
	 * Checks whether translation scripts are already injected into a frame and if not - injects
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectTranslationScripts = function(tab, frameId=0) {
		// Prevent triggering multiple times
		let key = tab.id+'-'+frameId;
		let deferred = this.injectTranslationScripts[key];
		if (deferred) {
			Zotero.debug(`Connector_Browser.injectTranslationScripts: Script injection already in progress for ${key} : ${tab.url}`);
			return deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		this.injectTranslationScripts[key] = deferred;
		deferred.promise.catch(function(e) {
			Zotero.debug(`Connector_Browser.injectTranslationScripts: Script injection rejected ${key}`);
			Zotero.logError(e);
		}).then(function() {
			delete Zotero.Connector_Browser.injectTranslationScripts[key];
		});
		
		Zotero.Messaging.sendMessage('ping', null, tab, frameId).then(function(response) {
			if (response && frameId == 0) return deferred.resolve();
			Zotero.debug(`Injecting translation scripts into ${frameId} ${tab.url}`);
			return Zotero.Connector_Browser.injectScripts(_injectTranslationScripts, tab, frameId)
			.then(deferred.resolve).catch(deferred.reject);
		});
		return deferred.promise;
	};

	/**
	 * Injects custom scripts
	 * 
	 * @param scripts {Object[]} array of scripts to inject
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectScripts = function(scripts, tab, frameId=0) {
		if (! Array.isArray(scripts)) scripts = [scripts];
		// Make sure we're not changing the original list
		scripts = Array.from(scripts);
		var promises = [];
		Zotero.debug(`Injecting scripts into ${tab.url} : ${scripts.join(', ')}`);
		let promise = injectRemaining(scripts);
		let timedOut = false;
		
		function awaitReady(readyMsg) {
			if (timedOut) return false;
			return browser.tabs.sendMessage(tab.id, readyMsg, {frameId: frameId}).catch(() => undefined)
			.then(function(response) {
				if (!response) {
					return Zotero.Promise.delay(100).then(() => awaitReady(tab));
				}
				Zotero.debug(`Injection complete ${frameId} : ${tab.url}`);
				return true;
			});
		}
		
		function injectRemaining(scripts) {
			if (scripts.length) {
				let script = scripts.shift();
				return browser.tabs.executeScript(tab.id, {file: script, frameId, runAt: 'document_end'})
				.catch(() => undefined).then(() => injectRemaining(scripts));
			}
			let readyMsg = `ready${Date.now()}`;
			return browser.tabs.executeScript(tab.id, {
				code: `browser.runtime.onMessage.addListener(function awaitReady(request) {
					if (request == '${readyMsg}') {
						browser.runtime.onMessage.removeListener(awaitReady);
						return Promise.resolve(true);
					}
				})`,
				frameId,
				runAt: 'document_end'
			}).then(() => awaitReady(readyMsg));
			
		}

		// Unfortunately firefox sometimes neither rejects nor resolves tabs#executeScript(). Testing proxied
		// http://www.ams.org/mathscinet/search/publdoc.html?pg1=INDI&s1=916336&sort=Newest&vfpref=html&r=1&mx-pid=3439694
		// with a fresh browser session consistently reproduces the bug. The injection may be partial, but we need to
		// resolve this promise somehow, so we reject in the event of timeout.
		// UPDATE 2017-08-29 seems to no longer be the case, but this is a generally nice safeguard that is good to
		// have. Let's keep an eye out for these failed injections in reports.
		return Zotero.Promise.all([promise, new Promise(function(resolve, reject) {
			let timeout = setTimeout(function() {
				reject(new Error (`Script injection timed out ${tab.url}`));
				timedOut = true;
			}, 3000);
			promise.then(function() {
				resolve();
				clearTimeout(timeout);
			});
		})]).then((result) => result[0]);
		
	};

	this.openTab = function(url, tab) {
		if (tab) {
			let tabProps = { index: tab.index + 1 };
			// Firefox doesn't support openerTabId
			if (!Zotero.isFirefox) {
				tabProps.openerTabId = tab.id;
			}
			browser.tabs.create(Object.assign({url}, tabProps));
		} else {
			browser.tabs.query({active: true, lastFocusedWindow: true}).then((tabs) => this.openTab(url, tabs[0]));
		}
	};
	
	this.openPreferences = function(paneID, tab) {
		this.openTab(browser.extension.getURL(`preferences/preferences.html#${paneID}`), tab);
	};
	
	this.openConfigEditor = function(tab) {
		this.openTab(browser.extension.getURL(`preferences/config.html`), tab);
	};

	/**
	 * Display an old-school firefox notification by injecting HTML directly into DOM.
	 * This has a side-effect of navigation (user-initiated or JS-redirect-based) 
	 * removing the notification so we keep on re-injecting it into DOM.
	 * 
	 * The timeout argument specifies how long the notification has to be displayed for
	 * without navigation, before it is considered "seen" and further navigation on the tab
	 * will not make it re-appear.
	 * 
	 * @param {String} text
	 * @param {String[]} buttons - labels for buttons
	 * @param {Number} [seenTimeout=5000]
	 * @param {Tab} [tab=currentTab]
	 * @returns {Promise{Number}} button pressed idx or undefined if timed-out and navigated away from
	 */
	this.notify = function(text, buttons, seenTimeout=5000, tab=null) {
		// Get current tab if not provided
		if (!tab) {
			return browser.tabs.query({active: true, lastFocusedWindow: true})
			.then((tabs) => this.notify(text, buttons, seenTimeout, tabs[0]));
		} else if (typeof tab === 'number') {
			return browser.tabs.get(tab).then((tab) => this.notify(text, buttons, seenTimeout, tab));
		}
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		return Zotero.Messaging.sendMessage('notify', [text, buttons, null, tab.status], tab).then(function(response) {
			if (response != undefined || timedOut) return response;
			
			// Tab url changed or tab got removed, hence the undefined response
			// Wait half a sec to not run a busy-waiting loop
			return Zotero.Promise.delay(500)
			.then(function() {
				return new Zotero.Promise(function(resolve) {
					browser.tabs.get(tab.id).then(function(tab) {
						if (!tab) return;
						// If it still exists try again
						// But make sure translation scripts are injected first
						return this.injectTranslationScripts(tab)
							.then(() => resolve(this.notify(text, buttons, seenTimeout, tab)));
					}.bind(this));
				}.bind(this))
			}.bind(this));
		}.bind(this));
	};

	/**
	 * Update status and tooltip of Zotero button
	 */
	function _updateExtensionUI(tab) {
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) return _showFirstUseUI(tab);
		browser.contextMenus.removeAll();

		if (_isDisabledForURL(tab.url, true)) {
			_showZoteroStatus();
			return;
		} else {
			_enableForTab(tab.id);
		}
		
		var isPDF = _tabInfo[tab.id] && _tabInfo[tab.id].isPDF;
		var translators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		
		// Show the save menu if we have more than one save option to show, which is true in all cases
		// other than for PDFs with no translator
		var showSaveMenu = (translators && translators.length) || !isPDF;
		var showProxyMenu = !isPDF
			&& Zotero.Proxies.proxies.length > 0
			// Don't show proxy menu if already proxied
			&& !Zotero.Proxies.proxyToProper(tab.url, true);
		
		var saveMenuID;
		if (showSaveMenu) {
			saveMenuID = "zotero-context-menu-save-menu";
			browser.contextMenus.create({
				id: saveMenuID,
				title: "Save to Zotero",
				contexts: ['all']
			});
		}
		
		if (translators && translators.length) {
			_showTranslatorIcon(tab, translators[0]);
			_showTranslatorContextMenuItem(translators, saveMenuID);
		} else if (isPDF) {
			Zotero.Connector_Browser._showPDFIcon(tab);
		} else {
			_showWebpageIcon(tab);
		}
		
		if (isPDF) {
			_showPDFContextMenuItem(saveMenuID);
		} else {
			_showWebpageContextMenuItem(saveMenuID);
		}
		
		// If unproxied, show "Reload via Proxy" options
		if (showProxyMenu) {
			_showProxyContextMenuItems(tab.url);
		}
		
		if (Zotero.isFirefox) {
			_showPreferencesContextMenuItem();
		}
	}
	
	function _showFirstUseUI(tab) {
		var icon = `${Zotero.platform}/zotero-z-${window.devicePixelRatio > 1 ? 32 : 16}px-australis.png`;
		browser.browserAction.setIcon({
			tabId: tab.id,
			path: `images/${icon}`
		});
		browser.browserAction.setTitle({
			tabId: tab.id,
			title: "Zotero Connector"
		});
		browser.browserAction.enable(tab.id);
	}
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID, changeInfo) {
		if (tabID in _tabInfo) {
			_tabInfo[tabID].frameChecked = false;
		}
		if (changeInfo && !changeInfo.url) return;
		delete _tabInfo[tabID];
	}
	
	function _isDisabledForURL(url, excludeTests=false) {
		return url.includes('chrome://') || url.includes('about:') || (url.includes('-extension://') && (!excludeTests || !url.includes('/test/data/')));
	}
	
	function _showZoteroStatus(tabID) {
		Zotero.Connector.checkIsOnline().then(function(isOnline) {
			var icon, title;
			if (isOnline) {
				icon = "images/zotero-new-z-16px.png";
				title = "Zotero is Online";
			} else {
				icon = "images/zotero-z-16px-offline.png";
				title = "Zotero is Offline";
			}
			browser.browserAction.setIcon({
				tabId:tabID,
				path:icon
			});
			
			browser.browserAction.setTitle({
				tabId:tabID,
				title: title
			});
		});
		browser.browserAction.disable(tabID);
		browser.contextMenus.removeAll();
	}
	
	function _enableForTab(tabID) {
		browser.browserAction.enable(tabID);
	}
	
	function _showTranslatorIcon(tab, translator) {
		var itemType = translator.itemType;
		
		browser.browserAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		browser.browserAction.setTitle({
			tabId:tab.id,
			title: _getTranslatorLabel(translator)
		});
	}
	
	function _showWebpageIcon(tab) {
		browser.browserAction.setIcon({
			tabId: tab.id,
			path: Zotero.ItemTypes.getImageSrc("webpage-gray")
		});
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		let title = `Save to Zotero (Web Page ${withSnapshot ? 'with' : 'without'} Snapshot)`;
		browser.browserAction.setTitle({tabId: tab.id, title});
	}
	
	this._showPDFIcon = function(tab) {
		browser.browserAction.setIcon({
			tabId: tab.id,
			path: browser.extension.getURL('images/pdf.png')
		});
		browser.browserAction.setTitle({
			tabId: tab.id,
			title: "Save to Zotero (PDF)"
		});
	}
	
	function _showTranslatorContextMenuItem(translators, parentID) {
		for (var i = 0; i < translators.length; i++) {
			browser.contextMenus.create({
				id: "zotero-context-menu-translator-save" + i,
				title: _getTranslatorLabel(translators[i]),
				onclick: (function (i) {
					return function (info, tab) {
						Zotero.Connector_Browser._saveWithTranslator(tab, i);
					};
				})(i),
				parentId: parentID,
				contexts: ['page', 'browser_action']
			});
		}
	}
	
	function _showWebpageContextMenuItem(parentID) {
		var fns = [];
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withSnapshot-save",
			title: "Save to Zotero (Web Page with Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab, 0, true);
			},
			parentId: parentID,
			contexts: ['page', 'browser_action']
		}));
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withoutSnapshot-save",
			title: "Save to Zotero (Web Page without Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab, 0, false);
			},
			parentId: parentID,
			contexts: ['page', 'browser_action']
		}));
		// Swap order if automatic snapshots disabled
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		if (!withSnapshot) {
			fns = [fns[1], fns[0]];
		}
		fns.forEach((fn) => fn());
	}
	
	function _showPDFContextMenuItem(parentID) {
		browser.contextMenus.create({
			id: "zotero-context-menu-pdf-save",
			title: "Save to Zotero (PDF)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab);
			},
			parentId: parentID,
			contexts: ['all']
		});
	}
	
	function _showProxyContextMenuItems(url) {
		var parentID = "zotero-context-menu-proxy-reload-menu";
		browser.contextMenus.create({
			id: parentID,
			title: "Reload via Proxy",
			contexts: ['page', 'browser_action']
		});
		
		var i = 0;
		for (let proxy of Zotero.Proxies.proxies) {
			let proxied = proxy.toProxy(url);
			browser.contextMenus.create({
				id: `zotero-context-menu-proxy-reload-${i++}`,
				title: `Reload as ${proxied}`,
				onclick: function () {
					browser.tabs.update({ url: proxied });
				},
				parentId: parentID,
				contexts: ['page', 'browser_action']
			});
		}
	}
	
	function _showPreferencesContextMenuItem() {
		browser.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-pref-separator",
			contexts: ['all']
		});
		browser.contextMenus.create({
			id: "zotero-context-menu-preferences",
			title: "Preferences",
			onclick: function () {
				browser.tabs.create({url: browser.extension.getURL('preferences/preferences.html')});
			},
			contexts: ['all']
		});
	}
	
	function _browserAction(tab) {
		if (Zotero.Prefs.get('firstUse') && Zotero.isFirefox) {
			Zotero.Messaging.sendMessage("firstUse", null, tab)
			.then(function () {
				Zotero.Prefs.set('firstUse', false);
				_updateExtensionUI(tab);
			});
		}
		else if(_tabInfo[tab.id] && _tabInfo[tab.id].translators && _tabInfo[tab.id].translators.length) {
			Zotero.Connector_Browser._saveWithTranslator(tab, 0);
		} else {
			if (_tabInfo[tab.id] && _tabInfo[tab.id].isPDF) {
				Zotero.Connector_Browser._saveAsWebpage(tab, _tabInfo[tab.id].frameId, true);
			} else {
				let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
					Zotero.Prefs.get('automaticSnapshots');
				Zotero.Connector_Browser._saveAsWebpage(tab, 0, withSnapshot);
			}
		}
	}
	
	this._saveWithTranslator = function(tab, i) {
		// Set frameId to null - send message to all frames
		// There is code to figure out which frame should translate with instanceID.
		return Zotero.Messaging.sendMessage("translate", [
			_tabInfo[tab.id].instanceID,
			_tabInfo[tab.id].translators[i].translatorID
		], tab, null);
	}
	
	this._saveAsWebpage = function(tab, frameId, withSnapshot) {
		if (tab.id != -1) {
			return Zotero.Messaging.sendMessage("saveAsWebpage", [tab.title, withSnapshot], tab, frameId);
		}
		// Handle right-click on PDF overlay, which exists in a weird non-tab state
		else {
			browser.tabs.query(
				{
					lastFocusedWindow: true,
					active: true
				}).then(function (tabs) {
					Zotero.Messaging.sendMessage("saveAsWebpage", tabs[0].title, tabs[0]);
				}
			);
		}
	}
	
	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		return "Save to Zotero (" + translatorName + ")";
	}
	
	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		_tabInfo[data[0]].selectCallback(data[1]);
	});
	
	browser.tabs.onRemoved.addListener(_clearInfoForTab);

	browser.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
		// Ignore item selector
		if (tab.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html") === 0)) return;
		_clearInfoForTab(tabID, changeInfo);
		_updateExtensionUI(tab);
		if(!changeInfo.url) return;
		Zotero.debug("Connector_Browser: URL changed for tab " + tab.url);
		// Rerun translation
		Zotero.Messaging.sendMessage("pageModified", null, tab);
		tab.active && Zotero.Connector.reportActiveURL(tab.url);
	});
	
	browser.tabs.onActivated.addListener(function(activeInfo) {
		return browser.tabs.get(activeInfo.tabId).then(function(tab) {
			// Ignore item selector
			if (tab.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html") === 0)) return;
			Zotero.debug("Connector_Browser: onActivated for " + tab.url);
			Zotero.Connector_Browser.onTabActivated(tab);
			Zotero.Connector.reportActiveURL(tab.url);
		}).catch((e) => {Zotero.logError(e); throw(e)});
	});

	browser.browserAction.onClicked.addListener(_browserAction);
	
	browser.webNavigation.onDOMContentLoaded.addListener(function(details) {
		return browser.tabs.get(details.tabId).then(function(tab) {
			Zotero.debug("Connector_Browser: onDOMContentLoaded for " + tab.url + "; " + details.url);
			Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
		}).catch((e) => {Zotero.logError(e); throw(e)});
	});
}

Zotero.initGlobal();
