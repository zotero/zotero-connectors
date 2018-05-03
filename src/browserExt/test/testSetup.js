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
		browser.tabs.onUpdated.addListener(async function(tabId, changeInfo, tab) {
			var deferred = Zotero.Background.registeredTabs[tabId];
			if (!deferred || deferred.resolved || changeInfo.status != 'complete') return;
			// Don't try to inject in extension own pages
			if (tab.url.includes('-extension://')) {
				return Zotero.Promise.delay(1000).then(function() {
					deferred.resolved = true;
					deferred.resolve(tab.id)
				});
			}
			
			let scripts = [ 'lib/sinon.js', 'test/testSetup.js' ];
			try {
				await Zotero.Connector_Browser.injectScripts(scripts, tab);
				deferred.resolved = true;
				deferred.resolve(tab.id);
			} catch(e) {
				deferred.resolved = true;
				deferred.reject(e)
			}
		});
		Zotero.Background.getTabByID = async function(tabId) {
			return browser.tabs.get(tabId);
		};
	}
	else if (Zotero.isInject || Zotero.isPreferences) {
		// injected page
		var listenerName = 'run';
		if (window.top != window) {
			listenerName = `run-${document.location.href}`;
		}
		Zotero.Messaging.addMessageListener(listenerName, function(args) {
			var code = args[0];
			eval(`var fn = ${code}`);
			code = undefined;
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
		return browser.extension.getURL(url);
	}
	
	var Tab = function() {};
	window.Tab.prototype = {
		init: Promise.coroutine(function* (url='http://zotero-static.s3.amazonaws.com/test.html') {
			this.tabId = yield background(async function(url) {
				var deferred = Zotero.Promise.defer();
				var tab = await browser.tabs.create({url, active: false});
				Zotero.Background.registeredTabs[tab.id] = deferred;
				return deferred.promise;
			}, url);
		}),
		
		navigate: Promise.coroutine(function* (url) {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			yield background(function(url, tabId) {
				Zotero.Background.registeredTabs[tabId] = Zotero.Background.defer();
				browser.tabs.update(tabId, {url});
				return Zotero.Background.registeredTabs[tabId].promise;
			}, url, this.tabId);
			yield Promise.delay(450);
			if (Zotero.isFirefox) {
				// Firefox is just slow in injecting..
				yield Promise.delay(1500);
			}
		}),
		
		run: Promise.coroutine(function* (code) {
			return this.runInFrame.apply(this, [null].concat(Array.from(arguments)));
		}),
		
		runInFrame: async function(frameURL, code) {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#run');
			}
			if (typeof code == 'function') {
				arguments[1] = code.toString();
			}
			var listenerName = 'run';
			if (frameURL) {
				listenerName = `run-${frameURL}`;
				// Seems that frames are not initialized if the tab is inactive in Chrome
				// so we focus the tab for a bit.
				await background(async function(tabId) {
					var prevActiveTab = await browser.tabs.query({active: true, currentWindow: true});
					await browser.tabs.update(tabId, {active: true});
					await Zotero.Promise.delay(100);
					await browser.tabs.update(prevActiveTab[0].id, {active: true});
				}, this.tabId)
			}
			var args = Array.from(arguments).slice(1);
			// NOTE: Due to chrome/browser API-compat stuff this needs to use Promise#then(). Do not change!
			return browser.tabs.sendMessage(this.tabId, [listenerName, args], {})
			.then(function(response) {
				if (response && response[0] == 'error') {
					response[1] = JSON.parse(response[1]);
					let e = new Error(response[1].message);
					for (let key in response[1]) e[key] = response[1][key];
					throw e;
				}
				return response;
			}, function(e) {
				if (!(e instanceof Error)) {
					throw new Error(e.message);
				}
			});
		},
		
		close: Promise.coroutine(function* () {
			if (this.tabId == undefined) {
				throw new Error('Must run Tab#init() before Tab#close');
			}
			yield browser.tabs.remove(this.tabId);
			delete this.tabId;
		})
	};

	var assert = chai.assert;
	Zotero.Messaging.init();
	mocha.setup({ui: 'bdd', timeout: 6000});
}

