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
	// Progress window popup initialization
	//
	// The progress window is created using React in an iframe, and we use postMessage() to
	// communicate with it based on events from the messaging system (so that we don't need to
	// load complicated messaging code into the iframe).
	//
	var frameID = 'zotero-progress-window-frame';
	var listenersRegistered = false;
	var currentSessionID;
	var lastSuccessfulTarget;
	var frameWindow;
	var eventQueue = [];
	var closeTimeoutID;
	var syncDelayIntervalID;
	var insideIframe = false;
	var frameSrc;
	if (Zotero.isSafari) {
		frameSrc = safari.extension.baseURI.toLowerCase() + 'progressWindow/progressWindow.html';
	}
	else {
		frameSrc = browser.extension.getURL('progressWindow/progressWindow.html');
	}
	var origin = frameSrc.match(/^[a-z\-]+:\/\/[^\/]+/)[0];
	var scrollX;
	var scrollY;
	
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
	
	function makeReadOnly() {
		addEvent("makeReadOnly", [lastSuccessfulTarget]);
	}
	
	/**
	 * Get selected collection and collections list from client and update popup
	 */
	async function setHeadlineFromClient(prefix) {
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
		
		if (!prefix) {
			prefix = "Saving to ";
		}
		
		var target = lastSuccessfulTarget = {
			id,
			name: response.name
		};
		changeHeadline(prefix, target, response.targets);
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
		insideIframe = false;
		
		var frame = document.getElementById(frameID);
		frame.style.display = 'none';
		addEvent("hidden");
		
		// Stop delaying syncs when the window closes
		if (syncDelayIntervalID) {
			clearInterval(syncDelayIntervalID);
		}
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
		return;
		// Don't start the timer if the mouse is over the popup
		if (insideIframe) return;
		
		if (!delay) delay = 2500;
		stopCloseTimer();
		closeTimeoutID = setTimeout(hideFrame, delay);
	}
	
	function stopCloseTimer() {
		if (closeTimeoutID) {
			clearTimeout(closeTimeoutID);
		}
	}
	
	/**
	 * This is called after an item has started to save in order to show the progress window
	 */
	Zotero.Messaging.addMessageListener("progressWindow.show", async function (args) {
		var [sessionID, headline, useTargetSelector] = args;
		if (useTargetSelector === undefined) {
			useTargetSelector = true;
		}
		
		if (currentSessionID) {
			// If session has changed, reset state before reopening popup
			if (currentSessionID != sessionID) {
				resetFrame();
				currentSessionID = sessionID;
				if (useTargetSelector) {
					await setHeadlineFromClient(headline);
				}
				else {
					changeHeadline(headline);
				}
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
			right: '8px',
			width: '351px',
			height: '120px',
			border: "none",
			zIndex: 2147483647
		};
		for (let i in style) iframe.style[i] = style[i];
		document.body.appendChild(iframe);
		
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
				
				// Delay syncs by 10 seconds at a time (specified in server_connector.js) while
				// the selector is open. Run every 7.5 seconds to make sure the request gets
				// there in time.
				syncDelayIntervalID = setInterval(() => {
					Zotero.Connector.callMethod("delaySync", {});
				}, 7500);
				break;
			
			// Adjust iframe height when inner document is resized
			case 'zotero.progressWindow.resized':
				iframe.style.height = (event.data.height + 33) + "px";
				break;
			
			// Update the client or API with changes
			case 'zotero.progressWindow.updated':
				try {
					await Zotero.Connector.callMethod(
						"updateSession",
						{
							sessionID: currentSessionID,
							target: event.data.target.id,
							tags: event.data.tags
						}
					);
				}
				// Collapse popup on error
				catch (e) {
					makeReadOnly();
					throw e;
				}
				// Keep track of last successful target to show on failure
				lastSuccessfulTarget = event.data.target;
				break;
			
			// Keep track of when the mouse is over the popup, for various purposes
			case 'zotero.progressWindow.mouseenter':
				insideIframe = true;
				stopCloseTimer();
				
				// See scroll listener above
				scrollX = window.scrollX;
				scrollY = window.scrollY;
				break;
			
			case 'zotero.progressWindow.mouseleave':
				insideIframe = false;
				startCloseTimer();
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
			case 'zotero.progressWindow.close':
				hideFrame();
				break;
			}
		});
		
		if (useTargetSelector) {
			await setHeadlineFromClient(headline);
		}
		else {
			changeHeadline(headline);
		}
	});
	
	/**
	 * @param {Integer} id
	 * @param {String} iconSrc
	 * @param {String} title
	 * @param {Integer|false} parentItem
	 * @param {Integer|false} progress
	 */
	Zotero.Messaging.addMessageListener("progressWindow.itemProgress", (data) => {
		var id = data[0];
		var data = {
			iconSrc: data[1],
			title: data[2],
			parentItem: data[3],
			progress: data[4] // false === error
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
}
