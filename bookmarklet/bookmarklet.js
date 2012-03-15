new function() {
	if(document.getElementById("zotero-iframe")) {
		alert("A previous translation process is still in progress. Please wait for it to complete, "+
			"or refresh the page.");
		return;
	};
	
	var iframe = document.createElement("iframe"),
		tag = (document.body ? document.body : document.documentElement);
	iframe.id = "zotero-iframe"
	iframe.style.display = "none";
	iframe.style.borderStyle = "none";
	iframe.setAttribute("frameborder", "0");
	tag.appendChild(iframe);
	
	var doc = iframe.contentWindow.document,
		init = function() {
		var baseURL = "https://www.zotero.org/bookmarklet/",
		scripts = (navigator.appName === "Microsoft Internet Explorer"
			? [baseURL+"ie_compat.js", baseURL+"inject_ie.js"] : [baseURL+"inject.js"]);
		
		if(doc.documentElement && doc.documentElement.appendChild) {
			for(var i in scripts) {
				var script = doc.createElement("script");
				script.type = "text/javascript";
				script.src = scripts[i];
				(doc.body ? doc.body : doc.documentElement).appendChild(script);
			}
		} else {
			doc.write("<!DOCTYPE html><html><head><script type=\"text/javascript\" src=\""
				+scripts.join("\"></script><script type=\"text/javascript\" src=\"")
				+"\"></script></head></html>");
		}
	}
	
	if(doc.readyState === "complete") {
		init();
	} else {
		iframe.onload = init;
	}
};
undefined;