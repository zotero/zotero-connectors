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
				let existingTranslatorsHaveHigherPriority = existingTranslators[0].priority > translators[0].priority;
				if (existingTranslatorsHaveHigherPriority) return;
				
				let priorityEqual = translators[0].priority == existingTranslators[0].priority;
				let newTranslatorsAreFromTopFrame = frameId == 0;
				if (priorityEqual && !newTranslatorsAreFromTopFrame) return;
			}	
		}
		
		var isPDF = contentType == 'application/pdf';
		_tabInfo[tab.id] = {translators, instanceID, isPDF};
		
		_updateExtensionUI(tab);
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = function(items, callback, tab) {
		return new Zotero.Promise(function(resolve) {
			chrome.windows.get(tab.windowId, null, function (win) {
				var width = 600;
				var height = 325;
				var left = Math.floor(win.left + (win.width / 2) - (width / 2));
				var top = Math.floor(win.top + (win.height / 2) - (height / 2));
				
				chrome.windows.create(
					{
						url: chrome.extension.getURL("itemSelector/itemSelector.html")
							+ "#" + encodeURIComponent(JSON.stringify([tab.id, items]))
							// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
							.replace(/%3A/g, 'ZOTEROCOLON'),
						height: height,
						width: width,
						top: top,
						left: left,
						type: 'popup'
					},
					function (win) {
						// Fix positioning in Chrome when window is on second monitor
						// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
						if (Zotero.isChrome && win.left < left) {
							chrome.windows.update(win.id, { left: left });
						}
						_tabInfo[tab.id].selectCallback = resolve;
					}
				);
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
	this.onFrameLoaded = function(tab, frameId, url) {
		if (_isDisabledForURL(tab.url) || _isDisabledForURL(url)) {
			return;
		}
		// Always inject in the top-frame
		if (frameId == 0) {
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
		}
		return Zotero.Translators.getWebTranslatorsForLocation(url, tab.url).then(function(translators) {
			if (translators[0].length == 0) {
				Zotero.debug("Not injecting. No translators found for [tab.url, url]: " + tab.url + " , " + url);
				return;
			}
			Zotero.debug(translators[0].length+  " translators found. Injecting into [tab.url, url]: " + tab.url + " , " + url);
			return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
		});
	};

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
			if (response) return deferred.resolve();
			Zotero.debug(`Injecting translation scripts into ${frameId} ${tab.url}`);
			return Zotero.Connector_Browser.injectScripts(_injectTranslationScripts, null, tab, frameId)
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
	this.injectScripts = function(scripts, callback, tab, frameId=0) {
		if (! Array.isArray(scripts)) scripts = [scripts];
		var promises = [];
		Zotero.debug(`Injecting scripts into ${tab.url} : ${scripts.join(', ')}`);
		for (let script of scripts) {
			let deferred = Zotero.Promise.defer();
			promises.push(deferred.promise);
			try {
				chrome.tabs.executeScript(tab.id, {file: script, frameId}, deferred.resolve);
			} catch (e) {
				deferred.reject(e);
			}
		}
			
		// Unfortunately firefox sometimes neither rejects nor resolves tabs#executeScript(). Testing proxied
		// http://www.ams.org/mathscinet/search/publdoc.html?pg1=INDI&s1=916336&sort=Newest&vfpref=html&r=1&mx-pid=3439694
		// with a fresh browser session consistently reproduces the bug. The injection may be partial, but we need to
		// resolve this promise somehow, so we reject in the event of timeout.
		var deferred = Zotero.Promise.defer();
		let timeout = setTimeout(deferred.reject.bind(deferred, new Error("Script injection timed out")), 3000);
		Zotero.Promise.all(promises).then(function(result) {
			clearTimeout(timeout);
			deferred.resolve(result);
		});
		return deferred.promise;
	};

	this.openTab = function(url, tab) {
		if (tab) {
			let tabProps = { index: tab.index + 1 };
			// Firefox doesn't support openerTabId
			if (!Zotero.isFirefox) {
				tabProps.openerTabId = tab.id;
			}
			chrome.tabs.create(Object.assign({url}, tabProps));
		} else {
			chrome.tabs.query({active: true, lastFocusedWindow: true}, (tabs) => this.openTab(url, tabs[0]));
		}
	};
	
	this.openPreferences = function(paneID, tab) {
		this.openTab(chrome.extension.getURL(`preferences/preferences.html#${paneID}`), tab);
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
			return new Zotero.Promise(function(resolve) { 
				chrome.tabs.query({active: true, lastFocusedWindow: true}, 
					(tabs) => resolve(this.notify(text, buttons, seenTimeout, tabs[0])));
			}.bind(this));
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
					chrome.tabs.get(tab.id, function(tab) {
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
		chrome.contextMenus.removeAll();

		if (_isDisabledForURL(tab.url)) {
			_showZoteroStatus();
			return;
		} else {
			_enableForTab(tab.id);
		}
		
		var isPDF = _tabInfo[tab.id] && _tabInfo[tab.id].isPDF;
		var translators = _tabInfo[tab.id] && _tabInfo[tab.id].translators;
		if (translators && translators.length) {
			_showTranslatorIcon(tab, translators[0]);
			_showTranslatorContextMenuItem(translators);
		} else if (isPDF) {
			_showPDFIcon(tab);
		} else {
			_showWebpageIcon(tab);
		}
		
		if (isPDF) {
			_showPDFContextMenuItem();
		} else {
			_showWebpageContextMenuItem();
		}
		
		if (Zotero.isFirefox) {
			_showPreferencesContextMenuItem();
		}
	}
	
	function _showFirstUseUI(tab) {
		var icon = `${Zotero.platform}/zotero-z-${window.devicePixelRatio > 1 ? 32 : 16}px-australis.png`;
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: `images/${icon}`
		});
		chrome.browserAction.setTitle({
			tabId: tab.id,
			title: "Zotero Connector"
		});
		chrome.browserAction.enable(tab.id);
	}
	
	/**
	 * Removes information about a specific tab
	 */
	function _clearInfoForTab(tabID) {
		delete _tabInfo[tabID];
	}
	
	function _isDisabledForURL(url) {
		return url.includes('chrome://') || url.includes('about:') || (url.includes('-extension://') && !url.includes('/test/'));
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
			chrome.browserAction.setIcon({
				tabId:tabID,
				path:icon
			});
			
			chrome.browserAction.setTitle({
				tabId:tabID,
				title: title
			});
		});
		chrome.browserAction.disable(tabID);
		chrome.contextMenus.removeAll();
	}
	
	function _enableForTab(tabID) {
		chrome.browserAction.enable(tabID);
	}
	
	function _showTranslatorIcon(tab, translator) {
		var itemType = translator.itemType;
		
		chrome.browserAction.setIcon({
			tabId:tab.id,
			path:(itemType === "multiple"
					? "images/treesource-collection.png"
					: Zotero.ItemTypes.getImageSrc(itemType))
		});
		
		chrome.browserAction.setTitle({
			tabId:tab.id,
			title: _getTranslatorLabel(translator)
		});
	}
	
	function _showWebpageIcon(tab) {
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: Zotero.ItemTypes.getImageSrc("webpage-gray")
		});
		let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
			Zotero.Prefs.get('automaticSnapshots');
		let title = `Save to Zotero (Web Page ${withSnapshot ? 'with' : 'without'} Snapshot)`;
		chrome.browserAction.setTitle({tabId: tab.id, title});
	}
	
	function _showPDFIcon(tab) {
		chrome.browserAction.setIcon({
			tabId: tab.id,
			path: chrome.extension.getURL('images/pdf.png')
		});
		chrome.browserAction.setTitle({
			tabId: tab.id,
			title: "Save to Zotero (PDF)"
		});
	}
	
	function _showTranslatorContextMenuItem(translators) {
		for (var i = 0; i < translators.length; i++) {
			chrome.contextMenus.create({
				id: "zotero-context-menu-translator-save" + i,
				title: _getTranslatorLabel(translators[i]),
				onclick: (function (i) {
					return function (info, tab) {
						Zotero.Connector_Browser._saveWithTranslator(tab, i);
					};
				})(i),
				contexts: ['page', 'browser_action']
			});
		}
	}
	
	function _showWebpageContextMenuItem() {
		var fns = [];
		fns.push(() => chrome.contextMenus.create({
			id: "zotero-context-menu-webpage-withSnapshot-save",
			title: "Save to Zotero (Web Page with Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab, true);
			},
			contexts: ['page', 'browser_action']
		}));
		fns.push(() => chrome.contextMenus.create({
			id: "zotero-context-menu-webpage-withoutSnapshot-save",
			title: "Save to Zotero (Web Page without Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab, false);
			},
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
	
	function _showPDFContextMenuItem() {
		chrome.contextMenus.create({
			id: "zotero-context-menu-pdf-save",
			title: "Save to Zotero (PDF)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser._saveAsWebpage(tab);
			},
			contexts: ['all']
		});
	}
	
	function _showPreferencesContextMenuItem() {
		chrome.contextMenus.create({
			type: "separator",
			id: "zotero-context-menu-pref-separator",
			contexts: ['all']
		});
		chrome.contextMenus.create({
			id: "zotero-context-menu-preferences",
			title: "Preferences",
			onclick: function () {
				chrome.tabs.create({url: chrome.extension.getURL('preferences/preferences.html')});
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
			let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
				Zotero.Prefs.get('automaticSnapshots');
			Zotero.Connector_Browser._saveAsWebpage(tab, withSnapshot);
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
	
	this._saveAsWebpage = function(tab, withSnapshot) {
		if (tab.id != -1) {
			return Zotero.Messaging.sendMessage("saveAsWebpage", [tab.title, withSnapshot], tab);
		}
		// Handle right-click on PDF overlay, which exists in a weird non-tab state
		else {
			chrome.tabs.query(
				{
					lastFocusedWindow: true,
					active: true
				},
				function (tabs) {
					Zotero.Messaging.sendMessage("saveAsWebpage", tabs[0].title, tabs[0]);
				}
			);
		}
	}
	
	function _getTranslatorLabel(translator) {
		var translatorName = translator.label;
		if(translator.runMode === Zotero.Translator.RUN_MODE_ZOTERO_STANDALONE) {
			translatorName += " via Zotero Standalone";
		}
		
		return "Save to Zotero (" + translatorName + ")";
	}
	
	Zotero.Messaging.addMessageListener("selectDone", function(data) {
		_tabInfo[data[0]].selectCallback(data[1]);
	});
	
	chrome.tabs.onRemoved.addListener(_clearInfoForTab);

	chrome.tabs.onUpdated.addListener(function(tabID, changeInfo, tab) {
		_updateExtensionUI(tab);
		if(!changeInfo.url) return;
		Zotero.debug("Connector_Browser: URL changed for tab " + tab.url);
		_clearInfoForTab(tabID);
		// Rerun translation
		Zotero.Messaging.sendMessage("pageModified", null, tab);
		tab.active && Zotero.Connector.reportActiveURL(tab.url);
	});
	
	chrome.tabs.onActivated.addListener(function(activeInfo) {
		chrome.tabs.get(activeInfo.tabId, Zotero.Utilities.logCallbackError(function(tab) {
			Zotero.debug("Connector_Browser: onActivated for " + tab.url);
			Zotero.Connector_Browser.onTabActivated(tab);
			Zotero.Connector.reportActiveURL(tab.url);
		}));
	});

	chrome.browserAction.onClicked.addListener(_browserAction);
	
	chrome.webNavigation.onDOMContentLoaded.addListener(function(details) {
		chrome.tabs.get(details.tabId, Zotero.Utilities.logCallbackError(function(tab) {
			Zotero.debug("Connector_Browser: onDOMContentLoaded for " + tab.url + "; " + details.url);
			Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
		}));
	});
}

Zotero.initGlobal();
