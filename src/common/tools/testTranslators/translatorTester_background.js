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


Zotero.TranslatorTesterBackground = {
	async runDummyTranslationInTab({
		tabId,
		translatorID,
	}) {
		// This message is sent from translatorTester_environment (running on
		// testTranslators.html: extension page).
		// We (background page) forward it to translatorTester_inject (content).
		
		// Theoretically the extension page should just be able to use privileged
		// extension APIs to send the message directly, but that fails
		// ("The message port closed before a response was received").
		
		let tab = await browser.tabs.get(tabId);
		return Zotero.Messaging.sendMessage(
			'translatorTester_dummyTranslate',
			[
				translatorID,
			],
			tab
		);
	},
};
