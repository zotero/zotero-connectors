/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

// Reinitialize messaging, since Zotero.Translators will have been overwritten
Zotero.Messaging.init();

Zotero.Messaging.addMessageListener("translate", function(data, event) {
	Zotero.ProgressWindow.changeHeadline("Running Test...");
	if(event.origin.substr(0, 6) === "https:" && ZOTERO_CONFIG.BOOKMARKLET_URL.substr(0, 5) === "http:") {
		ZOTERO_CONFIG.BOOKMARKLET_URL = "https:"+ZOTERO_CONFIG.BOOKMARKLET_URL.substr(5);
	}
	
	var translator = seleniumTestInfo.translator;
	translator.code = Zotero.Translators.preprocessCode(translator.code);
	var myTranslator = new Zotero.Translator(seleniumTestInfo.translator);
	myTranslator.runMode = Zotero.Translator.RUN_MODE_IN_BROWSER;
	
	var debugLines = [];
	function debug(obj, message) {
		if(typeof message !== "string") message = JSON.stringify(message);
		debugLines.push(message);
	}	
	function testDoneCallback(obj, test, status, message) {
		Zotero.ProgressWindow.changeHeadline("Test "+status.substr(0, 1).toUpperCase()+status.substr(1));
		debugLines.push("TranslatorTester: "+myTranslator.label+" Test "+seleniumTestInfo.testNumber+": "+status+" ("+message+")");
		seleniumCallback(JSON.stringify({"output":debugLines.join("\n\n"), "status":status}));
	}
	
	var translatorTester = new Zotero_TranslatorTester(myTranslator, "web", debug)
	translatorTester.runTest(seleniumTestInfo.test, document, testDoneCallback);
});