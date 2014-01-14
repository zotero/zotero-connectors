/*
    ***** BEGIN LICENSE BLOCK *****

    Copyright © 2011 Center for History and New Media
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

/*global window, navigator, console, localStorage */
var Zotero = new function() {
    'use strict';

    this.isConnector = true;
    this.isFx = navigator.userAgent.indexOf("Netscape") !== -1;
    this.isChrome = !!window.chrome;
    this.isSafari = navigator.userAgent.indexOf("Safari/") !== -1 && !this.isChrome;
    this.isWebKit = navigator.userAgent.toLowerCase().indexOf("webkit") !== -1;
    this.isIE = navigator.appName === "Microsoft Internet Explorer";
    this.version = "3.0.4";

    if (this.isFx) {
        this.browser = "g";
    } else if (this.isSafari) {
        this.browser = "s";
    } else if (this.isIE) {
        this.browser = "i";
    } else {
        this.browser = "c";
    }

    /**
     * Initializes Zotero services for the global page in Chrome or Safari
     */
    this.initGlobal = function() {
        Zotero.isBackground = true;
        Zotero.Debug.init();
        Zotero.Messaging.init();
        Zotero.Connector_Types.init();
        Zotero.Repo.init();
    };

    /**
     * Initializes Zotero services for injected pages and the inject side of the bookmarklet
     */
    this.initInject = function() {
        Zotero.isInject = true;
        Zotero.Debug.init();
        Zotero.Messaging.init();
        Zotero.Connector_Types.init();
    };


    /**
     * Get versions, platform, etc.
     *
     * Can be used synchronously or asynchronously.
     */
    this.getSystemInfo = function(callback) {
        var info = {
            connector: "true",
            version: this.version,
            platform: navigator.platform,
            locale: navigator.language,
            appVersion: navigator.appVersion
        };

        if (this.isChrome) {
            info.appName = "Chrome";
        } else if (this.isSafari) {
            info.appName = "Safari";
        } else if (this.isIE) {
            info.appName = "Internet Explorer";
        } else {
            info.appName = navigator.appName;
        }

        var str = Object.keys(info).reduce(
            function(prev, key) {
                return prev + key + ' => ' + info[key] + ', ';
            },
            ""
        );
        // Replaced code
        /*var key;
        for (key in info) {
            str += key + ' => ' + info[key] + ', ';
        }*/
        str = str.substr(0, str.length - 2);
        callback(str);
    };

    /**
     * Writes a line to the debug console
     */
    this.debug = function(message, level) {
        Zotero.Debug.log(message, level);
    };

    this.logError = function(err) {
        if (!window.console) { return; }

        // Firefox uses this
        var fileName = (err.fileName ? err.fileName : null);
        var lineNumber = (err.lineNumber ? err.lineNumber : null);

        // Safari uses this
        if (!fileName && err.sourceURL) { fileName = err.sourceURL; }
        if (!lineNumber && err.line) { lineNumber = err.line; }

        // Chrome only gives a stack
        if (!fileName && !lineNumber && err.stack) {
            var stackRe = /^\s+at (?:[^(\n]* \()?([^\n]*):([0-9]+):([0-9]+)\)?$/m;
            var m = stackRe.exec(err.stack);
            if (m) {
                fileName = m[1];
                lineNumber = m[2];
            }
        }

        if (!fileName && !lineNumber && Zotero.isIE && typeof err === "object") {
            // IE can give us a line number if we re-throw the exception, but we wrap this in a
            // setTimeout call so that we won't throw in the middle of a function
            window.setTimeout(function() {
                window.onerror = function(errmsg, fileName, lineNumber) {
                    try {
                        Zotero.Errors.log("message" in err ? err.message : err.toString(), fileName, lineNumber);
                    } catch (ignore) {}
                    return true;
                };
                throw err;
                window.onerror = undefined;
            }, 0);
            return;
        }

        if (fileName && lineNumber) {
            console.error(err + " at " + fileName + ":" + lineNumber);
        } else {
            console.error(err);
        }

        Zotero.Errors.log(err.message ? err.message : err.toString(), fileName, lineNumber);
    };
};

Zotero.Prefs = new function() {
    'use strict';

    var DEFAULTS = {
        "debug.log": true,
        "debug.stackTrace": false,
        "debug.store": false,
        "debug.store.limit": 750000,
        "debug.level": 5,
        "debug.time": false,
        "downloadAssociatedFiles": true,
        "automaticSnapshots": true,
        "connector.repo.lastCheck.localTime": 0,
        "connector.repo.lastCheck.repoTime": 0,
        "capitalizeTitles": false
    };

    this.get = function(pref) {
        try {
            if (localStorage["pref-" + pref]) {
                return JSON.parse(localStorage["pref-" + pref]);
            }
        } catch (ignore) {}
        if (DEFAULTS.hasOwnProperty(pref)) { return DEFAULTS[pref]; }
        throw "Zotero.Prefs: Invalid preference " + pref;
    };

    this.getCallback = function(pref, callback) {
        if (typeof pref === "object") {
            var prefData = {},
                i;
            for (i = 0; i < pref.length; i += 1) {
                prefData[pref[i]] = Zotero.Prefs.get(pref[i]);
            }
            callback(prefData);
        } else {
            callback(Zotero.Prefs.get(pref));
        }
    };

    this.set = function(pref, value) {
        Zotero.debug("Setting " + pref + " to " + JSON.stringify(value));
        localStorage["pref-" + pref] = JSON.stringify(value);
    };
};