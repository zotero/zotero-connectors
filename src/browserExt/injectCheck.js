(function() {

	var isTopWindow = false;
	try {
		isTopWindow = window.top == window;
	} catch(e) {};

	// check whether this is a hidden browser window being used for scraping
	var isHiddenIFrame = false;
	try {
		isHiddenIFrame = !isTopWindow && window.frameElement && window.frameElement.style.display === "none";
	} catch(e) {}

	/**
	 * FX50 compatibility
	 * See: https://bugzilla.mozilla.org/show_bug.cgi?id=1286746 
	 * TODO: remove once FX51 launches
	 */
	function listener(request, sender, sendResponse) {
		chrome.runtime.onMessage.removeListener(listener);
		sendResponse();
	}
	chrome.runtime.onMessage.addListener(listener);
	
	/**
	 * Looks for translators for the page and injects translation scripts, if translators are found
	 */
	function sendFrameLoaded() {
		chrome.runtime.sendMessage(["frameLoaded", [window.location.href, window.top.location.href]]);
	}

	if(!isHiddenIFrame && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
		// Wait until pages in prerender state become visible before looking for translators
		if (document.visibilityState == 'prerender') {
			var handler = function() {
				sendFrameLoaded();
				document.removeEventListener("visibilitychange", handler);
			};
			document.addEventListener("visibilitychange", handler);
		} else {
			sendFrameLoaded();
		}
	}

})();
