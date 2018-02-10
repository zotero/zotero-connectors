/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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
 * Only register progress window code in top window
 */
var isTopWindow = false;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}
var instanceID = isTopWindow ? 0 : (new Date()).getTime();

if (isTopWindow) {
	//
	// Progress window popup initialization
	//
	// The progress window is created using React in an iframe, and we use postMessage() to
	// communicate with it based on events from the messaging system (so that we don't need to
	// load complicated messaging code into the iframe).
	//
	let frameID = 'zotero-progress-window-frame';
	let listenersRegistered = false;
	let currentSessionID;
	let frameWindow;
	let eventQueue = [];
	let timeoutID;
	let insideIframe = false;
	let frameSrc;
	if (Zotero.isSafari) {
		frameSrc = safari.extension.baseURI + 'progressWindow/progressWindow.html';
	}
	else {
		frameSrc = browser.extension.getURL('progressWindow/progressWindow.html');
	}
	let origin = frameSrc.match(/^[a-z\-]+:\/\/[^\/]+/);
	let scrollX;
	let scrollY;
	
	// The progress window component is initialized asynchronously, so queue updates and send them
	// to the iframe once the component is ready
	function addEvent(name, data) {
		eventQueue.push({
			event: name,
			data
		});
		drainEventQueue();
	}
	
	function drainEventQueue() {
		if (!frameWindow) return;
		var x;
		while (x = eventQueue.shift()) {
			frameWindow.postMessage(x, origin);
		}
	};
	
	function changeHeadline() {
		addEvent("changeHeadline", Array.from(arguments));
	}
	
	/**
	 * Get selected collection and collections list from client and update popup
	 */
	async function setHeadlineFromClient() {
		try {
			var response = await Zotero.Connector.callMethod("getSelectedCollection", {})
		}
		catch (e) {
			// TODO: Shouldn't this be coupled to the actual save process?
			changeHeadline("Saving to zotero.org");
			return;
		}
		
		// TODO: Change client to default to My Library root
		if (response.targets && response.libraryEditable === false) {
			let target = response.targets[0];
			response.id = target.id;
			response.name = target.name;
		}
		
		var id;
		// Legacy response for libraries
		if (!response.id) {
			id = "L" + response.libraryID;
		}
		// Legacy response for collections
		else if (typeof response.id != 'string') {
			id = "C" + response.id;
		}
		else {
			id = response.id;
		}
		
		changeHeadline(
			"Saving to ",
			{
				id,
				type: id.startsWith('L')
					? 'library'
					: 'collection',
				name: response.name
			},
			response.targets
		);
		if (!response.targets && response.libraryEditable === false) {
			// TODO: Update
			addError("collectionNotEditable");
			startCloseTimer(8000);
		}
	}
	
	function updateProgress() {
		addEvent("updateProgress", Array.from(arguments));
	}
	
	function addError() {
		// DEBUG: Can this be called before the frame is created?
		showFrame();
		addEvent("addError", Array.from(arguments));
	}
	
	function showFrame() {
		var frame = document.getElementById(frameID);
		frame.style.display = 'block';
	}
	
	function hideFrame() {
		// TODO: Restore session instead of resetting if the (non-folder) button is clicked again
		resetFrame();
		
		var frame = document.getElementById(frameID);
		frame.style.display = 'none';
	}
	
	function resetFrame() {
		eventQueue = [];
		stopCloseTimer();
		addEvent('reset');
	}
	
	function destroyFrame() {
		stopCloseTimer();
		var frame = document.getElementById(frameID);
		document.body.removeChild(frame);
		frameWindow = null;
		eventQueue = [];
	}
	
	function startCloseTimer(delay) {
		// Don't start the timer if the mouse is over the popup
		if (insideIframe) return;
		
		if (!delay) delay = 2500;
		stopCloseTimer();
		timeoutID = setTimeout(hideFrame, delay);
	}
	
	function stopCloseTimer() {
		if (timeoutID) {
			clearTimeout(timeoutID);
		}
	}
	
	/**
	 * This is called after an item has started to save in order to show the progress window
	 */
	Zotero.Messaging.addMessageListener("progressWindow.show", async function (sessionID) {
		if (currentSessionID) {
			// If session has changed, reset state
			if (currentSessionID != sessionID) {
				resetFrame();
				currentSessionID = sessionID;
				await setHeadlineFromClient();
			}
			showFrame();
			return;
		}
		currentSessionID = sessionID;
		
		// Create the iframe
		var iframe = document.createElement('iframe');
		iframe.id = frameID;
		iframe.src = frameSrc;
		var style = {
			position: 'fixed',
			top: '15px',
			right: '15px',
			width: '340px',
			height: '120px',
			border: "none",
			zIndex: 2147483647
		};
		for (let i in style) iframe.style[i] = style[i];
		document.body.appendChild(iframe);
		
		// Keep track of when the mouse is over the popup, for various purposes
		iframe.addEventListener('mouseenter', function() {
			insideIframe = true;
			stopCloseTimer();
			
			// See scroll listener above
			scrollX = window.scrollX;
			scrollY = window.scrollY;
		});
		iframe.addEventListener('mouseleave', function() {
			insideIframe = false;
			startCloseTimer();
		});
		
		// Keep track of clicks on the window so that when the iframe document is blurred we can
		// distinguish between a click on the document and switching to another window
		var lastClick;
		window.addEventListener('click', function () {
			lastClick = new Date();
		}, true);
		
		
		// Prevent scrolling of parent document when scrolling to bottom of target list in iframe
		// From https://stackoverflow.com/a/32283373
		//
		// This is jittery and it would be nice to do better
		document.addEventListener('scroll', function (event) {
			if (insideIframe) {
				window.scrollTo(scrollX, scrollY);
			}
		});
		
		//
		// Handle messages from the progress window iframe
		//
		window.addEventListener("message", async function (event) {
			if (event.origin != origin) return;
			
			//Zotero.debug("Got event");
			//Zotero.debug(event.data);
			
			switch (event.data.event) {
			// Save a reference to the iframe's window once it's ready
			case 'zotero.progressWindow.registered':
				frameWindow = event.source;
				drainEventQueue();
				break;
			
			// Adjust iframe height when inner document is resized
			case 'zotero.progressWindow.resized':
				iframe.style.height = (event.data.height + 20) + "px";
				break;
			
			// Update the client or API with changes
			case 'zotero.progressWindow.updated':
				var response = await Zotero.Connector.callMethod(
					"updateSession",
					{
						sessionID: currentSessionID,
						target: event.data.target,
						tags: event.data.tags
					}
				);
				break;
			
			// Hide iframe if it loses focus and the user recently clicked on the main page
			// (i.e., they didn't just switch to another window)
			case 'zotero.progressWindow.blurred':
				setTimeout(function () {
					if (lastClick > new Date() - 500) {
						hideFrame();
					}
				}, 150);
				break;
			
			// Hide frame
			case 'zotero.progressWindow.closed':
				hideFrame();
				break;
			}
		});
		
		await setHeadlineFromClient();
	});
	
	// TODO: Combine with itemProgress?
	Zotero.Messaging.addMessageListener("progressWindow.itemSaving", function (data) {
		var id = data[2];
		var data = {
			iconSrc: data[0],
			title: data[1],
			parentItem: data[3]
		};
		updateProgress(id, data);
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.itemProgress", (data) => {
		var id = data[2];
		var data = {
			iconSrc: data[0],
			title: data[1],
			progress: data[3] // false === error
		};
		updateProgress(id, data);
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.close", hideFrame);
	
	Zotero.Messaging.addMessageListener("progressWindow.done", (returnValue) => {
		if (Zotero.isBrowserExt
				&& document.location.href.startsWith(browser.extension.getURL('confirm.html'))) {
			setTimeout(function() {
				window.close();
			}, 1000);
		}
		else if (returnValue[0]) {
			startCloseTimer(2500);
		}
		else {
			addError(returnValue[1] || "translationError");
			startCloseTimer(8000);
		}
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.error", (args) => {
		addError(args.shift(), ...args);
	})
	
	Zotero.Messaging.addMessageListener("confirm", function (props) {
		return Zotero.Inject.confirm(props);
	});

	Zotero.Messaging.addMessageListener("notify", (args) => Zotero.Inject.notify.apply(this, args));
	
	Zotero.Messaging.addMessageListener("ping", function () {
		// Respond to indicate that script is injected
		return 'pong';
	});
}

/**
 * @namespace
 */
Zotero.Inject = new function() {
	var _translate;
	this.translators = [];
		
	/**
	 * Initializes the translate machinery and determines whether this page can be translated
	 */
	this.init = function(force) {	
		// On OAuth completion, close window and call completion listener
		if(document.location.href.substr(0, ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1) === ZOTERO_CONFIG.OAUTH_CALLBACK_URL+"?") {
			Zotero.API.onAuthorizationComplete(document.location.href.substr(ZOTERO_CONFIG.OAUTH_CALLBACK_URL.length+1));
			return;
		}
		
		// wrap this in try/catch so that errors will reach logError
		try {
			if(this.translators.length) {
				if(force) {
					this.translators = [];
				} else {
					return;
				}
			}
			if(document.location == "about:blank") return;

			if(!_translate) {
				_translate = new Zotero.Translate.Web();
				_translate.setHandler("select", function(obj, items, callback) {
					// If the handler returns a non-undefined value then it is passed
					// back to the callback due to backwards compat code in translate.js
					(async function() {
						try {
							let response = await Zotero.Connector.callMethod("getSelectedCollection", {});
							if (response.libraryEditable === false) {
								return callback([]);
							}
						} catch (e) {
							// Zotero is online but an error occured anyway, so let's log it and display
							// the dialog just in case
							if (e.status != 0) {
								Zotero.logError(e);
							}
						}
						Zotero.Connector_Browser.onSelect(items).then(function(returnItems) {
							// if no items selected, close save dialog immediately
							if(!returnItems || Zotero.Utilities.isEmpty(returnItems)) {
								Zotero.Messaging.sendMessage("progressWindow.close", null);
							}
							callback(returnItems);
						});					
					})();
				});
				_translate.setHandler("itemSaving", function(obj, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("progressWindow.itemSaving",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id]);
				});
				_translate.setHandler("itemDone", function(obj, dbItem, item) {
					// this relays an item from this tab to the top level of the window
					Zotero.Messaging.sendMessage("progressWindow.itemProgress",
						[Zotero.ItemTypes.getImageSrc(item.itemType), item.title, item.id, 100]);
					for(var i=0; i<item.attachments.length; i++) {
						var attachment = item.attachments[i];
						Zotero.Messaging.sendMessage("progressWindow.itemSaving",
							[determineAttachmentIcon(attachment), attachment.title, attachment.id,
								item.id]);
					}
				});
				_translate.setHandler("attachmentProgress", function(obj, attachment, progress, err) {
					if(progress === 0) return;
					Zotero.Messaging.sendMessage("progressWindow.itemProgress",
						[determineAttachmentIcon(attachment), attachment.title, attachment.id, progress]);
				});
				_translate.setHandler("pageModified", function() {
					Zotero.Connector_Browser.onPageLoad();
					Zotero.Messaging.sendMessage("pageModified", null);
				});
				document.addEventListener("ZoteroItemUpdated", function() {
					Zotero.debug("Inject: ZoteroItemUpdated event received");
					Zotero.Connector_Browser.onPageLoad();
					Zotero.Messaging.sendMessage("pageModified", null);
				}, false);
			}
			_translate.setDocument(document);
			return _translate.getTranslators(true).then(function(translators) {
				if (!translators.length && Zotero.isSafari) {
					if (!isTopWindow && document.contentType == 'application/pdf') {
						return Zotero.Connector_Browser.onPDFFrame(document.location.href, instanceID);
					}
				}
				this.translators = translators;
				
				translators = translators.map(function(translator) {return translator.serialize(TRANSLATOR_PASSING_PROPERTIES)});
				Zotero.Connector_Browser.onTranslators(translators, instanceID, document.contentType);
			}.bind(this));
		} catch(e) {
			Zotero.logError(e);
		}
	};
	
	function determineAttachmentIcon(attachment) {
		if(attachment.linkMode === "linked_url") {
			return Zotero.ItemTypes.getImageSrc("attachment-web-link");
		}
		return Zotero.ItemTypes.getImageSrc(attachment.mimeType === "application/pdf"
							? "attachment-pdf" : "attachment-snapshot");
	}

	/**
	 * Check if React and components are loaded and if not - load into page.
	 * 
	 * This is a performance optimization - we want to avoid loading React into every page.
	 * 
	 * @param components {Object[]} an array of component names to load
	 * @return {Promise} resolves when components are injected
	 */
	this.loadReactComponents = async function(components) {
		if (Zotero.isSafari) return;
		var toLoad = [];
		if (typeof ReactDOM === "undefined") {
			toLoad = [
				'lib/react.production.min.js',
				'lib/react-dom.production.min.js',
				'lib/prop-types.min.js'
			];
		}
		for (let component of components) {
			if (!Zotero.ui || !Zotero.ui[component]) {
				toLoad.push(`ui/${component}.js`)
			}
		}
		if (toLoad.length) {
			return Zotero.Connector_Browser.injectScripts(toLoad);
		}
	}

	/**
	 * 
	 * @param props {Object} to be passed to ModalPrompt component
	 * @returns {Promise{Object}} Object with properties:
	 * 		`button` - button number clicked (or 0 if clicked outside of prompt)
	 * 		`checkboxChecked` - checkbox state on close
	 * 		`inputText` - input field string on close	
	 */
	this.confirm = function(props) {
		let deferred = Zotero.Promise.defer();
		
		Zotero.Inject.loadReactComponents(['ModalPrompt']).then(function() {
			let div = document.createElement('div');
			div.id = 'zotero-modal-prompt';
			div.style.cssText = 'z-index: 1000000; position: fixed; top: 0; left: 0; width: 100%; height: 100%';
			let prompt = (
				<Zotero.ui.ModalPrompt 
					onClose={onClose}
					{...props}
				/>
			);
			function onClose(state, event) {
				deferred.resolve({
					button: event ? parseInt(event.target.name || 0) : 0,
					checkboxChecked: state.checkboxChecked,
					inputText: state.inputText
				});
				ReactDOM.unmountComponentAtNode(div);
				document.body.removeChild(div);
			}
			ReactDOM.render(prompt, div);
			document.body.appendChild(div);	
		}.bind(this));
		
		return deferred.promise;	
	};

	/**
	 * Display an old-school firefox notification by injecting HTML directly into DOM.
	 * 
	 * @param {String} text
	 * @param {String[]} buttons - labels for buttons
	 * @param {Number} timeout - notification gets removed after this timeout
	 * @param {String} tabStatus - available on chrome.Tab.status in background scripts
	 * @returns {Number} button pressed
	 */
	this.notify = new function() {
		var lastChainedPromise = Zotero.Promise.resolve();
		return function(text, buttons, timeout, tabStatus) {
			// This is a little awkward, because the tab status is passed from the background script to
			// the content script, but chrome.tabs is unavailable in content scripts.
			//
			// If we're navigating somewhere don't display the notification, because it looks dumb.
			// The navigation will re-trigger this method from the background script.
			if (tabStatus != 'complete') return;

			let showNotificationPrompt = async function() {
				await Zotero.Promise.delay(500);
				await Zotero.Inject.loadReactComponents(['Notification']);
				
				var notification = new Zotero.ui.Notification(text, buttons);
				if (timeout) setTimeout(notification.dismiss.bind(notification, null, 0), timeout);
				return notification.show();
			}.bind(this);
			
			// Sequentialize notification display
			lastChainedPromise = lastChainedPromise.then(showNotificationPrompt);
			return lastChainedPromise;
		}
	};

	this.firstUsePrompt = function () {
		return this.confirm({
			title: "You’ve installed the Zotero Connector!",
			button1Text: "Got it",
			button2Text: "",
			message: `
				The Zotero Connector enables you to save references to Zotero from your web browser in a single click.<br><br>
				<strong>Looking for your Zotero data?</strong> We’ve made some <a href="https://www.zotero.org/blog/a-unified-zotero-experience/">important changes</a> to how Zotero works in Firefox. If you were previously using Zotero for Firefox, you’ll need to <a href="https://www.zotero.org/download/">download</a> the standalone Zotero application to access your local Zotero data going forward.
			`
		});
	};
	
	this.firstSaveToServerPrompt = function() {
		return this.confirm({
			button1Text: "Try Again",
			button2Text: "Cancel",
			button3Text: "Enable Saving to Online Library",
			title: "Is Zotero Running?",
			message: `
				The Zotero Connector was unable to communicate with the Zotero desktop application. The Connector can save some pages directly to your zotero.org account, but for best results you should make sure Zotero is open before attempting to save.<br/><br/>
				You can <a href="https://www.zotero.org/download/">download Zotero</a> or <a href="https://www.zotero.org/support/kb/connector_zotero_unavailable">troubleshoot the connection</a> if necessary.
			`
		}).then(function(result) {
			switch (result.button) {
			case 1:
				return 'retry';
			
			case 3:
				return 'server';
			
			default:
				return 'cancel';
			}
		});
	};
	
	/**
	 * If Zotero is offline and attempting action fallback to zotero.org for first time: prompts about it
	 * Prompt only available on BrowserExt which supports programmatic injection
	 * Otherwise just resolves to true
	 * 
	 * return {Promise<Boolean>} whether the action should proceed
	 */
	this.checkActionToServer = function() {
		if (Zotero.isBrowserExt) {
			return Zotero.Promise.all([
				Zotero.Prefs.getAsync('firstSaveToServer'), 
				Zotero.Connector.checkIsOnline()
			])
			.then(function (result) {
				let firstSaveToServer = result[0];
				let zoteroIsOnline = result[1];
				if (zoteroIsOnline || !firstSaveToServer) {
					return true;
				}
				return this.firstSaveToServerPrompt()
				.then(function (result) {
					if (result == 'server') {
						Zotero.Prefs.set('firstSaveToServer', false);
						return true;
					} else if (result == 'retry') {
						let deferred = Zotero.Promise.defer();
						setTimeout(() => deferred.resolve(this.checkActionToServer()), 500);
						return deferred.promise;
					}
					return false;
				}.bind(this));
			}.bind(this));
		} else {
			return Zotero.Promise.resolve(true);
		}
	};
	
	this.translate = async function(translatorID, fallbackOnFailure=false) {
		let result = await Zotero.Inject.checkActionToServer();
		if (!result) return;
		
		// TODO: Fetch previous session?
		var sessionID = Zotero.Utilities.randomString();
		var translators = Array.from(this.translators);
		
		Zotero.Messaging.sendMessage("progressWindow.show", sessionID);
		while (translators[0].translatorID != translatorID) {
			translators.shift();
		}
		while (true) {
			var translator = translators.shift();
			_translate.setTranslator(translator);
			try {
				let items = await _translate.translate({ sessionID });
				Zotero.Messaging.sendMessage("progressWindow.done", [true]);
				return items;
			} catch (e) {
				if (fallbackOnFailure && translators.length) {
					Zotero.Messaging.sendMessage("progressWindow.error", ['fallback', translator.label, translators[0].label]);
				} else {
					Zotero.Messaging.sendMessage("progressWindow.done", [false]);
					return;
				}
			}
		}
	};
	
	this.saveAsWebpage = async function (args) {
		var title = args[0] || document.title, withSnapshot = args[1];
		var image;
		var result = await Zotero.Inject.checkActionToServer();
		if (!result) return;
		
		// TODO: Fetch previous session?
		var sessionID = Zotero.Utilities.randomString();
		
		var data = {
			sessionID,
			url: document.location.toString(),
			cookie: document.cookie,
			html: document.documentElement.innerHTML,
			skipSnapshot: !withSnapshot
		};
		
		if (document.contentType == 'application/pdf') {
			data.pdf = true;
			image = "attachment-pdf";
		} else {
			image = "webpage";
		}

		Zotero.Messaging.sendMessage("progressWindow.show", sessionID);
		Zotero.Messaging.sendMessage("progressWindow.itemSaving",
			[Zotero.ItemTypes.getImageSrc(image), title, title]);
		try {
			result = await Zotero.Connector.callMethodWithCookies("saveSnapshot", data);
		
			Zotero.Messaging.sendMessage("progressWindow.itemProgress",
				[Zotero.ItemTypes.getImageSrc(image), title, title, 100]);
			Zotero.Messaging.sendMessage("progressWindow.done", [true]);
			return result;
		} catch (e) {
			// Client unavailable
			if (e.status === 0) {
				// Attempt saving to server if not pdf
				if (document.contentType != 'application/pdf') {
					let itemSaver = new Zotero.Translate.ItemSaver({});
					let items = await itemSaver.saveAsWebpage();
					if (items.length) Zotero.Messaging.sendMessage("progressWindow.itemProgress",
						[Zotero.ItemTypes.getImageSrc(image), title, title, 100]);
					return;
				} else {
					Zotero.Messaging.sendMessage("progressWindow.done", [false, 'clientRequired']);
				}
			}
			// Unexpected error, including a timeout (which we don't want to
			// result in a save to the server, because it's possible the request
			// will still be processed)
			else if (!e.value || e.value.libraryEditable != false) {
				Zotero.Messaging.sendMessage("progressWindow.done", [false, 'unexpectedError']);
			}
			throw e;
		}
	};
};

// check whether this is a hidden browser window being used for scraping
var isHiddenIFrame = false;
try {
	isHiddenIFrame = !isTopWindow && window.frameElement && window.frameElement.style.display === "none";
} catch(e) {}

// don't try to scrape on hidden frames
let isWeb = window.location.protocol === "http:" || window.location.protocol === "https:";
let isTestPage = Zotero.isBrowserExt && window.location.href.startsWith(browser.extension.getURL('test'))
	|| Zotero.isSafari && window.location.href.startsWith(safari.extension.baseURI + 'test');
if(!isHiddenIFrame) {
	var doInject = function () {
		Zotero.initInject();
		
		if (!isWeb && !isTestPage) return;
		// add listener for translate message from extension
		Zotero.Messaging.addMessageListener("translate", function(data) {
			if(data.shift() !== instanceID) return;
			return Zotero.Inject.translate.apply(Zotero.Inject, data);
		});
		// add a listener to save as webpage when translators unavailable
		Zotero.Messaging.addMessageListener("saveAsWebpage", function(data) {
			if (Zotero.isSafari) {
				if (data[0] !== instanceID) return;
				Zotero.Inject.saveAsWebpage(data[1])
			} else {
				Zotero.Inject.saveAsWebpage(data);
			}
		});
		// add listener to rerun detection on page modifications
		Zotero.Messaging.addMessageListener("pageModified", function() {
			Zotero.Inject.init(true);
		});
		Zotero.Messaging.addMessageListener("firstUse", function () {
			return Zotero.Inject.firstUsePrompt();
		});

		if (Zotero.isSafari && isTopWindow) Zotero.Connector_Browser.onPageLoad();

		if(document.readyState !== "complete") {
			window.addEventListener("load", function(e) {
				if(e.target !== document) return;
				Zotero.Inject.init();
			}, false);
		} else {	
			Zotero.Inject.init();
		}
	};
	
	// Wait until pages in prerender state become visible before injecting
	if (document.visibilityState == 'prerender') {
		var handler = function() {
			doInject();
			document.removeEventListener("visibilitychange", handler);
		};
		document.addEventListener("visibilitychange", handler);
	} else {
		doInject();
	}
}