new function() {
	var l = (navigator.appName === "Microsoft Internet Explorer" ? ["inject_ie", "ie_compat"] : ["inject"]),
		i = l.length,
		a = (document.head ? document.head : document.documentElement);
	while(i--) {
		var s = document.createElement("script");
		s.setAttribute("src", "https://www.zotero.org/bookmarklet/"+l[i]+".js");
		a.appendChild(s);
	}
};
undefined;