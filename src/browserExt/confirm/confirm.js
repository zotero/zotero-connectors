(async () => {
	await Zotero.i18n.init();
	document.title = Zotero.getString('confirmImport_title', ZOTERO_CONFIG.CLIENT_NAME);
	Zotero.Messaging.init();
	const isImport = window.location.hash.startsWith('#importCsl=') || window.location.hash.startsWith('#importContent=');
	if (isImport) {
		browser.runtime.sendMessage(['confirmImport', []]);
	}
})();