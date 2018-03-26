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

Zotero.Extension = window.Zotero.Extension || {};

Zotero.Extension.ScriptInjection = {

	_translationScriptList: [
		/*INJECT SCRIPTS*/
	],
	INJECTION_TIMEOUT: 10000,
	/**
	 * Checks whether translation scripts are already injected into a frame and if not - injects
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	injectTranslationScripts: async function(tab, frameId=0) {
		// Prevent triggering multiple times
		let key = tab.id+'-'+frameId;
		let deferred = this.injectTranslationScripts[key];
		if (deferred) {
			Zotero.debug(`Translation Inject: Script injection already in progress for ${key}`);
			return deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		this.injectTranslationScripts[key] = deferred;
				
		deferred.promise.catch(function(e) {
			Zotero.debug(`Translation Inject: Script injection rejected ${key}`);
			Zotero.debug(e.message);
		}).then(function() {
			delete Zotero.Extension.ScriptInjection.injectTranslationScripts[key];
		});
		
		Zotero.Messaging.sendMessage('ping', null, tab, frameId).then(function(response) {
			if (response && frameId == 0) return deferred.resolve();
			Zotero.debug(`Injecting translation scripts into ${frameId} ${tab.url}`);
			return Zotero.Connector_Browser.injectScripts(
				Zotero.Extension.ScriptInjection._translationScriptList, tab, frameId)
			.then(deferred.resolve).catch(deferred.reject);
		});
		return deferred.promise;
	},

	/**
	 * Injects custom scripts
	 * 
	 * @param scripts {Object[]} array of scripts to inject
	 * @param tab {Object}
	 * @param [frameId=0] {Number] Defaults to top frame
	 * @returns {Promise} A promise that resolves when all scripts have been injected
	 */
	injectScripts: async function(scripts, tab, frameId=0) {
		function* injectScripts() {
			if (! Array.isArray(scripts)) scripts = [scripts];
			// Make sure we're not changing the original list
			scripts = Array.from(scripts);
			Zotero.debug(`Inject: Injecting scripts into ${frameId} - ${tab.url} : ${scripts.join(', ')}`);
			
			for (let script of scripts) {
				// Firefox returns an error for unstructured data being returned from scripts
				// We are forced to catch these, even though when sometimes they may be legit errors
				yield browser.tabs.executeScript(tab.id, {file: script, frameId, runAt: 'document_end'})
					.catch(() => undefined);
			}
			
			// Send a ready message to confirm successful injection
			let readyMsg = `ready${Date.now()}`;
			yield browser.tabs.executeScript(tab.id, {
				code: `browser.runtime.onMessage.addListener(function awaitReady(request) {
					if (request == '${readyMsg}') {
						browser.runtime.onMessage.removeListener(awaitReady);
						return Promise.resolve(true);
					}
				})`,
				frameId,
				runAt: 'document_end'
			});
			
			while (true) {
				try {
					var response = yield browser.tabs.sendMessage(tab.id, readyMsg, {frameId: frameId});
				} catch (e) {}
				if (!response) {
					yield Zotero.Promise.delay(100);
				} else {
					Zotero.debug(`Inject: Complete ${frameId} - ${tab.url}`);
					return true;
				}
			}		
		}
		
		var timedOut = Zotero.Promise.defer();
		let timeout = setTimeout(function() {
			timedOut.reject(new Error (`Inject: Timed out ${frameId} - ${tab.url} after ${Zotero.Extension.ScriptInjection.INJECTION_TIMEOUT}ms`))
		}, Zotero.Extension.ScriptInjection.INJECTION_TIMEOUT);
		
		// Prevent triggering multiple times
		let deferred = Zotero.Connector_Browser._tabInfo[tab.id].injections[frameId];
		if (deferred) {
			Zotero.debug(`Inject: Script injection already in progress for ${frameId} - ${tab.url}`);
			await deferred.promise;
		}
		deferred = Zotero.Promise.defer();
		Zotero.Connector_Browser._tabInfo[tab.id].injections[frameId] = deferred;
		
		function tabRemovedListener(tabID) {
			if (tabID != tab.id) return;
			deferred.reject(new Error(`Inject: Tab removed mid-injection into ${frameId} - ${tab.url}`))
		}
		browser.tabs.onRemoved.addListener(tabRemovedListener);

		
		// This is a bit complex, but we need to cut off script injection as soon as we notice an
		// interruption condition, such as a timeout or url change, otherwise we get partial injections
		try {
			var iter = injectScripts();
			var val = iter.next();
			while (true) {
				if (val.done) {
					return val.value;
				}
				if (val.value.then) {
					// Will either throw from the first two, or return from the third one
					let nextVal = await Promise.race([ timedOut.promise, deferred.promise, val.value]);
					val = iter.next(nextVal);
				} else {
					val = iter.next(val.value);
				}
			}
		} finally {
			browser.tabs.onRemoved.removeListener(tabRemovedListener);
			deferred.resolve();
			delete Zotero.Connector_Browser._tabInfo[tab.id].injections[frameId];
			clearTimeout(timeout);
		}
	}
};
