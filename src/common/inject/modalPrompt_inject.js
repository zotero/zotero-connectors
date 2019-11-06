/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Center for History and New Media
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

(function() {

var isTopWindow = false;
if (window.top) {
	try {
		isTopWindow = window.top == window;
	} catch (e) {}
}

if (isTopWindow) {
	//
	// Modal prompt initialization
	//
	// The progress window is created using React in an iframe, and we use the
	// connector messaging system to communicate with.
	//
	var frameID = 'zotero-modal-prompt';
	var iframe;
	var initialized = false;
	var frameSrc;
	if (Zotero.isSafari) {
		frameSrc = `${safari.extension.baseURI}safari/` + 'modalPrompt/modalPrompt.html';
	}
	else {
		frameSrc = browser.extension.getURL('modalPrompt/modalPrompt.html');
	}

	async function init() {
		var deferred = Zotero.Promise.defer();
		Zotero.Messaging.addMessageListener('modalPrompt.init', function () {
			initialized = true;
			deferred.resolve();
			// Prevent the flash of white screen
			iframe.style.display = "block"
		});

		iframe = document.createElement('iframe');
		iframe.id = frameID;
		iframe.src = frameSrc;
		var style = {
			position: 'fixed',
			top: '0px',
			left: 'unset',
			right: '0px',
			width: '100%',
			height: '100%',
			border: "none",
			display: "none",
			zIndex: 2147483647
		};
		for (let i in style) iframe.style[i] = style[i];
		document.body.appendChild(iframe);
		return deferred.promise;
	}

	/**
	 *
	 * @param props {Object} to be passed to ModalPrompt component
	 * @returns {Promise{Object}} Object with properties:
	 *        `button` - button number clicked (or 0 if clicked outside of prompt)
	 *        `checkboxChecked` - checkbox state on close
	 *        `inputText` - input field string on close
	 */
	Zotero.ModalPrompt = {
		confirm: async function (props) {
			if (!initialized) {
				await init();
			}
			iframe.style.display = 'block';
			let result = await Zotero.Messaging.sendMessage('modalPrompt.show', props, null, null);
			iframe.style.display = 'none';
			return result
		}
	}
}

})();
