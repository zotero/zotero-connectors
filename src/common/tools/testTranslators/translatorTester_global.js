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

Zotero.TranslatorTester = {};
var _tabData = {};

/**
 * Called to run tests using the testing framework in Chrome or Safari, not to be confused with
 * Zotero_TranslatorTester#runTests
 */
Zotero.TranslatorTester.runTests = function(translator, type, instanceID, tab) {
	var debug = function(obj, msg, level) {
		Zotero.Messaging.sendMessage("translatorTester_debug", [instanceID, [null, msg, level]], tab);
	}
	
	var translatorTester = new Zotero_TranslatorTester(translator, type, debug);
	translatorTester.runTests(function(obj) {
		var args = new Array(arguments.length);
		args[0] = JSON.parse(JSON.stringify(obj));
		for(var i=1; i<arguments.length; i++) args[i] = arguments[i];
		Zotero.Messaging.sendMessage("translatorTester_testDone", [instanceID, args], tab);
	});
}

/**
 * Called on every page load to test whether page is part of a test. This is why you shouldn't
 * use a debug build for production purposes.
 */
Zotero.TranslatorTester.onLoad = function(callback, tab) {
	if(_tabData[tab.id]) {
		var tabData = _tabData[tab.id];
		return [tabData.instance.translator, tabData.instance.type, tabData.test];
	} else {
		return false;
	}
}

/**
 * Called via injected script with debug output
 */
Zotero.TranslatorTester.debug = function(obj, message, level, tab) {
	_tabData[tab.id].instance._debug(obj, message, level);
}

/**
 * Called via injected script when test is complete
 */
Zotero.TranslatorTester.testComplete = function(obj, test, status, message, tab) {
	_tabData[tab.id].callback(obj, test, status, message);
	window.clearTimeout(_tabData[tab.id].timeoutID);
	delete _tabData[tab.id];
	if(Zotero.isSafari) {
		tab.close();
	} else if(Zotero.isBrowserExt) {
		browser.tabs.remove(tab.id);
	}
}

/**
 * Performs automated translator testing
 */
Zotero.TranslatorTester.runAutomatedTesting = new function() {
	var isRunning = false;
	
	return function() {
		if(isRunning) return;
		isRunning = true;
		window.setTimeout(function() {
			Zotero_TranslatorTesters.runAllTests(4, {}, function(data) {
				isRunning = false;
				Zotero.HTTP.request('POST', `http://127.0.0.1:23119/provo/save`, {
					body: JSON.stringify(data),
					headers: {"Content-Type":"application/json"}})
			});
		}, 60000);
	};
};

/**
 * Fetches the page for a given test and runs it
 * @param {Object} test Test to execute
 * @param {Function} testDoneCallback A callback to be executed when test is complete
 * @param {String} url URL to override the test URL
 */
Zotero_TranslatorTester.prototype.fetchPageAndRunTest = function(test, testDoneCallback, url) {
	var tabData = {
		"instance":this,
		"test":test,
		"callback":testDoneCallback
	};
	
	if(Zotero.isSafari) {
		var tab = safari.application.activeBrowserWindow.openTab("background");
		tab.url = (url ? url : test.url);
		tab.id = (new Date()).getTime();
		tabData.tab = tab;
		tabData.timeoutID = window.setTimeout(function() {
			try {
				tab.close();
				delete _tabData[tab.id];
			} catch(e) {}
		}, TEST_RUN_TIMEOUT);
		
		_tabData[tab.id] = tabData;
	} else if(Zotero.isBrowserExt) {
		browser.tabs.create({url: (url ? url : test.url), active: false}).then(function(tab) {
			tabData.tab = tab;
			tabData.timeoutID = window.setTimeout(function() {
				try {
					browser.tabs.remove(tab.id);
					delete _tabData[tab.id];
				} catch(e) {}
			}, TEST_RUN_TIMEOUT);
			
			_tabData[tab.id] = tabData;
		});
	}
}

/**
 * Runs non-web tests in a different tab
 */
Zotero_TranslatorTester.prototype.runTest = function(test, doc, testDoneCallback) {
	this.fetchPageAndRunTest(test, testDoneCallback, "http://127.0.0.1:23119/");
}