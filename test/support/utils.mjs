/**
 * @param func {Function}
 * @params {Object} ... parameters to be passed into the function to be run
 * @returns {Promise} return value of the function
 */
export var background = async function (func, ...args) {
	return worker.evaluate(func, ...args);
};

export var offscreen = async function (func, ...args) {
	return offscreenPage.evaluate(func, ...args);
};

export var Tab = function() {};
Tab.prototype = {
	init: async function (url='http://zotero-static.s3.amazonaws.com/test.html') {
		this.page = await browser.newPage();
		await this.page.goto(url);
		this.tabId = await background(async () => {
			let tabs = await browser.tabs.query({ active: true });
			return tabs[0].id;
		});
		// await this.setupZoteroProxy();
	},
	
	navigate: async function (url) {
		if (this.page == undefined) {
			throw new Error('Must run Tab#init() before Tab#run');
		}
		await this.page.goto(url);
		// await this.setupZoteroProxy();
	},

	runInPage: async function (fn, ...args) {
		return await this.page.evaluate(fn, ...args);
	},

	run: async function(fn, ...args) {
		if (this.page.url().startsWith(extensionURL)) {
			return await this.runInPage(fn, ...args);
		}
		let extensionRealm;
		for (let i = 0; i < 50 && !extensionRealm; i++) {
			for (let realm of this.page.extensionRealms()) {
				let extension = await realm.extension();
				if (extension) {
					extensionRealm = realm;
					break;
				}
			}
			if (!extensionRealm) {
				await delay(100);
			}
		}
		if (!extensionRealm) {
			throw new Error('Extension realm not found');
		}
		return await extensionRealm.evaluate(fn, ...args);
	},
	
	runInFrame: async function(frameUrl, fn, ...args) {
		let frame = await this.page.waitForFrame(frameUrl, { timeout: 500 });
		if (!frame) {
			throw new Error(`Frame with URL ${frameUrl} not found`);
		}
		return await frame.evaluate(fn, ...args);
	},

	close: async function () {
		if (this.page == undefined) {
			throw new Error('Must run Tab#init() before Tab#close');
		}
		await this.page.close();
		delete this.page;
	}
};

export function delay(ms) {	
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function getExtensionURL(path) {
	return `${extensionURL}${path}`;
}

/**
 * Stub selected Connector methods while passing all other calls through.
 * Each method behavior can specify `response`, `returnPayload`, or `error`.
 *
 * @param {Object<string, {response?: *, returnPayload?: boolean, error?: {message: string, status?: number}}>} methods
 * @returns {Promise<Function>} function that restores Connector.callMethod
 */
export async function stubConnectorCallMethod(methods) {
	await background((methods) => {
		let callMethod = Zotero.Connector.callMethod;
		sinon.stub(Zotero.Connector, 'callMethod').callsFake(async function(options, payload, ...args) {
			let method = typeof options === 'string' ? options : options.method;
			let behavior = methods[method];
			if (!behavior) {
				return callMethod.call(this, options, payload, ...args);
			}
			if (behavior.error) {
				throw new Zotero.Connector.CommunicationError(
					behavior.error.message,
					behavior.error.status
				);
			}
			if (behavior.returnPayload) {
				return payload;
			}
			return behavior.response;
		});
	}, methods);
	return () => background(() => Zotero.Connector.callMethod.restore());
}

export async function stubHTTPRequest(requests) {
	await background((requests) => {
		const stubFn = async (method, url, options) => {
			for (const [urlPattern, stubbedResponse] of Object.entries(requests)) {
				if (url.includes(urlPattern)) {
					Zotero.debug(`Stubbing HTTP request to ${url} with response ${JSON.stringify(stubbedResponse)}`);
					let response = {
						response: JSON.stringify(stubbedResponse),
						responseText: JSON.stringify(stubbedResponse),
						responseURL: url,
						responseType: 'text',
						status: 200,
						statusText: 'OK',
						getAllResponseHeaders: () => '',
						getResponseHeader: () => null,
						responseHeaders: ''
					};
					if (options.responseType === 'json') {
						response.response = stubbedResponse;
					}
					return response;
				}
			}
			// Zotero.debug('Not stubbing HTTP request to ' + url);
			return Zotero.HTTP.request.wrappedMethod.apply(Zotero.HTTP, [method, url, options]);
		};
		sinon.stub(Zotero.HTTP, 'request').callsFake(stubFn);
		sinon.stub(Zotero.COHTTP, 'request').callsFake(stubFn);
	}, requests);
	return () => background(() => {
		Zotero.HTTP.request.restore();
		Zotero.COHTTP.request.restore();
	});
}