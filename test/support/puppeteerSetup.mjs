/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2025 Corporation for Digital Scholarship
					Vienna, Virginia, USA
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

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { assert } from 'chai';

globalThis.assert = assert;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const EXTENSION_PATH = path.resolve(PROJECT_ROOT, 'build/manifestv3');
const SEEDED_TRANSLATOR_IDS = [
	'05d07af9-105a-4572-99f6-a8e231c0daef', // DOI
	'c159dcfe-8a53-4301-a499-30f6549c340d', // Embedded Metadata
	'951c027d-74ac-47d4-a107-9c3069ab7b48' // COinS
];

async function getTranslatorSeedData(translatorIDs) {
	const translatorDir = path.join(PROJECT_ROOT, 'src/zotero/translators');
	const translatorIDSet = new Set(translatorIDs);
	const translatorMetadata = [];
	const translatorCode = {};
	let files;
	try {
		files = await fs.readdir(translatorDir);
	}
	catch (e) {
		throw new Error(`Could not read translators directory at ${translatorDir}: ${e.message}`);
	}
	
	for (let file of files) {
		if (!file.endsWith('.js')) continue;
		let code = await fs.readFile(path.join(translatorDir, file), 'utf8');
		let metadataMatch = /^\s*{[\S\s]*?}\s*?[\r\n]/.exec(code);
		if (!metadataMatch) continue;
		let metadata = JSON.parse(metadataMatch[0]);
		if (!translatorIDSet.has(metadata.translatorID)) continue;
		translatorMetadata.push(metadata);
		translatorCode[metadata.translatorID] = code;
	}
	
	let missing = translatorIDs.filter(id => !translatorCode[id]);
	if (missing.length) {
		throw new Error(`Could not find translator source code for ${missing.join(', ')} in ${translatorDir}`);
	}
	
	return { translatorMetadata, translatorCode };
}

async function seedTranslatorPrefs(worker) {
	let seedData;
	try {
		seedData = await getTranslatorSeedData(SEEDED_TRANSLATOR_IDS);
	}
	catch (e) {
		console.warn(`Skipping translator pref seeding: ${e.message}`);
		return;
	}
	await worker.evaluate(async ({ translatorMetadata, translatorCode }) => {
		let existingMetadata = Zotero.Prefs.get('translatorMetadata');
		if (!Array.isArray(existingMetadata)) existingMetadata = [];
		let metadataByID = new Map(existingMetadata.map(metadata => [metadata.translatorID, metadata]));
		for (let metadata of translatorMetadata) {
			metadataByID.set(metadata.translatorID, metadata);
		}
		await Zotero.Prefs.set('translatorMetadata', [...metadataByID.values()]);
		for (let [translatorID, code] of Object.entries(translatorCode)) {
			await Zotero.Prefs.set(Zotero.Translators.PREFS_TRANSLATOR_CODE_PREFIX + translatorID, code);
		}
		
		// Zotero.init() starts Zotero.Translators.init() before tests get a chance to seed prefs,
		// so update the in-memory translator cache directly.
		for (let metadata of translatorMetadata) {
			let translator = await Zotero.Translators.getWithoutCode(metadata.translatorID);
			if (translator) {
				translator.init(metadata);
			}
			else {
				Zotero.Translators._loadTranslator(new Zotero.Translator(metadata));
			}
		}
	}, seedData);
}

export async function mochaGlobalSetup() {
	console.log('Starting Puppeteer...');
	
	// Read environment variables passed from runtests.sh
	const headlessMode = process.env.HEADLESS === 'true' ? 'new' : false;
	
	const launchOptions = {
		headless: headlessMode,
		args: [
			`--disable-extensions-except=${EXTENSION_PATH}`,
			`--load-extension=${EXTENSION_PATH}`,
		],
	};
	
	const browser = await puppeteer.launch(launchOptions);
	
	// Store the browser instance globally so tests can access it
	globalThis.browser = browser;

	console.log('Finding background service worker...');


	
	// Find the background service worker
	const workerTarget = await browser.waitForTarget(
		(target) => {
			return target.type() === 'service_worker' &&
				target.url().endsWith('background-worker.js');
		},
		{ timeout: 5000 }
	);

	if (!workerTarget) {
		throw new Error('Could not find background service worker.');
	}

	const offscreenPageTarget = await browser.waitForTarget(
		target => target.url().endsWith('offscreen.html'),
		{ timeout: 5000 }
	);

	if (!offscreenPageTarget) {
		throw new Error('Could not find offscreen page.');
	}

	const worker = await workerTarget.worker();
	globalThis.worker = worker;

	globalThis.offscreenPage = await offscreenPageTarget.asPage();

	// Forward worker console logs to Node console if DEBUG=true
	if (process.env.DEBUG === 'true') {
		console.log('DEBUG mode: Attaching to worker console logs via CDP...');
		try {
			const session = await workerTarget.createCDPSession();
			await session.send('Runtime.enable');
			session.on('Runtime.consoleAPICalled', (event) => {
				// Attempt to format arguments similarly to how console.log does
				const args = event.args.map(arg => {
					if (arg.value !== undefined) return arg.value;
					if (arg.unserializableValue) return arg.unserializableValue;
					if (arg.objectId) return `[${arg.type}]`; // Placeholder for objects
					return `[Unknown ${arg.type}]`;
				});
				const logType = event.type; // e.g., log, debug, info, error, warning
				console.log(`${logType}`, ...args);
			});
			globalThis.workerCDPSession = session; // Store session to detach later
			console.log('Attached to worker console via CDP.');
		} catch (error) {
			console.error('Failed to attach CDP session to worker:', error);
		}
	}

	await worker.evaluate(() => Zotero.initDeferred.promise);
	await seedTranslatorPrefs(worker);

	const workerURL = workerTarget.url();
	globalThis.extensionURL = workerURL.substring(0, workerURL.indexOf('background-worker.js'));

	console.log('Puppeteer started, extension loaded, and background worker found.');
}

export async function mochaGlobalTeardown() {
	console.log('Closing Puppeteer...');
	
	// Detach CDP session if it exists
	if (globalThis.workerCDPSession) {
		try {
			await globalThis.workerCDPSession.detach();
			console.log('Detached worker CDP session.');
		} catch (error) {
			// Ignore errors if the target is already closed
			if (!error.message.includes('Target closed')) {
				console.error('Error detaching worker CDP session:', error);
			}
		}
	}
	
	// Don't close the browser if NO_QUIT=true (set by -c flag)
	const noQuit = process.env.NO_QUIT === 'true';
	
	if (globalThis.browser && !noQuit) {
		await globalThis.browser.close();
		console.log('Puppeteer closed.');
	}
	else if (noQuit) {
		console.log('Skipping browser close due to NO_QUIT=true.');
	}
} 