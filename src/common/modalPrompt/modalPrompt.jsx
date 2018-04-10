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

window.onload = async function () {
	Zotero.Messaging.addMessageListener('modalPrompt.show', async function(props) {
		var deferred = Zotero.Promise.defer();
		let div = document.createElement('div');
		div.id = 'zotero-modal-prompt';
		div.style.cssText = 'z-index: 1000000; position: fixed; top: 0; left: 0; width: 100%; height: 100%';
		let prompt = (
			<Zotero.UI.ModalPrompt onClose={onClose} {...props}/>
		);
		function onClose(state, event) {
			deferred.resolve({
				button: event ? parseInt(event.target.name || 0) : 0,
				checkboxChecked: state.checkboxChecked,
				inputText: state.inputText
			});
			ReactDOM.unmountComponentAtNode(div);
			document.body.removeChild(div);
		}
		ReactDOM.render(prompt, div);
		document.body.appendChild(div);
		return deferred.promise;
	});
	
	await Zotero.Messaging.init();
	Zotero.Messaging.sendMessage('modalPrompt.init', null);
};
