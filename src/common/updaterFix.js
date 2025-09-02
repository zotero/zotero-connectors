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

Zotero.UpdaterFix = {
	updaterFixCommandIssued: false,
	affectedVersions: new Set(["7.0.16"]),
	
	onZoteroStateChange: async (version) => {
		if (!version) {
			this.updaterFixCommandIssued = false;
			return;
		}
		if (version !== "7.0.16" || !Zotero.isWin) return;
		if (this.updaterFixCommandIssued) return;
		
		try {
			await Zotero.Connector.callMethod('import', 'installUpdaterFixer')
		} catch (e) {
			// This will fail with 400 status which is the expected outcome
		}
	}
}