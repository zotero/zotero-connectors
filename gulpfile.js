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
const argv = require('yargs')
	.boolean('p')
	.alias('p', 'production')
	.describe('p', 'Production. Do not include translator tester.')
	.alias('v', 'version')
	.describe('v', 'Version of the extension')
	.help('h')
	.alias('h', 'help')
	.default({'v': '4.0.29.11', p: false})
	.argv;

var injectInclude = [
	'zotero.js',
	'zotero_config.js',
	'promise.js',
	'http.js',
	'zotero/connector/cachedTypes.js',
	'zotero/date.js',
	'zotero/debug.js',
	'zotero/openurl.js',
	"zotero/xregexp/xregexp.js",
	"zotero/xregexp/addons/build.js",
	"zotero/xregexp/addons/matchrecursive.js",
	"zotero/xregexp/addons/unicode/unicode-base.js",
	"zotero/xregexp/addons/unicode/unicode-categories.js",
	"zotero/xregexp/addons/unicode/unicode-zotero.js",
	'zotero/rdf/init.js',
	'zotero/rdf/uri.js',
	'zotero/rdf/term.js',
	'zotero/rdf/identity.js',
	'zotero/rdf/match.js',
	'zotero/rdf/rdfparser.js',
	'zotero/translation/translate.js',
	'zotero/translation/translator.js',
	'zotero/connector/translate_item.js',
	'zotero/connector/typeSchemaData.js',
	'zotero/utilities.js',
	'zotero/utilities_translate.js',
	'inject/http.js',
	'inject/progressWindow.js',
	'inject/translator.js',
	'inject/translate_inject.js',
	'messages.js',
	'messaging_inject.js'
];
var injectIncludeBrowserExt = injectInclude.concat(['api.js']);
var injectIncludeLast;
if (argv.p) {
	injectIncludeLast = ['inject/inject.js'];
} else {
	injectIncludeLast = [
		'tools/testTranslators/translatorTester_messages.js',
		'tools/testTranslators/translatorTester.js',
		'inject/inject.js',
		'tools/testTranslators/translatorTester_inject.js'
	];
}
injectInclude.push.apply(injectInclude, injectIncludeLast);
injectIncludeBrowserExt.push.apply(injectIncludeBrowserExt, injectIncludeLast);

var backgroundInclude = [
	'zotero.js',
	'zotero_config.js',
	'promise.js',
	'errors_webkit.js',
	'api.js',
	'http.js',
	'oauthsimple.js',
	'zotero/connector/connector.js',
	'zotero/connector/cachedTypes.js',
	'zotero/date.js',
	'zotero/debug.js',
	"zotero/xregexp/xregexp.js",
	"zotero/xregexp/addons/build.js",
	"zotero/xregexp/addons/matchrecursive.js",
	"zotero/xregexp/addons/unicode/unicode-base.js",
	"zotero/xregexp/addons/unicode/unicode-categories.js",
	"zotero/xregexp/addons/unicode/unicode-zotero.js",
	'zotero/openurl.js',
	'zotero/connector/repo.js',
	'zotero/translation/tlds.js',
	'zotero/connector/translator.js',
	'zotero/connector/typeSchemaData.js',
	'zotero/utilities.js',
	'messages.js',
	'messaging.js'
];

if (!argv.p) {
	backgroundInclude.push('tools/testTranslators/translatorTester_messages.js',
		'tools/testTranslators/translatorTester.js',
		'tools/testTranslators/translatorTester_global.js');
}

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

function processFile() {
	return through.obj(function(file, enc, cb) {
		console.log(file.path.slice(file.cwd.length));
		var parts = file.path.split('/');
		var basename = parts[parts.length-1];
		var ext = basename.split('.')[1];
		for (var i = parts.length-1; i > 0; i--) {
			if ('src' === parts[i]) {
				i++;
				break;
			}
		}
		var type = parts[i];
		
		// Replace contents
		switch (basename) {
			case 'manifest.json':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*BACKGROUND SCRIPTS*/",
						backgroundInclude.map((s) => `"${s}"`).join(',\n\t\t\t'))
					.replace(/"version": "[^"]*"/, '"version": "'+argv.version+'"'));
				break;
			case 'background.js':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*INJECT SCRIPTS*/", 
						injectIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t')));
				break;
			case 'global.html':
				file.contents = Buffer.from(file.contents.toString()
					.replace("<!--SCRIPTS-->", 
						backgroundInclude.map((s) => '<script type="text/javascript" src="' + s + '"></script>')
							.join('\n')));
				break;
			case 'Info.plist':
				file.contents = Buffer.from(file.contents.toString()
					.replace("<!--SCRIPTS-->",
						injectInclude.map((s) => `<string>${s}</string>`).join('\n\t\t\t\t'))
					.replace(/(<key>(?:CFBundleShortVersionString|CFBundleVersion)<\/key>\s*)<string>[^<]*<\/string>/g,
						 '$1<string>'+argv.version+'</string>'));
				break;
		}
		
		// Amend paths
		if (type === 'common' || type === 'browserExt') {
			var f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/browserExt/' + parts.slice(i+1).join('/');
			console.log(`-> ${f.path.slice(f.cwd.length)}`);
			this.push(f);
		}
		if (type === 'common' || type === 'safari') {
			f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/safari.safariextension/' + parts.slice(i+1).join('/');
			if (ext === 'js') {
				f.contents = new Buffer(babel.transform(f.contents, {presets: ['es2015']}).code);
			}
			console.log(`-> ${f.path.slice(f.cwd.length)}`);
			this.push(f);
		}
		cb();
	});
}

gulp.task('watch', function () {
	var watcher = gulp.watch(['./src/browserExt/**', './src/common/**', './src/safari/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(processFile())
			.pipe(gulp.dest((data) => data.base));
	});
});

gulp.task('watch-chrome', function () {
	var watcher = gulp.watch(['./src/browserExt/**', './src/common/**', './src/safari/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(processFile())
			.on('close', reloadChromeExtensionsTab);
	});
});

gulp.task('inject-scripts', function() {
	gulp.src([
		'./src/browserExt/background.js',
		'./src/browserExt/manifest.json', 
		'./src/safari/global.html',
		'./src/safari/Info.plist'
	]).pipe(processFile())
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('default', ['watch']);
