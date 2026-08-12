'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const puppeteer = require('puppeteer');

const devtoolsActivePort = process.argv[2];
const extensionPath = path.resolve(process.argv[3]);
const persistent = Boolean(process.argv[4]);
const [port, webSocketPath] = fs.readFileSync(devtoolsActivePort, 'utf8')
	.trim()
	.split(/\r?\n/);

if (!port || !webSocketPath) {
	throw new Error(`Invalid DevToolsActivePort file: ${devtoolsActivePort}`);
}

console.log('Connecting to Chromium; allow the remote debugging prompt in the browser if shown.');
const connectionTimeout = setTimeout(() => {
	console.error('Could not connect to Chromium within 30 seconds. Allow the remote debugging prompt in the browser.');
	process.exit(1);
}, 30000);

(async () => {
	const browser = await puppeteer.connect({
		browserWSEndpoint: `ws://127.0.0.1:${port}${webSocketPath}`,
		protocolTimeout: 10000,
	});
	clearTimeout(connectionTimeout);

	const reload = async () => {
		const id = await browser.installExtension(extensionPath);
		console.log(`Reloaded Chromium extension ${id} from ${extensionPath}`);
	};

	if (!persistent) {
		try {
			await reload();
		}
		finally {
			await browser.disconnect();
		}
		return;
	}

	// Keep one DevTools connection for the lifetime of watch-chromium. Brave asks for
	// automation permission when a connection is opened, so reconnecting on every build
	// would show the prompt every time.
	const input = readline.createInterface({ input: process.stdin });
	let pendingReload = Promise.resolve();
	input.on('line', () => {
		pendingReload = pendingReload.then(reload).catch((error) => {
			console.error(`Could not reload Chromium extension: ${error.message}`);
		});
	});
	await new Promise(resolve => input.once('close', resolve));
	await pendingReload;
	await browser.disconnect();
})().catch((error) => {
	clearTimeout(connectionTimeout);
	console.error(`Could not reload Chromium extension: ${error.message}`);
	process.exitCode = 1;
});
