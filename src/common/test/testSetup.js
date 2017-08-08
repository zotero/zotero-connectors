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
	if (Zotero.isBackground) {
		// background page
		Zotero.Background = {
			run: function(code) {
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
		chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
			var deferred = Zotero.Background.registeredTabs[tabId];
			if (deferred) {
				if (changeInfo.status == "complete" && !deferred.resolved) {
					var scripts = [];
					// Don't try to inject in extension own pages
					if (!tab.url.includes('chrome-extension://')) {
						scripts = [ 'lib/sinon.js', 'test/testSetup.js' ];
					}
					Zotero.Connector_Browser.injectScripts(scripts, null, tab).catch(function(e) {
						deferred.resolved = true;
						deferred.reject(e);
					}).then(function() {
						deferred.resolved = true;
						deferred.resolve(tabId);
					});
				}
			}
		});
	} else if (Zotero.isInject || Zotero.isPreferences) {
		// injected page
		Zotero.Messaging.addMessageListener('run', function(args) {
			let code = args[0];
			try {
				eval(`var fn = ${code}`);
				return fn.apply(null, args.slice(1));
			} catch (e) {
				Zotero.logError(e);
				return ["error", e.message];
			}
		});
	}
	else if (typeof mocha != 'undefined') {
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
}, 400);

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
		var response = yield Zotero.Background.run.apply(null, arguments);
		if (Array.isArray(response) && response[0] == 'error') {
			throw Error(response[1]);
		}
		return response;
	});
	
	var Tab = function() {
		if (Zotero.isSafari) {
			throw new Error("Testing Safari is currently unsupported :(");
		}
	};
	window.Tab.prototype = {
		init: Promise.coroutine(function* (url='http://www.example.com') {
			if (Zotero.isBrowserExt) {
				this.tabId = yield background(function(url) {
					var deferred = Zotero.Promise.defer();
					chrome.tabs.create({url, active: false}, function(tab) {
						Zotero.Background.registeredTabs[tab.id] = deferred;
					});
					return deferred.promise;
				}, url);
				yield Promise.delay(450);
				if (Zotero.isFirefox) {
					// Firefox is just slow in injecting..
					yield Promise.delay(1500);
				}
			}
		}),
		
		navigate: Promise.coroutine(function* (url) {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			yield background(function(url, tabId) {
				Zotero.Background.registeredTabs[tabId] = Zotero.Background.defer();
				chrome.tabs.update(tabId, {url});
				return Zotero.Background.registeredTabs[tabId].promise;
			}, url, this.tabId);
			yield Promise.delay(450);
			if (Zotero.isFirefox) {
				// Firefox is just slow in injecting..
				yield Promise.delay(1500);
			}
		}),
		
		run: Promise.coroutine(function* (code) {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			if (typeof code == 'function') {
				arguments[0] = code.toString();
			}
			var response;
			if (Zotero.isFirefox) {
				// Firefox throws an error when the receiving end doesn't exist (e.g. before injection)
				response = yield browser.tabs.sendMessage(this.tabId, ['run', Array.from(arguments)], {})
					.catch(e => undefined);
			}
			else {
				let deferred = Zotero.Promise.defer();
				chrome.tabs.sendMessage(this.tabId, ['run', Array.from(arguments)], {}, deferred.resolve);
				var response = yield deferred.promise;
			}
			if (Array.isArray(response) && response[0] == 'error') {
				throw Error(response[1]);
			}
			return response;
		}),
		
		close: Promise.coroutine(function* () {
			yield new Promise((resolve) => chrome.tabs.remove(this.tabId, resolve));
			delete this.tabId;
		})
	};

	var assert = chai.assert;
	Zotero.Messaging.init();
	mocha.setup({ui: 'bdd', timeout: 6000});
}

