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
const spawn = require('child_process').spawn;
const gulp = require('gulp');
const plumber = require('gulp-plumber');
const babel = require('gulp-babel');
const buffer = require('vinyl-buffer');

function onError(err) {
    console.warn(err);
}

function reloadChromeExtensionsTab(cb) {
    console.log("Reloading Chrome extensions tab");


    exec('chrome-cli list tabs', function(err, stdout) {
        if (err) cb(err);

        var extensionsTabMatches = stdout.match(/\[\d{1,5}:(\d{1,5})\] Extensions/);
        if (extensionsTabMatches) {
            var extensionsTabID = extensionsTabMatches[1];

            exec('chrome-cli reload -t ' + extensionsTabID, function (err, stdout, stderr) {
                if (err) return cb(err);
                cb();
            });
        }
        else {
            exec('chrome-cli open chrome://extensions && chrome-cli reload', function (err, stdout, stderr) {
                if (err) return cb(err);
                cb();
            });
        }
    });
}

function safarify() {
    return gulp.src('./build/safari.safariextension/zotero/**/*.js')
        .pipe(buffer())
        .pipe(plumber({errorHandler: onError}))
        .pipe(babel({
            presets: ['es2015']
        }))
        .pipe(gulp.dest('./build/safari.safariextension/zotero/'));
}

gulp.task('watch', function() {
    gulp.watch(['./src/chrome/**', './src/common/**', './src/safari/**'], ['build-dev']);
});

gulp.task('watch-chrome', function() {
    gulp.watch(['./src/chrome/**', './src/common/**', './src/safari/**'], ['build-dev', 'reloadChromeExtensionsTab']);
});

gulp.task('reloadChromeExtensionsTab', ['build-dev', 'safarify'], reloadChromeExtensionsTab);

gulp.task('build-sh-dev', function(cb) {
    var proc = spawn('./build.sh', ['-d'], {cwd: process.cwd()});
    proc.stdout.on('data', function(data) {
        process.stdout.write(data);
    });
    proc.stderr.on('data', function(data) {
        process.stderr.write(data);
    });
    proc.on('close', function(code) {
        cb(code)
    })
});

gulp.task('safarify', ['build-sh-dev'], safarify);

gulp.task('build-dev', ['build-sh-dev', 'safarify']);

gulp.task('default', ['build-dev']);