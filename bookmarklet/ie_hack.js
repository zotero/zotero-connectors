window.onmessage = function(event) {
	if((event.origin !== "https://www.zotero.org" && event.origin !== "http://www.zotero.org")
			|| event.source != window.parent) {
		throw "ie_hack.js received an invalid message";
	}
	
	var data = JSON.parse(event.data);
	if(data[1] !== "connectorRequest") return;
	var requestID = data[2][0], method = data[2][1], payload = data[2][2];
	
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
			
			window.parent.postMessage(JSON.stringify([requestID, xhr.status, xhr.responseText, headers]),
				"http://www.zotero.org/bookmarklet/iframe_ie.html");
		}
	};
	xhr.setRequestHeader("Content-Type", "application/json");
	xhr.setRequestHeader("X-Zotero-Version", "2.999.1");
	xhr.setRequestHeader("X-Zotero-Connector-API-Version", 2);
	xhr.send(payload);
}

window.parent.postMessage('standaloneLoaded', "http://www.zotero.org/bookmarklet/iframe_ie.html");
