/*
	***** BEGIN LICENSE BLOCK *****

	Copyright © 2026 Corporation for Digital Scholarship
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

/**
 * @typedef {Object} TranslateHostOperationOptions
 * @property {String} operationID - ID shared by the content frame and frame manager.
 * @property {Object} document - Serialized document HTML, URL, and optional cookie.
 * @property {Object[]} [translators] - Serialized translator selections.
 * @property {Object} [handlers] - Enabled translate event handlers.
 */

/**
 * @typedef {Object} TranslateHostRecord
 * @property {String} operationID
 * @property {'detect'|'translate'} role
 * @property {Object} tab
 * @property {Number} frameId
 * @property {Zotero.Frame} zoteroFrame
 */

/**
 * Owns disposable translate-host frames. It runs directly in the MV2 background page and in the
 * MV3 offscreen document, while the MV3 service-worker instance forwards operations offscreen.
 */
Zotero.TranslateHostFrameManager = {
	translateHosts: new Map(),

	/**
	 * Proactively initialize the platform-specific manager before content-script messages are handled.
	 */
	async init() {
		if (Zotero.isManifestV3) {
			await Zotero.OffscreenManager.init();
		}
		else {
			browser.tabs.onRemoved.addListener(tabId => this.destroyFramesForTab(tabId));
			setInterval(async () => {
				let tabs = await browser.tabs.query({ status: 'complete', windowType: 'normal' });
				let cleanedUpTabIds = this.cleanup(tabs.map(tab => tab.id));
				if (cleanedUpTabIds.length) {
					Zotero.logError(new Error(`TranslateHostFrameManager: manually cleaned up frames that `
						+ `were kept alive after onRemoved ${JSON.stringify(cleanedUpTabIds)}`));
				}
			}, 15 * 60e3);
		}
	},

	/**
	 * Run translator detection in a new disposable detect frame.
	 * @param {TranslateHostOperationOptions} options
	 * @param {Object} tab
	 * @param {Number} frameId
	 */
	async detect(options, tab, frameId) {
		let translateHost = await this._createFrame({ role: 'detect', options, tab, frameId });
		try {
			return await translateHost.zoteroFrame.sendMessage('TranslateHost.detect');
		}
		finally {
			this.destroyFrame(translateHost.operationID);
		}
	},

	/**
	 * Run translation in a new disposable translate frame.
	 * @param {TranslateHostOperationOptions} options
	 * @param {Object} tab
	 * @param {Number} frameId
	 */
	async translate(options, tab, frameId) {
		let translateHost = await this._createFrame({ role: 'translate', options, tab, frameId });
		try {
			return await translateHost.zoteroFrame.sendMessage('TranslateHost.translate');
		}
		finally {
			this.destroyFrame(translateHost.operationID);
		}
	},

	/**
	 * Translator Tester needs eval() for non-web translator code too.
	 * @param {Object} options
	 * @param {String} options.translatorID
	 * @param {String} options.testType
	 * @param {*} options.input
	 */
	async runNonWeb(options) {
		if (!Zotero.isDebug) {
			throw new Error('Non-web translator tests are only available in debug builds');
		}
		let tab = { id: -1, incognito: false };
		let operationID = Zotero.Utilities.randomString();
		let translateHost = await this._createFrame({
			role: 'translate',
			options: { operationID },
			tab,
			frameId: 0
		});
		try {
			return await translateHost.zoteroFrame.sendMessage('TranslateHost.runNonWeb', [
				options.translatorID,
				options.testType,
				options.input
			]);
		}
		finally {
			this.destroyFrame(operationID);
		}
	},

	/**
	 * Create the frame for translate to run in.
	 * @param {Object} options
	 * @param {'detect'|'translate'} options.role
	 * @param {TranslateHostOperationOptions} options.options
	 * @param {Object} options.tab
	 * @param {Number} options.frameId
	 * @returns {Promise<TranslateHostRecord>}
	 */
	async _createFrame({ role, options, tab, frameId }) {
		let { operationID } = options;
		let initOptions = await this._buildInitOptions(role, options, tab);
		let zoteroFrame = new Zotero.Frame({
			src: browser.runtime.getURL(`translateHost/translateHost.html?role=${role}`),
			sandbox: 'allow-scripts',
			hidden: true
		}, {}, {
			handlerFunctionOverrides: HOST_FUNCTIONS[role],
			overrideTarget: Zotero
		});
		let translateHost = { operationID, role, tab, frameId, zoteroFrame };
		this.translateHosts.set(operationID, translateHost);
		try {
			await zoteroFrame.init();
			this._addHostEventListeners(translateHost);
			await zoteroFrame.sendMessage('TranslateHost.init', [initOptions]);
			// CSP blocks remote navigation, but same-extension navigation and reloads remain possible.
			// Any load after initialization invalidates this single-operation runtime.
			zoteroFrame.frame.onload = () => this.destroyFrame(operationID);
			return translateHost;
		}
		catch (e) {
			this.destroyFrame(operationID);
			throw e;
		}
	},

	/**
	 * Forward translate events to the content script in the page being translated.
	 * @param {TranslateHostRecord} translateHost
	 */
	_addHostEventListeners(translateHost) {
		if (translateHost.role !== 'translate') return;
		for (let event of ['select', 'itemSaving', 'onDebug', 'onError', 'translatorFallback']) {
			translateHost.zoteroFrame.addMessageListener(`TranslateHost.${event}`, (...payload) => {
				return Zotero.Messaging.sendMessage(
					`RemoteTranslate.${event}`,
					[translateHost.operationID, ...payload],
					translateHost.tab,
					translateHost.frameId
				);
			});
		}
	},

	/**
	 * Build the options passed into a new translate host, limiting its available state and APIs.
	 * @param {'detect'|'translate'} role
	 * @param {TranslateHostOperationOptions} options
	 * @param {Object} tab
	 * @returns {Promise<Object>}
	 */
	async _buildInitOptions(role, options, tab) {
		let [version, isIncognito, prefs, dateFormats] = await Promise.all([
			Zotero.getVersion(),
			Zotero.Connector_Browser.isIncognito(tab),
			this._getTranslatorPrefs(),
			this._getDateFormats()
		]);
		return {
			role,
			document: options.document,
			translators: options.translators,
			handlers: options.handlers || {},
			version,
			isIncognito,
			prefs,
			dateFormats
		};
	},

	/**
	 * @returns {Promise<Object>} Preferences required by the translation runtime.
	 */
	async _getTranslatorPrefs() {
		// Prefs has no namespace getter. Fetch all prefs, but pass only the fixed prefs used by
		// translation and the dynamically named translators.* and debug.* namespaces into the host.
		let allPrefs = await Zotero.Prefs.getAll();
		let prefs = {};
		let allowed = new Set([
			'downloadAssociatedFiles',
			'automaticSnapshots',
			'reportTranslationFailure',
			'capitalizeTitles'
		]);
		for (let [name, value] of Object.entries(allPrefs)) {
			if (allowed.has(name) || name.startsWith('translators.') || name.startsWith('debug.')) {
				prefs[name] = value;
			}
		}
		return prefs;
	},

	/**
	 * @returns {Promise<Object>} Cached date-format data for Zotero.Date initialization.
	 */
	async _getDateFormats() {
		if (!this._dateFormatsPromise) {
			this._dateFormatsPromise = (async () => {
				let url = await Zotero.getExtensionURL('utilities/resource/dateFormats.json');
				let xhr = await Zotero.HTTP.request('GET', url, { responseType: 'json' });
				return xhr.response;
			})();
		}
		return this._dateFormatsPromise;
	},

	destroyFrame(operationID) {
		let translateHost = this.translateHosts.get(operationID);
		if (!translateHost) return;
		this.translateHosts.delete(operationID);
		translateHost.zoteroFrame.remove();
	},

	destroyFramesForTab(tabId) {
		for (let [operationID, translateHost] of this.translateHosts) {
			if (translateHost.tab.id === tabId) this.destroyFrame(operationID);
		}
	},

	/**
	 * Ran periodically to cleanup dead tab translate hosts.
	 * @param {Number[]} liveTabIds
	 * @returns {Number[]} Removed tab IDs.
	 */
	cleanup(liveTabIds) {
		let live = new Set(liveTabIds);
		let removed = [];
		for (let [operationID, translateHost] of this.translateHosts) {
			if (translateHost.tab.id >= 0 && !live.has(translateHost.tab.id)) {
				removed.push(translateHost.tab.id);
				this.destroyFrame(operationID);
			}
		}
		return removed;
	}
};
