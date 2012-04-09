var POST_TO = "https://www.zotero.org/";

window.onmessage = function(event) {
	var data = event.data;
	var xhr = new XMLHttpRequest();
	if(xhr.upload) {
		xhr.upload.addEventListener("progress", function(event) {
			// Don't fire progress on 100%
			if(!event.total || event.loaded == event.total) return;
			window.parent.postMessage([data.id, event.loaded/event.total*100], POST_TO);
		}, false);
	}
	xhr.open("POST", "/", true);  
	xhr.onreadystatechange = function() {
		if(xhr.readyState !== 4) return;
		window.parent.postMessage([data.id,
			(this.status == 200 || this.status == 201 ? 100 : false), this.responseText], POST_TO);
	};
	xhr.setRequestHeader("Content-Type", data.contentType);
	xhr.send(data.data.buffer);
};

window.parent.postMessage("", POST_TO);
