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

const { watchBookmarklet, processBookmarkletScripts } = require('./scripts/gulpfile_bookmarklet');
const exec = require('child_process').exec;
const through = require('through2');
const gulp = require('gulp');
const plumber = require('gulp-plumber');
const babel = require('babel-core');
const browserify = require('browserify');
const argv = require('yargs')
	.boolean('p')
	.alias('p', 'production')
	.describe('p', 'Production. Do not include translator tester.')
	.alias('v', 'version')
	.describe('v', 'Version of the extension')
	.help('h')
	.alias('h', 'help')
	.default({'v': '4.999.0', p: false})
	.argv;

var injectInclude = [
	'node_modules.js',
	'zotero_config.js',
	'zotero.js',
	'promise.js',
	'http.js',
	'proxy.js',
	'cachedTypes.js',
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
	'translate_item.js',
	'zotero/connectorTypeSchemaData.js',
	'zotero/utilities.js',
	'zotero/utilities_translate.js',
	'utilities.js',
	'inject/http.js',
	'inject/translate_inject.js',
	'integration/connectorIntegration.js',
	'messages.js',
	'messaging_inject.js',
	'inject/progressWindow_inject.js',
	'inject/modalPrompt_inject.js',
	'i18n.js'
];
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
var injectIncludeSafari = [].concat(injectInclude, ['ui/notification.js', 'browser_inject.js'], injectIncludeLast);
var injectIncludeBrowserExt = ['browser-polyfill.js'].concat(injectInclude, ['api.js'], injectIncludeLast);
if (!argv.p) {
	injectIncludeSafari = injectIncludeSafari.concat(['lib/sinon.js', 'test/testSetup.js'])
}

var backgroundInclude = [
	'node_modules.js',
	'zotero_config.js',
	'zotero.js',
	'i18n.js',
	'promise.js',
	'prefs.js',
	'api.js',
	'http.js',
	'oauthsimple.js',
	'proxy.js',
	'connector.js',
	'cachedTypes.js',
	'zotero/date.js',
	'zotero/debug.js',
	'errors_webkit.js',
	"zotero/xregexp/xregexp.js",
	"zotero/xregexp/addons/build.js",
	"zotero/xregexp/addons/matchrecursive.js",
	"zotero/xregexp/addons/unicode/unicode-base.js",
	"zotero/xregexp/addons/unicode/unicode-categories.js",
	"zotero/xregexp/addons/unicode/unicode-zotero.js",
	'zotero/openurl.js',
	'repo.js',
	'zotero/translation/tlds.js',
	'zotero/translation/translator.js',
	'translators.js',
	'zotero/connectorTypeSchemaData.js',
	'zotero/utilities.js',
	'utilities.js',
	'zotero-google-docs-integration/api.js',
	'messages.js',
	'messaging.js'
];


if (!argv.p) {
	backgroundInclude.push('tools/testTranslators/translatorTester_messages.js',
		'tools/testTranslators/translatorTester.js',
		'tools/testTranslators/translatorTester_global.js',
		'test/messages.js',
		'test/testSetup.js',
		'lib/sinon.js');
}
var backgroundIncludeBrowserExt = ['browser-polyfill.js'].concat(backgroundInclude, [
	'webRequestIntercept.js',
	'contentTypeHandler.js',
	'firefoxPDF.js'
]);

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

function replaceScriptsHTML(string, match, scripts) {
	return string.replace(match,
		scripts.map((s) => '<script type="text/javascript" src="' + s + '"></script>')
			.join('\n'));
}

function processFile() {
	return through.obj(function(file, enc, cb) {
		console.log(file.path.slice(file.cwd.length));
		var offset = file.cwd.split('/').length;
		var parts = file.path.split('/');
		var basename = parts[parts.length-1];
		var ext = basename.split('.')[1];
		for (var i = offset; i < parts.length; i++) {
			if ('src' === parts[i]) {
				i++;
				break;
			}
		}
		var type = parts[i];
		
		if (ext == 'jsx') {
			try {
				file.contents = new Buffer(
					babel.transform(
						file.contents,
						{
							plugins: ['transform-react-jsx', 'transform-class-properties']
						}
					).code
				);
			} catch (e) {
				console.log(e.message);
				return;
			}
			parts[parts.length-1] = basename = basename.substr(0, basename.length-1);
			ext = 'js';
		}
		
		var addFiles = function(file) {
			var f;
			
			// Amend paths
			if (type === 'common' || type === 'browserExt') {
				if (file.path.includes('.html')) {
					file.contents = Buffer.from(replaceScriptsHTML(
						file.contents.toString(), "<!--SCRIPTS-->", injectIncludeBrowserExt.map(s => `../../${s}`)));
				}
				['chrome', 'firefox'].forEach((browser) => {
					f = file.clone({contents: false});
					f.path = parts.slice(0, i-1).join('/') + `/build/${browser}/` + parts.slice(i+1).join('/');
					console.log(`-> ${f.path.slice(f.cwd.length)}`);
					this.push(f);
				});
			}
			if (type === 'common' || type === 'safari') {
				if (file.path.includes('test/data') && file.path.includes('.html')) {
					file.contents = Buffer.from(replaceScriptsHTML(
						file.contents.toString(), "<!--SCRIPTS-->", injectIncludeSafari.map(s => `../../${s}`)));
				}
				f = file.clone({contents: false});
				f.path = parts.slice(0, i-1).join('/') + '/build/safari.safariextension/' + parts.slice(i+1).join('/');
				console.log(`-> ${f.path.slice(f.cwd.length)}`);
				this.push(f);
			}
			if (type === 'zotero-google-docs-integration') {
				f = file.clone({contents: false});
				f.path = parts.slice(0, i-1).join('/') + '/build/safari.safariextension/zotero-google-docs-integration/' 
					+ parts.slice(i+3).join('/');
				console.log(`-> ${f.path.slice(f.cwd.length)}`);
				this.push(f);
				['chrome', 'firefox'].forEach((browser) => {
					f = file.clone({contents: false});
					f.path = parts.slice(0, i-1).join('/') + `/build/${browser}/zotero-google-docs-integration/`
						+ parts.slice(i+3).join('/');
					console.log(`-> ${f.path.slice(f.cwd.length)}`);
					this.push(f);
				});
			}
			cb();
		}.bind(this);
		
		var asyncAddFiles = false;
		// Replace contents
		switch (basename) {
			case 'zotero_config.js':
				var contents = file.contents.toString();
				if (process.env.ZOTERO_GOOGLE_DOCS_DEV_MODE) {
					contents = contents.replace('GOOGLE_DOCS_DEV_MODE: false',
						'GOOGLE_DOCS_DEV_MODE: true');
				}
				if (process.env.ZOTERO_GOOGLE_DOCS_API_URL) {
					contents = contents.replace(/GOOGLE_DOCS_API_URL: [^,]*/,
						`GOOGLE_DOCS_API_URL: "${process.env.ZOTERO_GOOGLE_DOCS_API_URL}"`);
				}
				if (process.env.ZOTERO_GOOGLE_DOCS_OAUTH_CLIENT_KEY) {
					contents = contents.replace(
						'222339878061-13uqre19u268oo9pdapuaifklbu8d6js.apps.googleusercontent.com',
						process.env.ZOTERO_GOOGLE_DOCS_OAUTH_CLIENT_KEY
					);
				}
				file.contents = Buffer.from(contents);
				break;
			case 'zotero.js':
				if (!argv.p) {
					file.contents = Buffer.from(file.contents.toString()
						.replace('"debug.log": false', '"debug.log": true'));
				}
				break;
			case 'manifest.json':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*BACKGROUND SCRIPTS*/",
						backgroundIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t\t'))
					.replace("/*INJECT SCRIPTS*/",
						injectIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t\t'))
					.replace(/"version": "[^"]*"/, '"version": "'+argv.version+'"'));
				break;
			case 'background.js':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*INJECT SCRIPTS*/", 
						injectIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t')));
				break;
			case 'global.html':
				file.contents = Buffer.from(replaceScriptsHTML(
					file.contents.toString(), "<!--SCRIPTS-->", backgroundInclude));
				break;
			case 'preferences.html':
			case 'progressWindow.html':
				file.contents = Buffer.from(file.contents.toString()
					.replace(/<!--BEGIN DEBUG-->([\s\S]*?)<!--END DEBUG-->/g, argv.p ? '' : '$1'));
				break;
			case 'Info.plist':
				file.contents = Buffer.from(file.contents.toString()
					.replace("<!--SCRIPTS-->",
						injectIncludeSafari.map((s) => `<string>${s}</string>`).join('\n\t\t\t\t'))
					.replace(/(<key>(?:CFBundleShortVersionString|CFBundleVersion)<\/key>\s*)<string>[^<]*<\/string>/g,
						 '$1<string>'+argv.version+'</string>'));
				break;
			case 'node_modules.js':
				asyncAddFiles = true;
				// Stream needs to be converted to a buffer because of complicated stream cloning quantum bugs
				browserify(file).bundle((err, buf) => {file.contents = buf; addFiles(file)});
				break;
		}
		
		if (!asyncAddFiles) {
			addFiles(file);
		}
	});
}

gulp.task('watch', function () {
	var watcher = gulp.watch(['./src/browserExt/**', './src/common/**', './src/safari/**',
		'./src/zotero-google-docs-integration/src/connector/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(plumber())
			.pipe(processFile())
			.pipe(gulp.dest((data) => data.base));
	});
});

gulp.task('watch-chrome', function () {
	var watcher = gulp.watch(['./src/browserExt/**', './src/common/**', './src/safari/**',
		'./src/zotero-google-docs-integration/src/connector/**']);
	watcher.on('change', function(event) {
		gulp.src(event.path)
			.pipe(plumber())
			.pipe(processFile())
			.pipe(gulp.dest((data) => data.base))
			.on('close', reloadChromeExtensionsTab);
	});
});

gulp.task('process-custom-scripts', function() {
	let sources = [
		'./src/browserExt/background.js',
		'./src/browserExt/manifest.json',
		'./src/browserExt/confirm.html',
		'./src/safari/global.html',
		'./src/safari/Info.plist',
		'./src/common/node_modules.js',
		'./src/common/preferences/preferences.html',
		'./src/common/progressWindow/progressWindow.html',
		'./src/common/zotero.js',
		'./src/common/zotero_config.js',
		'./src/common/test/**/*',
		'./src/**/*.jsx',
		'./src/zotero-google-docs-integration/src/connector/**'
	];
	if (!argv.p) {
		sources.push('./src/common/test/**/*.js');	
	}
	gulp.src(sources).pipe(plumber())
		.pipe(processFile())
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('watch-bookmarklet', watchBookmarklet(argv))

gulp.task('process-bookmarklet-scripts', processBookmarkletScripts(argv));

gulp.task('default', ['watch']);
