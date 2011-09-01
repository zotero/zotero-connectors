var BOOKMARKLET_MESSAGE_PREFIX = "ZOTERO_IE_HACK_MSG ";

window.addEventListener("message", function(event) {
	if(event.origin !== "https://www.zotero.org"
	|| event.data.substr(0, BOOKMARKLET_MESSAGE_PREFIX.length) !== BOOKMARKLET_MESSAGE_PREFIX) {
		throw "ie_hack.js received an invalid message";
	}
	
	var data = JSON.parse(event.data.substr(BOOKMARKLET_MESSAGE_PREFIX.length));
	if(data[0] !== "connectorRequest") return;
	var requestID = data[1][0], method = data[1][1], payload = data[1][2];
	
	var xhr = new XMLHttpRequest();  
	xhr.open("POST", "/connector/"+method, true);  
	xhr.onreadystatechange = function() {
		if(xhr.readyState === 4) {
			var rawHeaders = xhr.getAllResponseHeaders().split(/\r?\n/g), headers = {};
			for(var i=0, n=rawHeaders.length; i<n; i++) {
				var rawHeader = rawHeaders[i],
					colonIndex = rawHeader.indexOf(":");
				if(colonIndex === -1) continue;
				headers[rawHeader.substr(0, colonIndex).toLowerCase()] = rawHeader.substr(colonIndex+2);
			}
			
			window.parent.postMessage(BOOKMARKLET_MESSAGE_PREFIX+" "+JSON.stringify(["connectorResponse",
				[requestID, xhr.status, xhr.responseText, headers]]),
				"https://www.zotero.org/bookmarklet/iframe_ie.html");
		}
	};
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("X-Zotero-Version", "2.999.1");
	xhr.setRequestHeader("X-Zotero-Connector-API-Version", 2);
	xhr.send(payload);
});

window.parent.postMessage("ZOTERO_IE_STANDALONE_LOADED true",
	"https://www.zotero.org/bookmarklet/iframe_ie.html")