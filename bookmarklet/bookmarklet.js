new function() {
	if(document.getElementById("zotero-iframe")) {
		alert("A previous translation process is still in progress. Please wait for it to complete, "+
			"or refresh the page.");
		return;
	};
	
	var f = document.createElement("iframe"),
		a = (document.body ? document.body : document.documentElement);
	f.id = "zotero-iframe"
	f.style.display = "none";
	f.style.borderStyle = "none";
	f.setAttribute("frameborder", "0");
	a.appendChild(f);
	
	var init = function() {
		var d = f.contentWindow.document,
			r = "https://www.zotero.org/bookmarklet/inject"+(navigator.appName === "Microsoft Internet Explorer" ? "_ie": "")+".js";
		if(d.documentElement && d.documentElement.appendChild) {
			var s = d.createElement("script");
			s.type = "text/javascript";
			s.src = r;
			(d.body ? d.body : documentElement).appendChild(s);
		} else {
			d.write("<!DOCTYPE html><html><head><script type=\"text/javascript\" src=\""+r+"\"></script></head></html>");
		}
	}
	
	if(f.contentWindow.document.readyState === "complete") {
		init();
	} else {
		f.onload = init;
	}
};
undefined;