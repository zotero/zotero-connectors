/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
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

var _instanceData = {};

// save old runTests function
Zotero_TranslatorTester.prototype._runTests = Zotero_TranslatorTester.prototype.runTests;

/**
 * Overloads Zotero_TranslatorTester#runTests for Chrome/Safari environments
 */
Zotero_TranslatorTester.prototype.runTests = function(callback) {
	if(this.type === "web") {
		// web translators need to be run in their own environments
		var instanceID = Zotero.Utilities.randomString();
		_instanceData[instanceID] = {"testDone":callback, "debug":this._debug};
		Zotero.TranslatorTester.runTests(this.translator, this.type, instanceID);
	} else {
		// other translators get passed right through, after we get schema and preferences
		var me = this;
		Zotero.Connector_Types.getSchema(function(schema) {
			Zotero.Connector_Types.schema = schema;
			Zotero.Connector_Types.init();
			me._runTests(callback);
		});
	}
}

// call testDoneCallback and delete instance data if this is the last
Zotero.Messaging.addMessageListener("translatorTester_testDone", function(data) {
	_instanceData[data[0]].testDone.apply(null, data[1]);
	if(data[1][0].pending.length === 0) delete _instanceData[data[0]];
});

// call Zotero_TranslatorTester#_debug
Zotero.Messaging.addMessageListener("translatorTester_debug", function(data) {
	_instanceData[data[0]].debug.apply(null, data[1]);
});