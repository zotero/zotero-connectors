#!/usr/bin/env node

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

const fs = require('fs');
const path = require('path');
const process = require('process');
const selenium = require('selenium-webdriver');
const until = require('selenium-webdriver/lib/until');
const chalk = require('chalk');

const scriptDir = __dirname;
const rootDir = path.normalize(path.join(scriptDir, '..'));
const chromeExtensionDir = path.join(rootDir, 'build', 'chrome');
const KEEP_BROWSER_OPEN = 'KEEP_BROWSER_OPEN' in process.env;


function report(results) {
	var allPassed = true;
	var titleStack = [];
	while (titleStack.length < results[0].title.length-1) {
		titleStack.push(results[0]['title'][titleStack.length]);
		console.log('  '.repeat(titleStack.length) + titleStack[titleStack.length-1]);
	}
		
	for (let r of results) {
		while (titleStack.length > r['title'].length-1 
				|| titleStack[titleStack.length-1] != r['title'][titleStack.length-1]) {
			titleStack.pop()
		}
		while (titleStack.length < r['title'].length-1) {
			titleStack.push(r['title'][titleStack.length]);
			console.log('  '.repeat(titleStack.length) + titleStack[titleStack.length-1]);
		}

		process.stdout.write('  '.repeat(titleStack.length+1));
		let testTitle = r['title'][r['title'].length-1];
		if (r['error']) {
			allPassed = false;
			let error = JSON.parse(r['error']);
			console.log(`${chalk.red('[FAIL]')} ${testTitle}`);
			if (error['stack']) {
				console.log(error['stack']);
			} else {
				console.log(error['message']);
			}
		}
		else {
			console.log(`${chalk.green('✓')} ${testTitle}`)
		}
	}
			
	return allPassed
}

var results = {};
results.promise = new Promise(function(resolve, reject) {
	results.resolve = resolve;
	results.reject = reject;
});
if ('TEST_CHROME' in process.env) {
	(async function() {
		try {
			require('chromedriver');
			let chrome = require('selenium-webdriver/chrome');
			let options = new chrome.Options();
			options.addArguments(`load-extension=${chromeExtensionDir}`);
			if ('BROWSER_EXECUTABLE' in process.env) {
				options.setChromeBinaryPath(process.env['BROWSER_EXECUTABLE']);
			}

			let driver = new selenium.Builder()
				.forBrowser('chrome')
				.setChromeOptions(options)
				.build();
			
			// No API to retrieve extension ID. Hacks, sigh.
			await driver.get("chrome://system/");
			await driver.wait(until.elementLocated({id: 'extensions-value-btn'}), 60*1000);
			let extBtn = await driver.findElement({css: '#extensions-value-btn'});
			await extBtn.click();
			let contentElem = await driver.findElement({css: '#content'});
			let text = await contentElem.getText();
			let extId = text.match(/([^\s]*) : Zotero Connector/)[1];
			
			// We got the extension ID and test URL, let's test
			let testUrl = `chrome-extension://${extId}/test/test.html`;
			await new Promise((resolve) => setTimeout(() => resolve(driver.get(testUrl)), 500));
			await driver.wait(until.elementLocated({id: 'mocha-tests-complete'}), 10*60*1000);
			let testResults = await driver.executeScript('return window.testResults');
			
			if (KEEP_BROWSER_OPEN) {
				return results.resolve(testResults);
			}
			return driver.quit().then(() => results.resolve(testResults));
		} catch (e) {
			results.reject(e);
		}
	})();
}
if ('TEST_FX' in process.env) {
	(async function() {
		try {
			require('geckodriver');

			const firefox = require('selenium-webdriver/firefox');
			var options = new firefox.Options();
			if ('BROWSER_EXECUTABLE' in process.env) {
				options.setBinary(process.env['BROWSER_EXECUTABLE'])
			}
			
			let driver = new selenium.Builder()
				.forBrowser('firefox')
				.setFirefoxOptions(options)
				.build();

			await driver.setContext(firefox.Context.CHROME);
			await driver.executeScript(`
				var prefBranch = Services.prefs.getBranch("");
				prefBranch.setBoolPref('xpinstall.signatures.required', false);
			`);
			await driver.setContext(firefox.Context.CONTENT);

			let uuid = await driver.installAddon('/tmp/zoteroConnector.xpi');
			// Doing some crazy xpath matching since extId cannot be retrieved by API
			// Sigh. This is bound to break eventually
			let extIdXPath = `//dd[text()="${uuid}"]/../following-sibling::div/dd`;
			await driver.get('about:debugging#/runtime/this-firefox');
			await driver.wait(until.elementLocated({xpath: extIdXPath}), 60*1000);
			let elem = await driver.findElement({xpath: extIdXPath});
			let extId = await elem.getText();
			let testUrl = `moz-extension://${extId}/test/test.html#console`;
			await new Promise((resolve) => setTimeout(() => resolve(driver.get(testUrl)), 500));
			
			await driver.wait(until.elementLocated({id: 'mocha-tests-complete'}), 10*60*1000);
			let testResults = await driver.executeScript('return window.testResults');
			if (KEEP_BROWSER_OPEN) {
				return results.resolve(testResults);
			}
			return driver.quit().then(() => results.resolve(testResults));
		} catch (e) {
			results.reject(e);
		}
	}());
}

results.promise.then(function(results) {
	var allPassed = report(results);

	if (!allPassed) {
		process.exit(1)
	}
}).catch(console.error);

