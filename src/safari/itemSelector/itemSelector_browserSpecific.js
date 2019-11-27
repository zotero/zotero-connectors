/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2010 Center for History and New Media
					 George Mason University, Fairfax, Virginia, USA
					 http://zotero.org
	
	This file is part of Zotero.
	
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	
	You should have received a copy of the GNU General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
	
	***** END LICENSE BLOCK *****
*/

/**
 * Sends a message back to the connector parent
 */
function sendMessage() {
	if(responseSent) return;
	responseSent = true;
	// send message
	const requestID = Math.floor(Math.random() * 1e12);
	safari.extension.dispatchMessage('message', {
		message: "Messaging.sendMessage",
		messageId: requestID,
		args: ['selectDone', items]
	});
	window.close();
}
