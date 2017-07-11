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

const path = require('path');
const process = require('process');
const selenium = require('selenium-webdriver');
const until = require('selenium-webdriver/lib/until');
const chalk = require('chalk');

const scriptDir = __dirname;
const rootDir = path.join(scriptDir, '../..');


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
if (process.env['TEST_CHROME'] == 1) {
	require('chromedriver');
	let chromeDriver = path.join(rootDir, 'webdrivers', 'chromedriver');
	// process.env['webdriver.chrome.driver'] = chrome_driver

	let caps = selenium.Capabilities.chrome();

	caps.set('chromeOptions', {'args': [`load-extension=${path.join(rootDir, 'build', 'browserExt')}`]});
	caps.set('binary', chromeDriver);
	let driver = new selenium.Builder()
		.withCapabilities(caps)
		.build();
	
	driver.get("chrome://extensions/").then(function() {
		driver.switchTo().frame(driver.findElement({name: 'extensions'}));
		return driver.findElements({className: 'extension-list-item-wrapper'});
	}).then(function(extIdElem) {
		return extIdElem[1].getAttribute('id');
	}).then(function(extId) {
		let testUrl = `chrome-extension://${extId}/test/test.html#console`;
		return driver.get(testUrl);
	}).then(function() {
		return driver.wait(until.elementLocated({id: 'mocha-tests-complete'}), 10000);
	}).then(function() {
		return driver.executeScript('return window.testResults');
	}).catch(results.reject).then(function(testResults) {
		return driver.quit().then(() => results.resolve(testResults));
	});
}

results.promise.then(function(results) {
	var allPassed = report(results);

	if (!allPassed) {
		process.exit(1)
	}
}).catch(console.error);

