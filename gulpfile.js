/*
 ***** BEGIN LICENSE BLOCK *****

 Copyright © 2016 Center for History and New Media
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

'use strict';

const exec = require('child_process').exec;
const through = require('through2');
const gulp = require('gulp');
const babel = require('babel-core');

function reloadChromeExtensionsTab(cb) {
	console.log("Reloading Chrome extensions tab");


	exec('chrome-cli list tabs', function (err, stdout) {
		if (err) cb(err);

		var extensionsTabMatches = stdout.match(/\[\d{1,5}:(\d{1,5})\] Extensions/);
		if (extensionsTabMatches) {
			var extensionsTabID = extensionsTabMatches[1];

			exec('chrome-cli reload -t ' + extensionsTabID)
		}
		else {
			exec('chrome-cli open chrome://extensions && chrome-cli reload')
		}
	});
}

var processFile = function() {
	return through.obj(function(file, enc, cb) {
		console.log(file.path.slice(file.cwd.length));
		var parts = file.path.split('/');
		for (var i = parts.length-1; i > 0; i--) {
			if ('src' === parts[i]) {
				i++;
				break;
			}
		}
		var type = parts[i];
		if (type === 'common' || type === 'chrome') {
			var f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/chrome/' + parts.slice(i+1).join('/');
			console.log(`-> ${f.path.slice(f.cwd.length)}`);
			this.push(f);
		}
		if (type === 'common' || type === 'safari') {
			f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/safari.safariextension/' + parts.slice(i+1).join('/');
			f.contents = new Buffer(babel.transform(f.contents, {presets: ['es2015']}).code);
			console.log(`-> ${f.path.slice(f.cwd.length)}`);
			this.push(f);
		}
		cb();
	});
}

gulp.task('watch', function () {
	var watcher = gulp.watch(['./src/chrome/**', './src/common/**', './src/safari/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(processFile())
			.pipe(gulp.dest((data) => data.base));
	});
});

gulp.task('watch-chrome', function () {
	var watcher = gulp.watch(['./src/chrome/**', './src/common/**', './src/safari/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(processFile())
			.on('close', reloadChromeExtensionsTab);
	});
});

gulp.task('default', ['watch']);
