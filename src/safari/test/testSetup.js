/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2017 Center for History and New Media
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

/**
 * Provides #background(fn(args...), args...) and Tab.prototype.run(fn(args...), args...) to be used in tests,
 * which allow to run arbitrary functions/code in the background page and an open tab.
 *
 * sinon.js is available in both the background page and tabs. Stub away!
 * Bluebird and thus Promise.coroutine available in all tests
 * 
 * The functions are converted to text and passed over the Tab boundary. Only primitive parameters can be passed, e.g.
 *
 * var success = yield background(function(url) {
 *		// Executed within the background page
 *		Zotero.Connector_Browser.openTab(url)
 *		return 'success'	
 * }, 'https://www.zotero.org/)
 * 
 * Return value is a promise which resolves to the return value of the passed function. 
 * 
 * Errors across the tab boundary are rejected with shallow Error objects without the stack trace. 
 * Proper errors can be inspected in the background page console where they are logged.
 */

// Waiting for Zotero.initBackground()/initInject() to run
// so that Zotero.isBackground/Zotero.isInject are set
setTimeout(function() {
	if (typeof mocha != 'undefined') {
		var runner = mocha.run(function() {
			var elem = document.createElement('p');
			elem.setAttribute('id', 'mocha-tests-complete');
			document.body.appendChild(elem);
		});
		
		// Log results for Selenium access
		window.testResults = [];
		var flattenTitles = function(test){
			let titles = [test.title];
			while (test.parent.title){
				titles.push(test.parent.title);
				test = test.parent;
			}
			return titles.reverse();
		};
		function logResult(test, error) {
			try {
				window.testResults.push({
					title: flattenTitles(test),
					error: error && JSON.stringify(error, ['message', 'stack'].concat(Object.keys(error)))});
			} catch (e) {
				window.testResults.push({title: flattenTitles(test), error: JSON.stringify(error)});
			}
		}
		runner.on('pass', logResult);
		runner.on('fail', logResult);
	}
}, 500);

Zotero.initDeferred.promise.then(function() {
	if (Zotero.isBackground) {
		// background page
		Zotero.Background = {
			run: async function(code) {
				try {
					eval(`var fn = ${code}`);
					return fn.apply(null, Array.from(arguments).slice(1));
				} catch (e) {
					Zotero.logError(e);
					throw e;
				}
			}
		}
		Zotero.Background.registeredTabs = {};
		safari.application.addEventListener('navigate', async function(e) {
			var tab = e.target;
			var deferred = Zotero.Background.registeredTabs[tab.id];
			if (deferred && !deferred.resolved) {
				// Need the tab to be active for injected scripts to kick in.
				// Allow some breathing time
				await Zotero.Promise.delay(200);
				// Switch back to the test runner
				safari.application.activeBrowserWindow.tabs[safari.application.activeBrowserWindow.tabs.length-2].activate();
				deferred.resolved = true;
				deferred.resolve(tab.id);
			}
		});
		
		Zotero.Background.getTabByID = async function(tabId) {
			for (let t of safari.application.activeBrowserWindow.tabs) {
				if (t.id == tabId) {
					return t;
				}
			}	
		};
		// N.B. Use this to quickly open the test runner on reloads when developing tests with safari
		// Zotero.Connector_Browser.openTab(safari.extension.baseURI + "test/test.html?grep=");
	}
	else if (Zotero.isInject || Zotero.isPreferences) {
		// injected page
		Zotero.Messaging.addMessageListener('run', function(args) {
			let code = args[0];
			eval(`var fn = ${code}`);
			return fn.apply(null, args.slice(1));
		});
	}
});

if (typeof mocha != 'undefined') {
	// test.html
	/**
	 * @param code {Function|String}
	 * @params {Object} ... parameters to be passed into the function to be run
	 * @returns {Promise} return value of the function
	 */
	var background = Promise.coroutine(function* (code) {
		if (typeof code == 'function') {
			arguments[0] = code.toString();
		}
		return Zotero.Background.run.apply(null, arguments);
	});
	
	function getExtensionURL(url) {
		return safari.extension.baseURI + url;
	}
	
	var Tab = function() {
	};
	window.Tab.prototype = {
		init: Promise.coroutine(function* (url='http://zotero-static.s3.amazonaws.com/test.html') {
			this.tabId = yield background(function(url) {
				var tab = safari.application.activeBrowserWindow.openTab();
				tab.id = Date.now();
				tab.url = url;
				var deferred = Zotero.Promise.defer();
				Zotero.Background.registeredTabs[tab.id] = deferred;
				return deferred.promise;
			}, url);
		}),
		
		navigate: Promise.coroutine(function* (url) {
			if (!this.tabId) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			yield background(async function(tabId, url) {
				(await Zotero.Background.getTabByID(tabId)).url = url;
				Zotero.Background.registeredTabs[tabId] = Zotero.Background.defer();
				return Zotero.Background.registeredTabs[tabId].promise;
			}, this.tabId, url);
		}),
		
		run: Promise.coroutine(function* (code) {
			if (!this.tabId) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			if (typeof code == 'function') {
				arguments[0] = code.toString();
			}
			return background(async function(tabId, args) {
				return Zotero.Messaging.sendMessage('run', args, (await Zotero.Background.getTabByID(tabId)));
			}, this.tabId, Array.from(arguments));
		}),
		
		close: Promise.coroutine(function* () {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#close');
			}
			yield background(async function(tabId) {
				(await Zotero.Background.getTabByID(tabId)).close();
			}, this.tabId);
			yield Zotero.Promise.delay(20);
			delete this.tabId;
		})
	};

	var assert = chai.assert;
	Zotero.Messaging.init();
	mocha.setup({ui: 'bdd', timeout: 6000});
}

