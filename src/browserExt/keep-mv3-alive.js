/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2021 Corporation for Digital Scholarship
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

//Based on
//https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/66618269#66618269

const LET_DIE_AFTER = 60*60e3; // 1 hour

// Time since the keep-alive counter became non-zero
let startedOn = null;
let loggedLetDie = false;

function keepAlive() {
	let counter = Zotero.Connector_Browser.shouldKeepServiceWorkerAlive();
	if (!counter) {
		startedOn = null;
		loggedLetDie = false;
		return;
	}
	startedOn ??= Date.now();
	if (startedOn + LET_DIE_AFTER < Date.now()) {
		if (!loggedLetDie) {
			loggedLetDie = true;
			// Likely a setKeepServiceWorkerAlive(true) call without a matching (false)
			Zotero.logError(new Error(`Service worker kept alive for over 1 hour (counter: ${counter}). `
				+ `Letting it die`));
		}
		return;
	}
	chrome.runtime.getPlatformInfo();
}
setInterval(keepAlive, 20e3);