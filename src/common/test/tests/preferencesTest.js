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

describe('Preferences', function() {
	var tab = new Tab();
	
	before(Promise.coroutine(function* () {
		yield tab.init(getExtensionURL('preferences/preferences.html'));
		if (Zotero.isFirefox) {
			// Firefox is just very slow
			yield Promise.delay(200);
		}
	}));
	
	after(Promise.coroutine(function* () {
		yield tab.close();
	}));
	
	describe('General', function() {
		describe('Zotero Status', function() {
			before(Promise.coroutine(function* () {
				return background(function() {
					sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
				});
			}));
		
			beforeEach(Promise.coroutine(function* () {
				return background(function() {
					Zotero.Connector.checkIsOnline.reset();
				});	
			}));
			
			after(Promise.coroutine(function* () {
				return background(function() {
					Zotero.Connector.checkIsOnline.restore();
				});	
			}));
			
			function clickAndReturnStatus() {
				return tab.run(function() {
					var spy = sinon.spy(Zotero.Connector, 'checkIsOnline');
					document.querySelector('input[value="Update Status"]').click();
					return spy.lastCall.returnValue.then(function() {
						spy.restore();
						return document.querySelector('#client-status p').textContent;
					});
				});	
			}
			
			it('shows Zotero as available after clicking "Update Status" when Zotero is available', Promise.coroutine(function * () {
				yield background(function() {
					Zotero.Connector.checkIsOnline.resolves(true);
				});	
				let status = yield clickAndReturnStatus();
				assert.include(status, 'currently available');
			}));
			
			it('shows Zotero as unavailable after clicking "Update Status" when Zotero is not available', Promise.coroutine(function * () {
				yield background(function() {
					Zotero.Connector.checkIsOnline.resolves(false);
				});	
				let status = yield clickAndReturnStatus();
				assert.include(status, 'currently unavailable');
			}));
		});
	});
	
	describe('Advanced', function() {	
		it('submits an error report to Zotero.org', Promise.coroutine(function* () {
			var reportId = '1234567890';
			yield background(function(reportId) {
				sinon.stub(Zotero.Connector, 'callMethod').resolves(new Zotero.Connector.CommunicationError('stub'));
				sinon.stub(Zotero.HTTP, 'request').resolves(
					{responseText: `<?xml version="1.0" encoding="UTF-8"?><xml><reported reportID="${reportId}"/></xml>`}
				);
			}, reportId);

			try {
				var message = yield tab.run(function() {
					var deferred = Zotero.Promise.defer();
					sinon.stub(Zotero.ModalPrompt, 'confirm').callsFake(deferred.resolve);
					document.getElementById('advanced-button-report-errors').click();
					return deferred.promise.then(function(config) {
						Zotero.ModalPrompt.confirm.restore();
						return config.message;
					});
				});
				
				assert.include(message, reportId);
			} finally {
				yield background(() => {
					Zotero.HTTP.request.restore();
					Zotero.Connector.callMethod.restore();
				});
			}
		}));
		
		it('submits a debug log to Zotero.org', async function () {
			var debugId = '1234567890';
			var testDebugLine = 'testDebugLine';
			await background(function(debugId) {
				sinon.stub(Zotero.HTTP, 'request').resolves(
					{responseText: `<?xml version="1.0" encoding="UTF-8"?><xml><reported reportID="${debugId}"/></xml>`}
				);
				sinon.stub(Zotero.Connector, 'callMethod').resolves(new Zotero.Connector.CommunicationError('stub'));
			}, debugId);

			try {
				await tab.run(function(testDebugLine) {
					document.getElementById('advanced-checkbox-enable-logging').click();
					Zotero.debug(testDebugLine);
					return Zotero_Preferences.refreshData();
				}, testDebugLine);
				var message = await tab.run(function() {
					var deferred = Zotero.Promise.defer();
					sinon.stub(Zotero.ModalPrompt, 'confirm').callsFake(deferred.resolve);
					document.getElementById('advanced-checkbox-enable-logging').click();
					document.getElementById('advanced-button-submit-output').click();
					return deferred.promise.then(function(config) {
						Zotero.ModalPrompt.confirm.restore();
						document.getElementById('advanced-button-clear-output').click();
						return config.message;
					}).catch(e => ['error', e]);
				});
				
				assert.include(message, `D${debugId}`);
				var debugLogBody = await background(function() {
					return Zotero.HTTP.request.lastCall.args[2].body;
				});
				assert.include(debugLogBody, testDebugLine);
			} finally {
				await background(function() {
					Zotero.HTTP.request.restore();
					Zotero.Connector.callMethod.restore();
				});
			}	
		});
	});
});