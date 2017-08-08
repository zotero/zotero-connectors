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

describe('Connector_Browser', function() {
	var tab = new Tab();
	
	describe('onPDFFrame', function() {
		it('sets icon to PDF if no translators present', Promise.coroutine(function* () {
			try {
				let bgPromise = background(function() {
					Zotero.Prefs.set('firstUse', false);
					let stub = sinon.stub(Zotero.Connector_Browser, '_showPDFIcon');
					var deferred = Zotero.Promise.defer();
					stub.callsFake(deferred.resolve);
					return deferred.promise;
				});
				yield tab.init(chrome.extension.getURL('test/data/framePDF.html'));
				yield bgPromise;
				let tabId = yield background(function() {
					let tabId = Zotero.Connector_Browser._showPDFIcon.args[0][0].id;
					return tabId;
				});
				assert.equal(tabId, tab.tabId);
			} finally {
				yield tab.close();
				yield background(() => Zotero.Connector_Browser._showPDFIcon.restore())
			}
		}));
	});
});