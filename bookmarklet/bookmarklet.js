new function() {
	var a = (document.head ? document.head : document.documentElement);
	var s = document.createElement("script");
	s.setAttribute("src", "https://www.zotero.org/bookmarklet/"+(navigator.appName === "Microsoft Internet Explorer" ? "inject_ie": "inject")+".js");
	a.appendChild(s);
};
undefined;