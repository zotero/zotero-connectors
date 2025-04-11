(async () => {
	Zotero.Messaging.init();
	const isImport = window.location.hash.startsWith('#importCsl=') || window.location.hash.startsWith('#importContent=');
	if (isImport) {
		browser.runtime.sendMessage(['confirmImport', []]);
	}
})();