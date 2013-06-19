/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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

if(isTopWindow) {
	/**
	 * Used to run tests on injected pages, after the code in translatorTester_global has opened
	 * them
	 */
	Zotero_TranslatorTester.runTest = function(data) {
		if(data) {
			// extract data returned from global script
			var translator = data[0];
			translator.runMode = Zotero.Translator.RUN_MODE_IN_BROWSER; // force to run in browser
			var type = data[1];
			var test = data[2];
			
			// get schema and preferences
			var runTest = function() {
				// run tests
				var translatorTester = new Zotero_TranslatorTester(translator, type, function(obj, msg, level) {
					Zotero.TranslatorTester.debug(null, msg, level);
				});
				translatorTester.runTest(test, document, Zotero.TranslatorTester.testComplete);
			};
			
			if(test.defer) {
				window.setTimeout(runTest, 10000);
			} else {
				runTest();
			}
		}
	}
	
	/**
	 * Called once the page has loaded
	 */
	var loaded = false;
	var onLoad = function() {
		if(loaded) return;
		loaded = true;
		if(document.documentURI === "http://127.0.0.1:23119/provo/run"
				&& document.documentElement.textContent === "fnord") {
			window.setTimeout(function() {
				Zotero.TranslatorTester.runAutomatedTesting();
			}, 30000);
		} else {
			Zotero.TranslatorTester.onLoad(Zotero_TranslatorTester.runTest);
		}
	};
	
	// wait until load is finished, then see if there are associated tests
	if(document.readyState !== "complete") {
		window.addEventListener("load", function(e) {
			if(e.target !== document) return;
			onLoad();
		}, false);
	} else {
		onLoad();
	}
}