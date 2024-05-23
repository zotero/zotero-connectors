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
	this.infoRe = /^\s*{[\S\s]*?}\s*?[\r\n]/;
	
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
				await Zotero.Translators.updateTranslator(metadata);
			}
			// else {
			// 	Zotero.debug("Repo: Retrieved code for "+metadata.label+" older than stored metadata; not caching");
			// }
		}
		return code;
	};
	
	/**
	 * Retrieve translator metadata from Zotero Standalone
	 */
	this.getTranslatorMetadataFromZotero = async function() {
		let translatorMetadata = await Zotero.Connector.callMethod("getTranslators", {});
		Zotero.Prefs.set("connector.repo.lastCheck.localTime", Date.now());
		return translatorMetadata;
	}
	
	/**
	 * Retrieve metadata from repository
	 * @param reset {Boolean} When false only retrieves updates since last repo check
	 */
	this.getTranslatorMetadataFromServer = async function(reset=false) {
		var url = ZOTERO_CONFIG.REPOSITORY_URL + "metadata?version=" + Zotero.version + "&last="+
				(reset ? "0" : Zotero.Prefs.get("connector.repo.lastCheck.repoTime"));
		
		xhr = await Zotero.HTTP.request('GET', url);
		var date = xhr.getResponseHeader("Date");
		Zotero.Prefs.set("connector.repo.lastCheck.localTime", Date.now());
		Zotero.Prefs.set("connector.repo.lastCheck.repoTime", Math.floor(Date.parse(date)/1000));
		return JSON.parse(xhr.responseText);
	}
}