/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2018 Center for History and New Media
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

(function() {

/**
 * Only register progress window code in top window
 */
var isTopWindow = false;
if(window.top) {
	try {
		isTopWindow = window.top == window;
	} catch(e) {};
}

if (isTopWindow || Zotero.isBookmarklet) {
	//
	// Progress window initialization
	//
	// The progress window is created using React in an iframe, and we use the
	// connector messaging system to communicate with.
	//
	var frameID = 'zotero-progress-window-frame';
	var closeOnLeave = false;
	var lastSuccessfulTarget;
	var frameReadyDeferred = Zotero.Promise.defer();
	var frameInitialized;
	var closeTimeoutID;
	window.Zotero.progressWindowReady = frameReadyDeferred.promise;
	frameReadyDeferred.promise.then(() => frameInitialized = true);
	
	var currentSessionID;
	var createdSessions = new Set();
	var updatingSession;
	var nextSessionUpdateData;
	
	var isReadOnly = false;
	var syncDelayIntervalID;
	var insideIframe = false;
	var frameSrc;
	var frameIsHidden = false;
	if (Zotero.isBookmarklet) {
		frameSrc = ZOTERO_CONFIG.BOOKMARKLET_URL + 'progressWindow/progressWindow.html';
	}
	else if (Zotero.isSafari) {
		frameSrc = `${safari.extension.baseURI}safari/` + 'progressWindow/progressWindow.html';
	}
	else {
		frameSrc = browser.extension.getURL('progressWindow/progressWindow.html');
	}
	var scrollX;
	var scrollY;
	
	async function sendMessage(name, data = {}) {
		if (!Zotero.isBookmarklet) {
			return Zotero.Messaging.sendMessage(name, data, null, null);
		}
		var frame = await frameReadyDeferred.promise;
		if (frame) {
			return frame.contentWindow.postMessage([name, data], "*");
		} else {
			throw new Error("Attempting to message progressWindow frame before it has been loaded");
		}
	}

	function addMessageListener(name, handler) {
		if (!Zotero.isBookmarklet) {
			return Zotero.Messaging.addMessageListener(name, handler);
		}
		window.top.addEventListener('message', function(event) {
			if (event.data && event.data[0] == name) {
				handler(event.data[1]);
			}
		});
	}
	
	// The progress window component is initialized asynchronously, so queue updates and send them
	// to the iframe once the component is ready
	function addEvent(name, data) {
		frameReadyDeferred.promise.then(function() {
			// frameId=null - send message to all frames
			sendMessage(`progressWindowIframe.${name}`, data);
		});
	}
	
	function changeHeadline() {
		isReadOnly = arguments.length <= 2;
		addEvent("changeHeadline", Array.from(arguments));
	}
	
	function makeReadOnly() {
		isReadOnly = true;
		addEvent("makeReadOnly", [lastSuccessfulTarget]);
	}
	
	/**
	 * Get selected collection and collections list from client and update popup
	 */
	async function updateFromClient(prefix) {
		try {
			var response = await Zotero.Connector.callMethod("getSelectedCollection", {})
		}
		catch (e) {
			// TODO: Shouldn't this be coupled to the actual save process?
			changeHeadline("Saving to zotero.org");
			return;
		}
		
		// If we're reshowing the current session's popup, override the selected location with the
		// last successful tarGet, since the selected collection in the client might have changed
		if (lastSuccessfulTarget) {
			response.id = lastSuccessfulTarget.id;
			response.name = lastSuccessfulTarget.name;
			response.libraryEditable = true;
		}
		
		// Disable target selector for read-only library (which normally shouldn't happen,
		// because the client switches automatically to My Library)
		if (response.libraryEditable === false) {
			response.targets = undefined;
			addError("collectionNotEditable");
			startCloseTimer(8000);
			return;
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
		
		if (!prefix) {
			prefix = Zotero.getString('progressWindow_savingTo');
		}
		var target = {
			id,
			name: response.name
		};
		
		if (response.libraryEditable) {
			lastSuccessfulTarget = target;
		}
		
		// TEMP: Make sure libraries have levels (added to client in 5.0.46)
		if (response.targets) {
			for (let row of response.targets) {
				if (!row.level) {
					row.level = 0;
				}
			}
		}
		
		changeHeadline(prefix, target, response.targets);
	}
	
	async function addError() {
		await showFrame();
		addEvent("addError", Array.from(arguments));
	}
	
	function hideFrame() {
		insideIframe = false;
		
		if (Zotero.isBookmarklet) {
			var frame = window.top.document.getElementById(frameID);
		} else {
			var frame = document.getElementById(frameID);
		}
		if (frame) {
			frame.style.display = 'none';
			addEvent("hidden");
		}
		
		// Stop delaying syncs when the frame closes
		if (syncDelayIntervalID) {
			clearInterval(syncDelayIntervalID);
		}
	}
	
	function resetFrame() {
		stopCloseTimer();
		addEvent('reset');
	}
	
	async function destroyFrame() {
		stopCloseTimer();
		var frame = await frameReadyDeferred.promise;
		document.body.removeChild(frame);
		frameReadyDeferred = Zotero.Promise.defer();
	}
	
	function handleMouseEnter() {
		insideIframe = true;
		stopCloseTimer();
		
		// See scroll listener in initFrame()
		scrollX = window.scrollX;
		scrollY = window.scrollY;
	}
	
	function handleMouseLeave() {
		insideIframe = false;
		if (closeOnLeave) {
			startCloseTimer(2500);
		}
	}
	
	function startCloseTimer(delay) {
		// Don't start the timer if the mouse is over the popup
		if (insideIframe) return;
		
		if (!delay) delay = 5000;
		stopCloseTimer();
		closeTimeoutID = setTimeout(hideFrame, delay);
	}
	
	function stopCloseTimer() {
		if (closeTimeoutID) {
			clearTimeout(closeTimeoutID);
		}
	}
	
	async function initFrame() {
		// Create the iframe
		var iframe = document.createElement('iframe');
		iframe.id = frameID;
		iframe.src = frameSrc;
		var style = {
			position: 'fixed',
			top: '15px',
			left: 'unset',
			right: '8px',
			width: '351px',
			maxWidth: '95%',
			height: '120px',
			border: "none",
			zIndex: 2147483647,
			display: 'none'
		};
		for (let i in style) iframe.style[i] = style[i];
		window.top.document.body.appendChild(iframe);
	
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
		addMessageListener('progressWindowIframe.registered', function() {
			frameReadyDeferred.resolve(iframe);
		});
		
		// Adjust iframe height when inner document is resized
		addMessageListener('progressWindowIframe.resized', function(data) {
			iframe.style.height = (data.height + 33) + "px";
		});
		
		// Update the client or API with changes
		var handleUpdated = async function (data) {
			// If the session isn't yet registered or a session update is in progress,
			// store the data to run after, overwriting any already-queued data
			if (!createdSessions.has(currentSessionID) || updatingSession) {
				nextSessionUpdateData = data;
				return;
			}
			updatingSession = true;
			
			try {
				await Zotero.Connector.callMethod(
					"updateSession",
					{
						sessionID: currentSessionID,
						target: data.target.id,
						tags: data.tags
							// TEMP: Avoid crash on leading/trailing comma pre-5.0.57
							? data.tags.replace(/(^,|,$)/g, '') : data.tags
					}
				);
			}
			// Collapse popup on error
			catch (e) {
				makeReadOnly();
				throw e;
			}
			finally {
				updatingSession = false;
			}
			
			if (nextSessionUpdateData) {
				data = nextSessionUpdateData;
				nextSessionUpdateData = null;
				return handleUpdated(data);
			}
			
			// Keep track of last successful target to show on reopen and failure
			lastSuccessfulTarget = data.target;
		};
		
		// Once a session is created in the client, send any queued session data
		Zotero.Messaging.addMessageListener('progressWindow.sessionCreated', async function (args) {
			var sessionID = args.sessionID;
			createdSessions.add(sessionID);
			if (nextSessionUpdateData) {
				let data = nextSessionUpdateData;
				nextSessionUpdateData = null;
				handleUpdated(data)
			}
		});
		
		// Sent by the progress window when changes are made in the target selector
		addMessageListener('progressWindowIframe.updated', handleUpdated);
		
		// Keep track of when the mouse is over the popup, for various purposes
		addMessageListener('progressWindowIframe.mouseenter', handleMouseEnter);
		addMessageListener('progressWindowIframe.mouseleave', handleMouseLeave);

		// Hide iframe if it loses focus and the user recently clicked on the main page
		// (i.e., they didn't just switch to another window)
		addMessageListener('progressWindowIframe.blurred', async function() {
			await Zotero.Promise.delay(150);
			if (lastClick > new Date() - 500) {
				hideFrame();
			}
		});
		
		addMessageListener('progressWindowIframe.close', function() {
			hideFrame();
			if (!Zotero.isBookmarklet) {
				window.focus();
			}
		});

		await frameReadyDeferred.promise;
		return iframe;
	}

	/**
	 * Shows the frame (initializing it if neccessary)
	 * @returns {Promise<iframe>}
	 */
	async function showFrame() {
		let iframe
		if (!frameInitialized) {
			iframe = await initFrame();
		} else {
			iframe = await frameReadyDeferred.promise;
		}
		// If the frame has been hidden since we started to open it, don't make it visible
		if (!frameIsHidden) {
			addEvent('shown');
			iframe.style.display = 'block';
		}
		
		// Delay syncs by 10 seconds at a time (specified in server_connector.js) while
		// the selector is open. Run every 7.5 seconds to make sure the request gets
		// there in time.
		if (syncDelayIntervalID) {
			clearInterval(syncDelayIntervalID);
		}
		syncDelayIntervalID = setInterval(() => {
			// Don't prevent syncing when read-only or when tab isn't visible.
			// See note in ProgressWindow.jsx::handleVisibilityChange() for latter.
			if (isReadOnly || document.hidden) return;
			
			Zotero.Connector.callMethod("delaySync", {});
		}, 7500);
		
		return iframe;
	}
	
	/**
	 * This is called after an item has started to save in order to show the progress window
	 */
	Zotero.Messaging.addMessageListener("progressWindow.show", async function (args) {
		// Mark frame as visible immediately, so that if it's hidden before it's done initializing
		// (e.g., when displaying the Select Items window) we can skip displaying it
		frameIsHidden = false;
		
		var [sessionID, headline, readOnly, delay] = args;
		
		if (delay) {
			await Zotero.Promise.delay(delay);
		}
		
		// Reopening existing popup
		if (currentSessionID) {
			// If session has changed, reset state before reopening
			if (currentSessionID != sessionID) {
				resetFrame();
				// Disable closing on mouseleave until save finishes. (This is disabled initially
				// but is enabled when a save finishes, so we have to redisable it for a new session.)
				closeOnLeave = false;
				lastSuccessfulTarget = null;
			}
		}
		currentSessionID = sessionID;
		
		await showFrame();
		
		if (readOnly) {
			changeHeadline(headline);
		}
		else {
			await updateFromClient(headline);
		}
	});
	
	/**
	 * @param {String} sessionID
	 * @param {Integer} id
	 * @param {String} iconSrc
	 * @param {String} title
	 * @param {Integer|false} parentItem
	 * @param {Integer|false} progress
	 */
	Zotero.Messaging.addMessageListener("progressWindow.itemProgress", (data) => {
		// Skip progress updates for a previous session
		if (data.sessionID && data.sessionID != currentSessionID) return;
		// Keep progress window open as long as we're receiving updates
		addEvent("updateProgress", [data.id, data]);
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.close", function () {
		// Mark frame as hidden so that if this is called after a progressWindow.show but before
		// the popup has been initialized (e.g., when displaying the Select Items dialog) it's
		// not made visble
		frameIsHidden = true;
		
		hideFrame();
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.setSession", function (sessionID) {
		currentSessionID = sessionID;
	});

	Zotero.Messaging.addMessageListener("progressWindow.reopen", function () {
		showFrame();
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.done", (returnValue) => {
		closeOnLeave = true;
		if (Zotero.isBrowserExt
				&& document.location.href.startsWith(browser.extension.getURL('confirm.html'))) {
			setTimeout(function() {
				window.close();
			}, 1000);
		}
		else if (returnValue[0]) {
			startCloseTimer(3000);
		}
		else {
			addError(returnValue[1] || "translationError");
			startCloseTimer(8000);
		}
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.error", (args) => {
		addError(args.shift(), ...args);
	})
}

})();
