var data = /*ZOTERO_SCHEMA*/;
var initSchema = Zotero.Schema.init;

Zotero.Schema.init = function() {
	initSchema(data);
	// Store en-US locale for item field/type label lookups
	Zotero.Schema.locale = data.locales && data.locales['en-US'] || {};
};
