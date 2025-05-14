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

if (!Zotero.isDebug) {
	throw new Error('This file should only be loaded in debug mode');
}

window.addEventListener('message', async (event) => {
	// Allow the test runner to invoke functions in the content script scope
	if (event.data.type === 'zotero-test-exec') {
		let { fnName, args, id } = event.data;
		Zotero.debug(`Executing ${fnName}(${args.join(', ')}), ${id}`);
		let fnPath = fnName.split('.');
		let fn = globalThis;
		for (let name of fnPath) {
			fn = fn[name];
		}
		args.forEach((arg, index) => {
			if (arg === '__function') {
				args[index] = (v) => {
					Zotero.debug(`${fnName} Invoking callback ${index} with ${v}`);
					window.postMessage({ type: 'zotero-test-callback', result: v, id, index }, '*');
				}
			}
		});
		let result = await Promise.resolve(fn(...args));
		Zotero.debug(`${fnName} Invoking callback ${-1} with ${result}`);
		window.postMessage({ type: 'zotero-test-callback', result, id, index: -1 }, '*');
	}
});