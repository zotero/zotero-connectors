/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2011 Center for History and New Media
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
 * Intended behavior as follows:
 * 1. Check for translator updates every REPOSITORY_CHECK_INTERVAL (24hrs) starting with
 *    Zotero and cascading to the Zotero Repo
 * 2. When translators retrieved from Zotero we get the full up-to-date translator metadata
 * 3. When translators retrieved from the Zotero Repo we only fetch the diff between the last time
 *    we checked the Repo and now
 * 4. Can override to fetch all metadata from Zotero Repo if needed
 */
Zotero.Repo = new function() {
	var _timeoutID;
	this.infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	
	/**
	 * Try to retrieve translator metadata from Zotero Standalone and initialize repository check
	 * timer
	 */
	this.init = new function() {
		var promise;
		return function() {
			if (promise) return promise;
			let promiseInternal = promise = new Promise(async (resolve, reject) => {
				try {
					await this.update();
					resolve();
				} catch (e) {
					reject(e);
				}
			});
			
			promise = null;
			return promiseInternal;
		}
	};
	
	/**
	 * Update translator metadata
	 * 
	 * Either called by scheduled code to update metadata every REPOSITORY_CHECK_INTERVAL (24hrs) or
	 * from the Preferences. Reset will be true if called from preferences and should force fetch from
	 * Repo and ensure that all translator metadata is up to date.
	 * 
	 * If a browser is closed and reopened then Repo will not be checked unless 24hrs have passed
	 * since last check.
	 * 
	 * @param reset {Boolean} Fetches all metadata from repo instead of just the diff since last checked
	 */
	this.update = async function(reset) {
		// get the time
		let nextCascadeToRepo = Zotero.Prefs.get("connector.repo.lastCheck.localTime")
			+ZOTERO_CONFIG.REPOSITORY_CHECK_INTERVAL*1000;
		let now = Date.now();
		let repoCheckIntervalExpired = nextCascadeToRepo <= now;

		let translatorMetadata;
		let isFromStandalone = false;
		try {
			translatorMetadata = await this._updateFromStandalone();
			isFromStandalone = true;
		}
		catch (e) {
			Zotero.debug('Failed to retrieve translators from Zotero Standalone');
			if (!repoCheckIntervalExpired && !reset) {
				Zotero.debug('Local repo checked recently, not cascading');
			}
			else {
				try {
					translatorMetadata = await this._updateFromRepo(reset);
				}
				catch (e) {
					Zotero.logError('Failed to retrieve translators from Zotero Repo ' + e);
				}	
			}
		}
		
		if (translatorMetadata) {
			await Zotero.Translators.update(translatorMetadata, reset || isFromStandalone);
		}
		
		if (_timeoutID) clearTimeout(_timeoutID);
		let nextCheckIn;
		if (translatorMetadata) {
			// We got translator metadata so schedule a normal check in 24hrs
			nextCheckIn = (ZOTERO_CONFIG.REPOSITORY_CHECK_INTERVAL * 1000) + 2000;
		}
		else if (repoCheckIntervalExpired || reset) {
			// We failed to get metadata and repo check interval expired or this was a
			// forced reset, so schedule a check soon (in 1hr) in hopes repo comes back alive
			nextCheckIn = ZOTERO_CONFIG.REPOSITORY_RETRY_INTERVAL * 1000;
		}
		else {
			// We failed to get metadata but this was neither a forced reset nor a scheduled check
			// which means probably the user just restarted their browser,
			// so we schedule the next check when the cascadeToRepo time is up
			nextCheckIn = now - nextCascadeToRepo + 2000;
		}
		_timeoutID = setTimeout(this.update.bind(this, [reset]), nextCheckIn);
		Zotero.debug(`Repo: Next check in ${nextCheckIn/1000}s`);
	};
	
	/**
	 * Get translator code from repository
	 * @param {String} translatorID ID of the translator to retrieve code for
	 * @param {Boolean} debugMode used in translator tester to prevent fetching from repo
	 */
	this.getTranslatorCode = async function (translatorID, debugMode) {
		var translator = await Zotero.Translators.getWithoutCode(translatorID);
		var code;
		
		// try standalone
		try {
			code = await Zotero.Connector.callMethod("getTranslatorCode", { translatorID: translatorID })
		}
		catch (e) {}
		
		// Don't fetch from repo in debug mode
		if (!code && !debugMode) {
			// then try repo
			const url = `${ZOTERO_CONFIG.REPOSITORY_URL}code/${translatorID}?version=${Zotero.version}`;
			try {
				let xhr = await Zotero.HTTP.request("GET", url);
				code = xhr.responseText;
			}
			catch (e) {}
		}
		
		if (!code) {
			throw new Error(`Failed to fetch code for translator ${translator.label}`)
		}
		
		var m = Zotero.Repo.infoRe.exec(code);
		if (!m) {
			throw new Error("Invalid or missing translator metadata JSON object for " + translator.label);
		}

		try {
			var metadata = JSON.parse(m[0]);
		} catch(e) {
			throw new Error("Invalid or missing translator metadata JSON object for " + translator.label);
		}

		if(metadata.lastUpdated !== translator.lastUpdated) {
			if (Zotero.Date.sqlToDate(metadata.lastUpdated) > Zotero.Date.sqlToDate(translator.lastUpdated)) {
				Zotero.debug("Repo: Retrieved code for "+metadata.label+" newer than stored metadata; updating");
				await Zotero.Translators.update([metadata]);
			} else {
				Zotero.debug("Repo: Retrieved code for "+metadata.label+" older than stored metadata; not caching");
			}
		}
		return code;
	};
	
	/**
	 * Retrieve translator metadata from Zotero Standalone
	 */
	this._updateFromStandalone = async function() {
		let translatorMetadata = await Zotero.Connector.callMethod("getTranslators", {});
		Zotero.Prefs.set("connector.repo.lastCheck.localTime", Date.now());
		return translatorMetadata;
		
	}
	
	/**
	 * Retrieve metadata from repository
	 */
	this._updateFromRepo = async function(reset) {
		var url = ZOTERO_CONFIG.REPOSITORY_URL + "metadata?version=" + Zotero.version + "&last="+
				(reset ? "0" : Zotero.Prefs.get("connector.repo.lastCheck.repoTime"));
		
		xhr = await Zotero.HTTP.request('GET', url);
		var date = xhr.getResponseHeader("Date");
		Zotero.Prefs.set("connector.repo.lastCheck.localTime", Date.now());
		Zotero.Prefs.set("connector.repo.lastCheck.repoTime", Math.floor(Date.parse(date)/1000));
		return JSON.parse(xhr.responseText);
	}
}