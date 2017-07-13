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
const extensionDir = path.join(rootDir, 'build', 'browserExt');


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
	require('chromedriver');
	let caps = selenium.Capabilities.chrome();

	caps.set('chromeOptions', {'args': [`load-extension=${extensionDir}`]});
	let driver = new selenium.Builder()
		.withCapabilities(caps)
		.build();
	
	driver.get("chrome://extensions/").then(function() {
		driver.switchTo().frame(driver.findElement({name: 'extensions'}));
		return driver.findElements({className: 'extension-list-item-wrapper'});
	}).then(function(extIdElem) {
		return extIdElem[1].getAttribute('id');
	}).then(function(extId) {
		let testUrl = `chrome-extension://${extId}/test/test.html`;
		return new Promise((resolve) => setTimeout(() => resolve(driver.get(testUrl)), 500));
	}).then(function() {
		return driver.wait(until.elementLocated({id: 'mocha-tests-complete'}), 10000);
	}).then(function() {
		return driver.executeScript('return window.testResults');
	}).catch(results.reject).then(function(testResults) {
		return driver.quit().then(() => results.resolve(testResults));
	});
}
if ('TEST_FX' in process.env) {
	require('geckodriver');

	// Building the extension proxy file
	// https://developer.mozilla.org/en-US/Add-ons/Setting_up_extension_development_environment#Firefox_extension_proxy_file
	// currently the only functional way of installing webexts
	try {
		var profileDir = fs.mkdtempSync('/tmp/fx-profile');
	} catch (e) {
		if (e.code !== 'EEXIST') throw e
	}
	fs.mkdirSync(path.join(profileDir, 'extensions'));
	let proxyFile = path.join(profileDir, 'extensions/zotero@chnm.gmu.edu');
	fs.writeFileSync(proxyFile, extensionDir);
	const firefox = require('selenium-webdriver/firefox');
	var profile = new firefox.Profile(profileDir);
	var options = new firefox.Options();
	options.setProfile(profile);
	
	let driver = new selenium.Builder()
		.forBrowser('firefox')
		.setFirefoxOptions(options)
		.build();
	
	driver.get("about:support").then(function() {
		// Switch to chrome context to get the UUIDs pref
		driver.setContext(firefox.Context.CHROME);
		return driver.executeScript(`
			var prefBranch = Services.prefs.getBranch("");
			if (!prefBranch.prefHasUserValue('extensions.webextensions.uuids')) return;
			return ''+prefBranch.getComplexValue('extensions.webextensions.uuids', Components.interfaces.nsISupportsString);
		`);
	}).then(function(uuids) {
		driver.setContext(firefox.Context.CONTENT);
		if (!uuids) {
			console.log('Failed to retrieve the extension UUID');
			throw new Error('Failed to retrieve the extension UUID');
		}
		let extId = JSON.parse(uuids)['zotero@chnm.gmu.edu'];
		let testUrl = `moz-extension://${extId}/test/test.html#console`;
		// extUUID retrieved, continue in web content
		return new Promise((resolve) => setTimeout(() => resolve(driver.get(testUrl)), 500));
	}).then(function() {
		return driver.wait(until.elementLocated({id: 'mocha-tests-complete'}), 10*60*1000);
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

