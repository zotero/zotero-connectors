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
		baseURL = "https://www.zotero.org/bookmarklet/",
		ie = (navigator.appName === "Microsoft Internet Explorer" ? "_ie" : ""),
		common = baseURL+"common"+ie+".js",
		inject = baseURL+"inject"+ie+".js";
		
	/**
	 * Adds a script to the iframe page
	 */
	var addScript = function(src) {
		var doc = iframe.contentWindow.document,
			script = doc.createElement("script");
		script.src = src;
		(doc.body ? doc.body : doc.documentElement).appendChild(script);
		return script;
	};
	
	/**
	 * Starts loading the common script, triggering initialization cascade
	 */
	var init = function() {
		var script = addScript(common),
			loaded = false,
			onLoad = function() {
				if(!loaded) {
					addScript(inject);
					loaded = true;
				}
			};
		script.onload = onLoad;
		script.onreadystatechange = function() {
			if(script.readyState === "loaded" || script.readyState === "complete") onLoad();
		};
	};
	
	if(doc.readyState === "complete") {
		init();
	} else {
		iframe.onload = init;
	}
};
undefined;
