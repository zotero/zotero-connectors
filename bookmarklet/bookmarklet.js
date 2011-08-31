new function() {
	var script = document.createElement("script");
	script.setAttribute("src", "https://www.zotero.org/bookmarklet/inject.js");
	(document.head ? document.head : document.documentElement).appendChild(script);
};
undefined;