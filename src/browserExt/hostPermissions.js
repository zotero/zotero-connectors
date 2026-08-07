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

Zotero.HostPermissions = new function() {
	const LOCALHOST_DOMAIN = '127.0.0.1';
	const REPOSITORY_DOMAIN = 'repo.zotero.org';
	const DOMAIN_CONFIG = {
		[LOCALHOST_DOMAIN]: {
			origin: 'http://127.0.0.1/*',
			message: 'permissions_siteAccess_message_localhost_required'
		},
		[REPOSITORY_DOMAIN]: {
			origin: 'https://repo.zotero.org/*',
			message: 'permissions_siteAccess_message_repo_required'
		},
		'api.zotero.org': {
			origin: 'https://api.zotero.org/*',
			message: 'permissions_siteAccess_message_api_required'
		}
	};

	this._permissionsPromptDisplayed = false;
	this._localhostPromptDisplayed = false;
	this._repoPromptDisplayed = false;
	// Set when a request was blocked with localhost access still missing, meaning Safari is
	// treating the access as denied and won't show its permission dialog
	this.localhostRequestBlocked = false;
	// When the user last granted a host permission, e.g., in Safari's permission dialog
	this.permissionsGrantedAt = 0;

	let promptQueues = new Map();
	let knownPermissions = null;

	async function hasPermission(domain) {
		const config = DOMAIN_CONFIG[domain];
		if (!config) throw new Error(`Unknown host-permission domain ${domain}`);
		return browser.permissions.contains({ origins: [config.origin] });
	}
	this.hasPermission = hasPermission;

	// Safari doesn't notify the extension of grants made in its permission dialog or Safari
	// Settings, so track the permission state and record when a permission appears that the
	// last seen state lacked. Refreshing on an interval also records revocations, so a
	// revoked-and-regranted permission is still detected as a grant.
	async function updateTrackedPermissions() {
		const current = {
			localhost: await hasPermission(LOCALHOST_DOMAIN),
			allHosts: await browser.permissions.contains({ origins: ["https://*/*"] })
		};
		if (knownPermissions
				&& ((current.localhost && !knownPermissions.localhost)
				|| (current.allHosts && !knownPermissions.allHosts))) {
			Zotero.HostPermissions.permissionsGrantedAt = Date.now();
			if (current.localhost) {
				Zotero.HostPermissions.localhostRequestBlocked = false;
			}
		}
		knownPermissions = current;
	}
	if (Zotero.isSafari) {
		updateTrackedPermissions();
		setInterval(updateTrackedPermissions, 15e3);
	}

	// Detect grants made via a browser event, where the browser supports it
	browser.permissions.onAdded?.addListener(() => {
		this.permissionsGrantedAt = Date.now();
	});

	// Tell the content script re-injection guard whether a grant explains the repeated injection
	Zotero.Messaging.addMessageListener('reinjectGuard.shouldReload', async () => {
		if (Date.now() - this.permissionsGrantedAt < 60e3) return true;
		// The interval may not have run since the grant, so check directly
		await updateTrackedPermissions();
		return Date.now() - this.permissionsGrantedAt < 60e3;
	});

	/**
	 * Display a Safari host-permission prompt. All prompts end with instructions for enabling the
	 * requested access.
	 * @param {Object} options
	 * @param {String[]} [options.domains] - Specific required domains
	 * @param {Boolean} [options.recommendAllHosts] - Recommend access to all websites
	 * @param {Boolean} [options.nativePromptToFollow] - A request that can trigger Safari's own
	 *     permission dialog for the domains follows this prompt, so point to that dialog instead
	 *     of Safari Settings
	 * @param {Object} tab - The current tab object
	 * @returns {Promise<Boolean>} - Whether a prompt was displayed
	 */
	this.prompt = async function(options={}, tab) {
		if (!Zotero.isSafari) return false;

		// Serialize prompts so concurrent callers cannot display overlapping modals in the same
		// tab, and prevent a modal left open in one tab from blocking prompts in other tabs.
		// Permissions are checked when a queued prompt runs, so access granted during an earlier
		// prompt is respected.
		let key = tab?.id ?? null;
		let queue = promptQueues.get(key) || Promise.resolve();
		let promise = queue.then(() => showPrompt(options, tab));
		let tail = promise.then(() => {}, () => {});
		promptQueues.set(key, tail);
		tail.then(() => {
			if (promptQueues.get(key) === tail) {
				promptQueues.delete(key);
			}
		});
		return promise;
	}

	async function showPrompt({domains=[], recommendAllHosts=false, nativePromptToFollow=false}={}, tab) {
		// Resolve all requested permissions first so the user sees one combined prompt containing only
		// the access that is actually missing.
		const permissionChecks = domains.map(domain => hasPermission(domain));
		if (recommendAllHosts) {
			permissionChecks.push(browser.permissions.contains({ origins: ["https://*/*"] }));
		}
		const results = await Promise.all(permissionChecks);
		const missingDomains = domains.filter((domain, index) => !results[index]);
		const missingAllHosts = recommendAllHosts && !results[results.length - 1];
		if (!missingDomains.length && !missingAllHosts) return false;

		// Explanations of the missing access come first. Domains that Safari's own dialog is about
		// to cover get a pointer to that dialog; everything else gets Safari Settings
		// instructions.
		let message = missingDomains
			.map(domain => Zotero.getString(DOMAIN_CONFIG[domain].message))
			.join('');
		let connectorName = Zotero.getString('appConnector', ZOTERO_CONFIG.CLIENT_NAME);
		// e.g., "<b>repo.zotero.org</b> and <b>api.zotero.org</b>", with a locale-appropriate
		// conjunction
		let domainList = new Intl.ListFormat(browser.i18n.getUILanguage(), { type: 'conjunction' })
			.format(missingDomains.map(domain => `<b>${domain}</b>`));
		if (nativePromptToFollow && missingDomains.length) {
			message += Zotero.getString("permissions_siteAccess_message_nativePrompt_safari");
			if (missingAllHosts) {
				// Safari's dialog can also grant all-websites access via its "Remember for other
				// websites" checkbox
				message += Zotero.getString("permissions_siteAccess_message_allHosts_nativePrompt_safari");
			}
		}
		else if (missingDomains.length && missingAllHosts) {
			message += Zotero.getString("permissions_siteAccess_message_safari_functionality");
			message += Zotero.getString(
				"permissions_siteAccess_message_domains_allHosts_safari",
				[connectorName, domainList]
			);
		}
		else if (missingDomains.length) {
			message += Zotero.getString(
				missingDomains.length > 1
					? "permissions_siteAccess_message_domains_safari"
					: "permissions_siteAccess_message_domain_safari",
				[connectorName, domainList]
			);
		}
		else {
			message += Zotero.getString("permissions_siteAccess_message_safari_functionality");
			message += Zotero.getString("permissions_siteAccess_message_safari", connectorName);
		}

		await Zotero.Messaging.sendMessage('confirm', {
			title: Zotero.getString("permissions_siteAccess_title"),
			button2Text: "",
			message
		}, tab);
		return true;
	}

	/**
	 * Check initial permissions when content scripts first gain access to a page.
	 * @param {Object} tab - The current tab object
	 */
	this.onPageLoad = async function(tab) {
		if (!Zotero.isSafari || this._permissionsPromptDisplayed) return;
		this._permissionsPromptDisplayed = true;
		let markLocalhostPromptShown = false;
		let markRepoPromptShown = false;

		try {
			const hasLocalhostPermission = await hasPermission(LOCALHOST_DOMAIN);
			const showLocalhostPrompt = !hasLocalhostPermission && !this._localhostPromptDisplayed;

			if (showLocalhostPrompt) {
				this._localhostPromptDisplayed = true;
				markLocalhostPromptShown = true;
			}
			// Prompt for localhost access and also recommend all hosts. The ping below can trigger
			// Safari's own permission dialog for localhost.
			await this.prompt({
				domains: showLocalhostPrompt ? [LOCALHOST_DOMAIN] : [],
				recommendAllHosts: true,
				nativePromptToFollow: showLocalhostPrompt
			}, tab);

			let localhostAllowed = hasLocalhostPermission;
			let zoteroOnline = null;
			if (showLocalhostPrompt) {
				// Trigger Safari's native localhost permission prompt after the explanation.
				try {
					await Zotero.Connector.ping({}, {
						active: true,
						permissionPromptShown: true
					}, tab);
					zoteroOnline = true;
				}
				catch (e) {
					zoteroOnline = false;
				}
				// The user may have granted access in Safari's native prompt, so don't rely on the value
				// captured before the request.
				localhostAllowed = await hasPermission(LOCALHOST_DOMAIN);
			}
			else if (localhostAllowed) {
				zoteroOnline = await Zotero.Connector.checkIsOnline();
			}

			// Only fall back to the repository permission when localhost access exists and the ping proves
			// that Zotero itself is offline. A blocked localhost request cannot establish that.
			if (localhostAllowed && zoteroOnline === false && !this._repoPromptDisplayed) {
				this._repoPromptDisplayed = true;
				markRepoPromptShown = true;
				// Prompt that we need access to repo.zotero.org for translators when zotero is offline.
				await this.prompt({domains: [REPOSITORY_DOMAIN]}, tab);
			}
		}
		catch (e) {
			// If displaying a prompt failed, roll back only the markers written during this attempt so a
			// later page load can retry without disturbing successful prompts from earlier in the session.
			if (markLocalhostPromptShown) this._localhostPromptDisplayed = false;
			if (markRepoPromptShown) this._repoPromptDisplayed = false;
			this._permissionsPromptDisplayed = false;
			Zotero.debug('Error checking host permissions: ' + e.message);
		}
	}

	/**
	 * Check Chromium's all-host permission before an explicit Connector action.
	 * @param {Object} tab - The current tab object
	 * @returns {Promise<Boolean>} - Whether the action should continue
	 */
	this.checkChromiumActionPermissions = async function(tab) {
		if (!Zotero.isChromium) return true;

		try {
			const hasPermissions = await browser.permissions.contains({
				origins: ["https://*/*"]
			});
			if (hasPermissions) return true;

			const result = await Zotero.Messaging.sendMessage('confirm', {
				title: Zotero.getString("permissions_siteAccess_title"),
				button1Text: Zotero.getString("permissions_siteAccess_openPreferences"),
				button2Text: Zotero.getString("general_cancel"),
				button3Text: Zotero.getString("general_continueAnyway"),
				message: Zotero.getString("permissions_siteAccess_message_intro")
					+ Zotero.getString("permissions_siteAccess_message")
			}, tab);
			if (result?.button === 1) {
				browser.tabs.create({
					url: `about:extensions/?id=${browser.runtime.id}`
				});
			}
			return result?.button === 3;
		}
		catch (e) {
			Zotero.debug('Error checking Chromium permissions: ' + e.message);
			return true;
		}
	}
}
