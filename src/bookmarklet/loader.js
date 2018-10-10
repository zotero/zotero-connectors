(function() {
	var iframe = document.getElementById("zotero-iframe");
	if (iframe) {
		iframe.contentWindow.postMessage(['progressWindow.reopen', null], '*');
		return;
	};
	
	var baseURL = 'https://www.zotero.org/bookmarklet/',
		common = baseURL+"common.js",
		inject = baseURL+"inject.js";
	
	iframe = document.createElement("iframe"),
		tag = document.body || document.documentElement;
	iframe.id = "zotero-iframe"
	iframe.style.display = "none";
	iframe.style.borderStyle = "none";
	iframe.setAttribute("frameborder", "0");
	iframe.src = 'javascript:(function(){document.open();try{window.parent.document;}catch(e){document.domain="' + document.domain.replace(/[\\\"]/g, "\\$0")+'";}document.write(\'<!DOCTYPE html><html><head><script src="'+common+'"></script><script src="'+inject+'"></script></head><body></body></html>\');document.close();})()';
	tag.appendChild(iframe);
})();
