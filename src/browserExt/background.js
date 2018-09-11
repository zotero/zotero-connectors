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
		_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {injections: {}}, {translators, instanceID, isPDF});
		
		Zotero.Connector_Browser._updateExtensionUI(tab);
	}

	/**
	 * If there's a frame with a PDF mimeType this gets invoked
	 * @param frameURL
	 * @param tabId
	 */
	this.onPDFFrame = function(frameURL, frameId, tabId) {
		if (_tabInfo[tabId] && _tabInfo[tabId].translators) {
			return;
		}
		browser.tabs.get(tabId).then(function(tab) {
			_tabInfo[tab.id] = Object.assign(_tabInfo[tab.id] || {injections: {}}, {translators: [], isPDF: true, frameId});
			Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
			Zotero.Connector_Browser._updateExtensionUI(tab);
		});
	}
	
	/**
	 * Called to display select items dialog
	 */
	this.onSelect = async function(items, tab) {
		await Zotero.Connector_Browser.openWindow(
			browser.extension.getURL("itemSelector/itemSelector.html")
				+ "#" + encodeURIComponent(JSON.stringify([tab.id, items]))
				// Remove once https://bugzilla.mozilla.org/show_bug.cgi?id=719905 is fixed
				.replace(/%3A/g, 'ZOTEROCOLON'),
			{width: 600, height: 325}, tab
		);
		return new Promise(function(resolve) {
			_tabInfo[tab.id].selectCallback = resolve;
		});
	};
	
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
			Zotero.ContentTypeHandler.disable();
		}
	}
	
	this.onTabActivated = function(tab) {
		Zotero.Connector_Browser._updateExtensionUI(tab);
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
	this.onFrameLoaded = async function(tab, frameId, url) {
		if (_isDisabledForURL(tab.url) && frameId == 0 || _isDisabledForURL(url)) {
			return;
		}
		Zotero.debug("Connector_Browser: onFrameLoaded for " + tab.url + "; " + url);
		if (frameId == 0) {
			// Injected via the manifest file
			return;
		} else {
			if (!(tab.id in _tabInfo)) {
				_tabInfo[tab.id] = {};
			}
			if (!_tabInfo[tab.id].frameChecked) {
				// Also in the first frame detected
				// See https://github.com/zotero/zotero-connectors/issues/156
				_tabInfo[tab.id].frameChecked = true;
				// If you try to inject here immediately Firefox throws
				// "Frame not found, or missing host permission"
				if (Zotero.isFirefox) {
					await Zotero.Promise.delay(100);
				}
				return Zotero.Connector_Browser.injectTranslationScripts(tab, frameId);
			}
		}
		// Frame url shouldn't ever match the tab url but sometimes it does and causes weird
		// injections. We explicitly ignore it here.
		if (url == tab.url) {
			Zotero.debug(`Ignoring frame ${frameId} with a tab matching url ${tab.url}`);
			return;
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
	
	this.isIncognito = function(tab) {
		return tab.incognito;
	}

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
			Zotero.debug(`Translation Inject: Script injection already in progress for ${key}`);
			return deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		this.injectTranslationScripts[key] = deferred;
		deferred.promise.catch(function(e) {
			Zotero.debug(`Translation Inject: Script injection rejected ${key}`);
			Zotero.debug(e.message);
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
	
	this.INJECTION_TIMEOUT = 10000;

	/**
	 * Injects custom scripts
	 * 
	 * @param scripts {Object[]} array of scripts to inject
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	this.injectScripts = async function(scripts, tab, frameId=0) {
		function* injectScripts() {
			if (! Array.isArray(scripts)) scripts = [scripts];
			// Make sure we're not changing the original list
			scripts = Array.from(scripts);
			Zotero.debug(`Inject: Injecting scripts into ${frameId} - ${tab.url} : ${scripts.join(', ')}`);
			
			for (let script of scripts) {
				// Firefox returns an error for unstructured data being returned from scripts
				// We are forced to catch these, even though when sometimes they may be legit errors
				yield browser.tabs.executeScript(tab.id, {file: script, frameId, runAt: 'document_end'})
					.catch(() => undefined);
			}
			
			// Send a ready message to confirm successful injection
			let readyMsg = `ready${Date.now()}`;
			yield browser.tabs.executeScript(tab.id, {
				code: `browser.runtime.onMessage.addListener(function awaitReady(request) {
					if (request == '${readyMsg}') {
						browser.runtime.onMessage.removeListener(awaitReady);
						return Promise.resolve(true);
					}
				})`,
				frameId,
				runAt: 'document_end'
			});
			
			while (true) {
				try {
					var response = yield browser.tabs.sendMessage(tab.id, readyMsg, {frameId: frameId});
				} catch (e) {}
				if (!response) {
					yield Zotero.Promise.delay(100);
				} else {
					Zotero.debug(`Inject: Complete ${frameId} - ${tab.url}`);
					return true;
				}
			}		
		}
		var timedOut = Zotero.Promise.defer();
		let timeout = setTimeout(function() {
			timedOut.reject(new Error (`Inject: Timed out ${frameId} - ${tab.url} after ${this.INJECTION_TIMEOUT}ms`))
		}.bind(this), this.INJECTION_TIMEOUT);
		
		// Prevent triggering multiple times
		let deferred = _tabInfo[tab.id].injections[frameId];
		if (deferred) {
			Zotero.debug(`Inject: Script injection already in progress for ${frameId} - ${tab.url}`);
			await deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		_tabInfo[tab.id].injections[frameId] = deferred;
		
		function tabRemovedListener(tabID) {
			if (tabID != tab.id) return;
			deferred.reject(new Error(`Inject: Tab removed mid-injection into ${frameId} - ${tab.url}`))
		}
		browser.tabs.onRemoved.addListener(tabRemovedListener);

		// This is a bit complex, but we need to cut off script injection as soon as we notice an
		// interruption condition, such as a timeout or url change, otherwise we get partial injections
		try {
			var iter = injectScripts();
			var val = iter.next();
			while (true) {
				if (val.done) {
					return val.value;
				}
				if (val.value.then) {
					// Will either throw from the first two, or return from the third one
					let nextVal = await Promise.race([
						timedOut.promise,
						deferred.promise,
						val.value
					]);
					val = iter.next(nextVal);
				} else {
					val = iter.next(val.value);
				}
			}
		} finally {
			browser.tabs.onRemoved.removeListener(tabRemovedListener);
			deferred.resolve();
			delete _tabInfo[tab.id].injections[frameId];
			clearTimeout(timeout);
		}
	};
	
	this.openWindow = async function(url, options={}, tab=null) {
		if (!tab) {
			tab = (await browser.tabs.query({active: true}))[0];
		}
		options = Object.assign({
			width: 800,
			height: 600,
			type: "popup"
		}, options);
		let win = await browser.windows.get(tab.windowId, null);
		options.left = Math.floor(win.left + (win.width / 2) - (options.width / 2));
		options.top = Math.floor(win.top + (win.height / 2) - (options.height / 2));
			
		win = await browser.windows.create({
			url,
			type: options.type,
			width: options.width,
			height: options.height,
			left: options.left,
			top: options.top
		});
		
		// Fix positioning in Chrome when window is on second monitor
		// https://bugs.chromium.org/p/chromium/issues/detail?id=137681
		if (Zotero.isBrowserExt && win.left < options.left) {
			browser.windows.update(win.id, { left: options.left });
		}
		// Fix a Firefox bug where content does not appear before resize on linux
		// https://bugzilla.mozilla.org/show_bug.cgi?id=1402110
		// this one might actually get fixed, unlike the one above
		if (Zotero.isFirefox) {
			await Zotero.Promise.delay(1000);
			browser.windows.update(win.id, {width: win.width+1});
		}
		if (typeof options.onClose == 'function') {
			browser.windows.onRemoved.addListener(function onClose(id) {
				if (id == win.id) options.onClose();
				browser.windows.onRemoved.removeListener(onClose);
			});
		}
	};
	
	this.bringToFront = async function(drawAttention=false, tab) {
		var windowId;
		if (tab && tab.windowId) {
			windowId = tab.windowId;
		} else {
			let win = await browser.windows.getLastFocused();
			windowId = win.id;
		}
		browser.windows.update(windowId, {drawAttention, focused: true});
	}

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
	this.notify = async function(text, buttons, seenTimeout=5000, tab=null) {
		// Get current tab if not provided
		if (!tab) {
			return browser.tabs.query({active: true, lastFocusedWindow: true})
			.then((tabs) => this.notify(text, buttons, seenTimeout, tabs[0]));
		} else if (typeof tab === 'number') {
			return browser.tabs.get(tab).then((tab) => this.notify(text, buttons, seenTimeout, tab));
		}
		let timedOut = false;
		seenTimeout && setTimeout(() => timedOut = true, seenTimeout);
		var response = await Zotero.Messaging.sendMessage('notify', [text, buttons, null, tab.status], tab)
		if (response != undefined || timedOut) return response;
		
		// Tab url changed or tab got removed, hence the undefined response
		// Wait half a sec to not run a busy-waiting loop
		await Zotero.Promise.delay(500)
		var tab = await browser.tabs.get(tab.id)
		if (!tab) return;
		// If it still exists try again
		return this.notify(text, buttons, seenTimeout, tab);
	};

	/**
	 * Update status and tooltip of Zotero button
	 */
	this._updateExtensionUI = function (tab) {
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
				title: `${Zotero.getString('general_saveTo', 'Zotero')}`,
				contexts: ['all']
			});
		}
		
		if (translators && translators.length) {
			_showTranslatorIcon(tab, translators[0]);
			_showTranslatorContextMenuItem(translators, saveMenuID);
			_showNoteContextMenuItems(translators, saveMenuID);
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
	
	function _updateInfoForTab(tabId, url) {
		if (!(tabId in _tabInfo)) {
			_tabInfo[tabId] = {
				url: url,
				injections: {}
			}
		}
		if (_tabInfo[tabId].url != url) {
			Zotero.debug(`Connector_Browser: URL changed from ${_tabInfo[tabId].url} to ${url}`);
			if (_tabInfo[tabId].injections) {
				for (let frameId in _tabInfo[tabId].injections) {
					_tabInfo[tabId].injections[frameId].reject(new Error(`URL changed for tab ${url}`));
				}
			}
			_tabInfo[tabId] = {
				url: url,
				injections: {}
			};
		}
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
						Zotero.Connector_Browser.saveWithTranslator(tab, i, { resave: true });
					};
				})(i),
				parentId: parentID,
				contexts: ['page', 'browser_action']
			});
		}
	}
	
	function _showNoteContextMenuItems(translators, parentID) {
		if (translators[0].itemType == "multiple") return;
		browser.contextMenus.create({
			id: "zotero-context-menu-translator-save-with-selection-note",
			title: "Create Zotero Item and Note from Selection",
			onclick: function (info, tab) {
				Zotero.Connector_Browser.saveWithTranslator(
					tab,
					0,
					{
						note: '<blockquote>' + info.selectionText + '</blockquote>'
					}
				);
			},
			parentId: parentID,
			contexts: ['selection']
		});
	}
	
	function _showWebpageContextMenuItem(parentID) {
		var fns = [];
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withSnapshot-save",
			title: "Save to Zotero (Web Page with Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser.saveAsWebpage(tab, 0, { snapshot: true });
			},
			parentId: parentID,
			contexts: ['page', 'browser_action']
		}));
		fns.push(() => browser.contextMenus.create({
			id: "zotero-context-menu-webpage-withoutSnapshot-save",
			title: "Save to Zotero (Web Page without Snapshot)",
			onclick: function (info, tab) {
				Zotero.Connector_Browser.saveAsWebpage(tab, 0);
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
				Zotero.Connector_Browser.saveAsWebpage(tab);
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
			let name = proxy.toDisplayName();
			let proxied = proxy.toProxy(url);
			browser.contextMenus.create({
				id: `zotero-context-menu-proxy-reload-${i++}`,
				title: `Reload via ${name}`,
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
				Zotero.Connector_Browser._updateExtensionUI(tab);
			});
		}
		else if(_tabInfo[tab.id] && _tabInfo[tab.id].translators && _tabInfo[tab.id].translators.length) {
			Zotero.Connector_Browser.saveWithTranslator(tab, 0, {fallbackOnFailure: true});
		} else {
			if (_tabInfo[tab.id] && _tabInfo[tab.id].isPDF) {
				Zotero.Connector_Browser.saveAsWebpage(
					tab,
					_tabInfo[tab.id].frameId,
					{
						snapshot: true
					}
				);
			} else {
				let withSnapshot = Zotero.Connector.isOnline ? Zotero.Connector.automaticSnapshots :
					Zotero.Prefs.get('automaticSnapshots');
				Zotero.Connector_Browser.saveAsWebpage(tab, 0, { snapshot: withSnapshot });
			}
		}
	}

	/**
	 * @param tab <Tab>
	 * @param i <Integer> the index of translator to save with
	 * @param options <Object>
	 * 		- fallbackOnFailure <Boolean> if translation fails, attempt to save with lower priority translators
	 * 		- note <String> add string as a note to the saved item
	 * @returns {Promise<*>}
	 */
	this.saveWithTranslator = function(tab, i, options={}) {
		var translator = _tabInfo[tab.id].translators[i];
		
		// Set frameId to null - send message to all frames
		// There is code to figure out which frame should translate with instanceID.
		return Zotero.Messaging.sendMessage(
			"translate",
			[
				_tabInfo[tab.id].instanceID,
				translator.translatorID,
				options
			],
			tab,
			null
		);
	}
	
	this.saveAsWebpage = function(tab, frameId, options) {
		if (Zotero.isFirefox && Zotero.browserMajorVersion >= 60 && _tabInfo[tab.id].isPDF) {
			return Zotero.Utilities.saveFirefoxPDF(tab);
		}
	
		if (tab.id != -1) {
			return Zotero.Messaging.sendMessage("saveAsWebpage", [tab.title, options], tab, frameId);
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
	
	function logListenerErrors(listener) {
		return function() {
			try {
				var returnValue = listener.apply(this, arguments);
				if (returnValue && returnValue.then) {
					returnValue.catch(function(e) {
						Zotero.logError(e);
						throw (e);
					});
				}
			} catch (e) {
				Zotero.logError(e);
				throw e;
			}
		}
	}

	browser.browserAction.onClicked.addListener(logListenerErrors(_browserAction));
	
	browser.tabs.onRemoved.addListener(logListenerErrors(_clearInfoForTab));
	
	browser.tabs.onActivated.addListener(logListenerErrors(async function(details) {
		var tab = await browser.tabs.get(details.tabId);
		// Ignore item selector
		if (tab.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html")) === 0) return;
		Zotero.debug("Connector_Browser: onActivated for " + tab.url);
		Zotero.Connector_Browser.onTabActivated(tab);
		Zotero.Connector.reportActiveURL(tab.url);
	}));
	
	browser.webNavigation.onCommitted.addListener(logListenerErrors(async function(details) {
		// Ignore developer tools, item selector
		if (details.tabId < 0 || _isDisabledForURL(details.url, true)
				|| details.url.indexOf(browser.extension.getURL("itemSelector/itemSelector.html")) === 0) return;

		if (details.frameId == 0) {
			_updateInfoForTab(details.tabId, details.url);
			// Getting the tab is uber slow in Firefox. Since _updateInfoForTab() resets the
			// object we use to store tab related metadata, it needs to fire ASAP, so that other hooks
			// such as those from webNavigation events can update the metadata, without it being overwritten
			var tab = await browser.tabs.get(details.tabId);
			Zotero.Connector_Browser._updateExtensionUI(tab);
			Zotero.Connector.reportActiveURL(tab.url);
		}
		if (!tab) {
			var tab = await browser.tabs.get(details.tabId);
		}
		// _updateInfoForTab will reject pending injections, but we need to make sure this
		// executes in the next event loop such that the rejections can be processed
		await Zotero.Promise.delay(1);
		await Zotero.Connector_Browser.onFrameLoaded(tab, details.frameId, details.url);
	}));
}

Zotero.initGlobal();
