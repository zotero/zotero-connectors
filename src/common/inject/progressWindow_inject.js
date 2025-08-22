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

if (isTopWindow) {
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
	
	var currentSessionID;
	var createdSessions = new Set();
	var updatingSession;
	var nextSessionUpdateData;
	
	var isReadOnly = false;
	var isFilesEditable = false;
	var syncDelayIntervalID;
	var insideIframe = false;
	var closeTimerDisabled = false;
	var blurred = false;
	var frameSrc;
	var frameIsHidden = false;
	frameSrc = Zotero.getExtensionURL('progressWindow/progressWindow.html');
	var scrollX;
	var scrollY;
	
	async function sendMessage(name, data = {}) {
		// frameId=null - send message to all frames
		return Zotero.Messaging.sendMessage(name, data, null, null);
	}

	function addMessageListener(name, handler) {
		return Zotero.Messaging.addMessageListener(name, handler);
	}
	
	// The progress window component is initialized asynchronously, so queue updates and send them
	// to the iframe once the component is ready
	function addEvent(name, data) {
		frameReadyDeferred.promise.then(function() {
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
	async function updateFromClient(prefix, retryOnReadOnly = true) {
		try {
			var response = await Zotero.Connector.callMethod("getSelectedCollection", { switchToReadableLibrary: true })
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
		
		// The library will change to editable upon save to a read-only library,
		// so the currently selected library information is wrong/irrelevant
		if (response.libraryEditable === false) {
			if (retryOnReadOnly) {
				setTimeout(() => updateFromClient(prefix, false), 250);
			}
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
			name: response.name,
			filesEditable: response.filesEditable
		};
		
		if (response.libraryEditable) {
			lastSuccessfulTarget = target;
		}
		
		let targets = response.targets.filter(t => !isFilesEditable || t.filesEditable);

		// TEMP: Make sure libraries have levels (added to client in 5.0.46)
		if (response.targets) {
			for (let row of response.targets) {
				if (!row.level) {
					row.level = 0;
				}
			}
		}
		
		// Format tags for autocomplete
		// Tags array contains objects {tag : ""} that may contain duplicate values due to different types
		// Unwrap the tag objects and deduplicate tags values to keep this object format {libraryID: [tag1, tag2, ...]}
		let tags = {};
		Object.entries(response.tags || []).forEach(([libraryID, tagArr]) => {
			tags[libraryID] = [...new Set(tagArr.map(item => item.tag))];
		});

		changeHeadline(prefix, target, targets, tags);
	}
	
	async function addError() {
		await showFrame();
		addEvent("addError", Array.from(arguments));
	}
	
	function hideFrame() {
		insideIframe = false;
		
		var frame = document.getElementById(frameID);
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
		blurred = false;
		stopCloseTimer();
		
		// See scroll listener in initFrame()
		scrollX = window.scrollX;
		scrollY = window.scrollY;
	}
	
	function handleMouseLeave() {
		insideIframe = false;
		if (closeOnLeave) {
			startCloseTimer(closeOnLeave);
		}
	}
	
	function startCloseTimer(delay) {
		// Don't start the timer if the mouse is over the popup or the tags box has focus
		if (insideIframe) return;
		if (closeTimerDisabled) return;
		
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
		iframe.title = Zotero.getString('general_saveTo', 'Zotero');
		iframe.setAttribute('data-single-file-hidden-frame', '');
		var style = {
			position: 'fixed',
			top: '15px',
			left: 'unset',
			right: '8px',
			width: '351px',
			maxWidth: '95%',
			height: '120px',
			border: "none",
			padding: "none",
			margin: "initial",
			zIndex: 2147483647,
			display: 'none',
			// frame becomes scrollable if the user zooms in (wcag 1.4.10), or half of it will be inaccessible
			maxHeight: '90vh' 
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
			// If we're making changes, don't close the popup and keep delaying syncs
			stopCloseTimer();
			blurred = false;
			
			// If the session isn't yet registered or a session update is in progress,
			// store the data to run after, overwriting any already-queued data
			if (!createdSessions.has(currentSessionID) || updatingSession) {
				nextSessionUpdateData = data;
				return;
			}
			updatingSession = true;
			
			try {
				await sendMessage(
					"updateSession",
					{
						target: data.target.id,
						tags: data.tags,
						note: data.note.replace(/\n/g, "<br>"), // replace newlines with <br> for note-editor
						resaveAttachments: !lastSuccessfulTarget.filesEditable && data.target.filesEditable,
						removeAttachments: lastSuccessfulTarget.filesEditable && !data.target.filesEditable
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
		
		addMessageListener('progressWindowIframe.disableCloseTimer', () => closeTimerDisabled = true);
		addMessageListener('progressWindowIframe.enableCloseTimer', () => closeTimerDisabled = false);
		
		addMessageListener('progressWindowIframe.blurred', async function() {
			blurred = true;
			
			// Hide iframe if it loses focus and the user recently clicked on the main page
			// (i.e., they didn't just switch to another window)
			await Zotero.Promise.delay(150);
			if (lastClick > new Date() - 500) {
				hideFrame();
			}
		});
		
		addMessageListener('progressWindowIframe.close', function() {
			hideFrame();
			window.focus();
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
			frameInitialized = true;
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
			if (isReadOnly || document.hidden || blurred) return;
			
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
		
		var [sessionID, headline, readOnly, filesEditable] = args;
		if (typeof filesEditable != "undefined") {
			isFilesEditable = filesEditable;
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
		
		return true;
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
	
	Zotero.Messaging.addMessageListener("progressWindow.done", async (returnValue) => {
		const isTabFocused = await Zotero.Connector_Browser.isTabFocused();
		if (!isTabFocused) {
			// Don't queue hiding the progress bar if the save finished when the tab was not focused,
			// so that when the user switches to it they can review the save.
			// However, we set closeOnLeave, because when you switch to the tab, it seems that
			// iframe mouseLeave event is automatically fired, and either way we don't want the progress window
			// to be displayed forever.
			closeOnLeave = 8000;
			return;
		}
		closeOnLeave = 2500;
		if (document.location.href.startsWith(Zotero.getExtensionURL('confirm/confirm.html'))) {
			// Handled in contentTypeHandler
			return;
		}
		if (returnValue[0]) {
			startCloseTimer(3000);
			addEvent("willHide");
		}
		else {
			if (returnValue.length < 2) {
				returnValue.push('translationError');
			}
			addError(returnValue[1], ...returnValue.slice(2));
			startCloseTimer(8000);
		}
	});
	
	Zotero.Messaging.addMessageListener("progressWindow.error", (args) => {
		addError(args.shift(), ...args);
	})
}

})();
