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

import { Tab, background, getExtensionURL, delay } from '../support/utils.mjs';

describe('Preferences', function() {
	var tab = new Tab();
	
	before(async function () {
		await tab.init(getExtensionURL('preferences/preferences.html'));
		await delay(200);
	});
	
	after(async function () {
		await tab.close();
	});
	
	describe('General', function() {
		describe('Zotero Status', function() {
			before(async function () {
				await background(function() {
					sinon.stub(Zotero.Connector, 'checkIsOnline').resolves(true);
				});
			});
		
			beforeEach(async function () {
				await background(function() {
					Zotero.Connector.checkIsOnline.reset();
				});	
			});
			
			after(async function () {
				await background(function() {
					Zotero.Connector.checkIsOnline.restore();
				});	
			});
			
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
			
			it('shows Zotero as available after clicking "Update Status" when Zotero is available', async function () {
				await background(function() {
					Zotero.Connector.checkIsOnline.resolves(true);
				});	
				let status = await clickAndReturnStatus();
				assert.include(status, 'currently available');
			});
			
			it('shows Zotero as unavailable after clicking "Update Status" when Zotero is not available', async function () {
				await background(function() {
					Zotero.Connector.checkIsOnline.resolves(false);
				});	
				let status = await clickAndReturnStatus();
				assert.include(status, 'currently unavailable');
			});
		});
	});
	
	describe('Advanced', function() {	
		it('submits an error report to Zotero.org', async function () {
			var reportId = '1234567890';
			
			var message = await tab.run(async function(reportId) {
				try {
					sinon.stub(Zotero.HTTP, 'request').resolves(
						{responseText: `<?xml version="1.0" encoding="UTF-8"?><xml><reported reportID="${reportId}"/></xml>`}
					);
					var deferred = Zotero.Promise.defer();
					sinon.stub(Zotero.ModalPrompt, 'confirm').callsFake((config) => {
						deferred.resolve(config);
						return {button: 0};
					});
					document.getElementById('advanced-button-report-errors').click();
					return await deferred.promise.then(function(config) {
						Zotero.ModalPrompt.confirm.restore();
						return config.message;
					});
				} finally {
					Zotero.HTTP.request.restore();
				}
			}, reportId);
			
			assert.include(message, reportId);
		});
		
		it('submits a debug log to Zotero.org', async function () {
			var debugId = '1234567890';
			var testDebugLine = 'testDebugLine';

			await tab.run(function(testDebugLine) {
				document.getElementById('advanced-checkbox-enable-logging').click();
				Zotero.debug(testDebugLine);
				return Zotero_Preferences.refreshData();
			}, testDebugLine);
			var [message, debugLogBody] = await tab.run(async function(debugId) {
				try {
					sinon.stub(Zotero.HTTP, 'request').resolves(
						{responseText: `<?xml version="1.0" encoding="UTF-8"?><xml><reported reportID="${debugId}"/></xml>`}
					);
					var deferred = Zotero.Promise.defer();
					sinon.stub(Zotero.ModalPrompt, 'confirm').callsFake((config) => {
						deferred.resolve(config);
						return {button: 0};
					});
					document.getElementById('advanced-checkbox-enable-logging').click();
					document.getElementById('advanced-button-submit-output').click();
					return await deferred.promise.then(function(config) {
						Zotero.ModalPrompt.confirm.restore();
						document.getElementById('advanced-button-clear-output').click();
						return [config.message, Zotero.HTTP.request.lastCall.args[2].body];
					}).catch(e => ['error', e]);
				} finally {
					Zotero.HTTP.request.restore();
				}
			}, debugId);
			
			assert.include(message, `D${debugId}`);
			assert.include(debugLogBody, testDebugLine);
		});
	});
});