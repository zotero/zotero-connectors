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
const replaceBrowser = require('./scripts/replace_browser');
const exec = require('child_process').exec;
const through = require('through2');
const gulp = require('gulp');
const plumber = require('gulp-plumber');
const babel = require('@babel/core');
const browserify = require('browserify');
const schemaJSON = require('./src/zotero/resource/schema/global/schema.json');
const argv = require('yargs')
	.boolean('p')
	.alias('p', 'production')
	.describe('p', 'Production. Do not include translator tester.')
	.string('connector-version')
	.describe('connector-version', 'Version of the extension')
	.help('h')
	.alias('h', 'help')
	.default({'connector-version': '4.999.0', p: false})
	.argv;

var injectInclude = [
	'node_modules.js',
	'zotero_config.js',
	'zotero.js',
	'promise.js',
	'http.js',
	'proxy.js',
	'cachedTypes.js',
	'schema.js',
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
	'i18n.js',
	'singlefile.js'
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
var injectIncludeBrowserExt = ['browser-polyfill.js'].concat(injectInclude, ['api.js'], injectIncludeLast);

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
	'google-docs-plugin-manager.js',
	'messages.js',
	'messaging.js',
	'lib/SingleFile/lib/single-file/index.js',
	'lib/SingleFile/extension/lib/single-file/index.js',
	'lib/SingleFile/extension/lib/single-file/browser-polyfill/chrome-browser-polyfill.js',
	'lib/SingleFile/extension/lib/single-file/core/bg/scripts.js',
	'lib/SingleFile/extension/lib/single-file/fetch/bg/fetch.js',
	'lib/SingleFile/extension/lib/single-file/frame-tree/bg/frame-tree.js',
	'lib/SingleFile/extension/lib/single-file/lazy/bg/lazy-timeout.js'
];


if (!argv.p) {
	backgroundInclude.push('zotero-google-docs-integration/api.js',
		'tools/testTranslators/translatorTester_messages.js',
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
	return through.obj(async function(file, enc, cb) {
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

		// Used to identify files by pathname from src to try and prevent conflicts
		var sourcefile = parts.slice(i).join('/');
		
		// Transform react
		if (ext == 'jsx') {
			try {
				file.contents = Buffer.from(
					babel.transform(
						file.contents,
						{
							plugins: [
								'@babel/plugin-transform-react-jsx',
								'@babel/plugin-proposal-class-properties'
							]
						}
					).code
				);
			} catch (e) {
				console.log(e.message);
				return;
			}
			// Remove the 'x' from '.jsx'
			parts[parts.length-1] = basename = basename.substr(0, basename.length-1);
		}
		
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
				if (process.env.ZOTERO_REPOSITORY_URL) {
					contents = contents.replace(/REPOSITORY_URL: [^,]*/,
						`REPOSITORY_URL: "${process.env.ZOTERO_REPOSITORY_URL}"`);
				}
				file.contents = Buffer.from(contents);
				break;
			case 'zotero.js':
				var contents = file.contents.toString();
				if (!argv.p) {
					contents = contents
						.replace('"debug.log": false', '"debug.log": true')
						// TODO: Replace with remote code repo URL once it is set up
						.replace('"integration.googleDocs.codeRepositoryURL": ""',
							'"integration.googleDocs.codeRepositoryURL": "http://127.0.0.1:8090/"');
				}
				contents = contents.replace(/\/\* this\.allowRepoTranslatorTester = SET IN BUILD SCRIPT \*\//,
					`this.allowRepoTranslatorTester = ${!!process.env.ZOTERO_REPOSITORY_URL}`);
				file.contents = Buffer.from(contents);
				break;
			case 'manifest.json':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*BACKGROUND SCRIPTS*/",
						backgroundIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t\t'))
					.replace("/*INJECT SCRIPTS*/",
						injectIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t\t'))
					.replace(/"version": "[^"]*"/, '"version": "' + argv.connectorVersion + '"'));
				break;
			case 'background.js':
				file.contents = Buffer.from(file.contents.toString()
					.replace("/*INJECT SCRIPTS*/", 
						injectIncludeBrowserExt.map((s) => `"${s}"`).join(',\n\t\t')));
				break;
			case 'schema.js': {
				let Zotero = { Schema: {} };
				let data = schemaJSON;
				
				//
				// Keep in sync with the client's schema.js
				//
				Zotero.Schema.CSL_TYPE_MAPPINGS = {};
				Zotero.Schema.CSL_TYPE_MAPPINGS_REVERSE = {};
				for (let cslType in data.csl.types) {
					for (let zoteroType of data.csl.types[cslType]) {
						Zotero.Schema.CSL_TYPE_MAPPINGS[zoteroType] = cslType;
					}
					Zotero.Schema.CSL_TYPE_MAPPINGS_REVERSE[cslType] = [...data.csl.types[cslType]];
				}
				Zotero.Schema.CSL_TEXT_MAPPINGS = data.csl.fields.text;
				Zotero.Schema.CSL_DATE_MAPPINGS = data.csl.fields.date;
				Zotero.Schema.CSL_NAME_MAPPINGS = data.csl.names;
				Zotero.Schema.CSL_FIELD_MAPPINGS_REVERSE = {};
				for (let cslField in data.csl.fields.text) {
					for (let zoteroField of data.csl.fields.text[cslField]) {
						Zotero.Schema.CSL_FIELD_MAPPINGS_REVERSE[zoteroField] = cslField;
					}
				}
				for (let cslField in data.csl.fields.date) {
					let zoteroField = data.csl.fields.date[cslField];
					Zotero.Schema.CSL_FIELD_MAPPINGS_REVERSE[zoteroField] = cslField;
				}
				
				file.contents = Buffer.from(file.contents.toString()
					.replace(
						"/*CSL_MAPPINGS*/",
						"CSL_TYPE_MAPPINGS: "
							+ JSON.stringify(Zotero.Schema.CSL_TYPE_MAPPINGS)
						+ ", CSL_TYPE_MAPPINGS_REVERSE: "
							+ JSON.stringify(Zotero.Schema.CSL_TYPE_MAPPINGS_REVERSE)
						+ ", CSL_TEXT_MAPPINGS: "
							+ JSON.stringify(Zotero.Schema.CSL_TEXT_MAPPINGS)
						+ ", CSL_TYPE_MAPPINGS_REVERSE: "
							+ JSON.stringify(Zotero.Schema.CSL_TYPE_MAPPINGS_REVERSE)
						+ ", CSL_DATE_MAPPINGS: "
							+ JSON.stringify(Zotero.Schema.CSL_DATE_MAPPINGS)
						+ ", CSL_NAME_MAPPINGS: "
							+ JSON.stringify(Zotero.Schema.CSL_NAME_MAPPINGS)
						+ ", CSL_FIELD_MAPPINGS_REVERSE: "
							+ JSON.stringify(Zotero.Schema.CSL_FIELD_MAPPINGS_REVERSE)
					));
				break;
			}
			case 'preferences.html':
			case 'progressWindow.html':
			case 'modalPrompt.html':
				file.contents = Buffer.from(file.contents.toString()
					.replace(/<!--BEGIN DEBUG-->([\s\S]*?)<!--END DEBUG-->/g, argv.p ? '' : '$1'));
				break;
			case 'node_modules.js':
				await new Promise((resolve) => {
					// Stream needs to be converted to a buffer because of complicated stream cloning quantum bugs
					// so we cannot just do file = browserify.bundle()
					//   Also
					// We used to be able to pass in the whole file object here before gulp 4.
					// It doesn't work anymore and produces weird minified content
					// so we pass in the file path instead which works well
					browserify(file.path).bundle((err, buf) => {file.contents = buf; resolve()});
				});
				break;
		}

		// sourcefile is relative to the src/ directory
		switch (sourcefile) {
			case 'zotero/resource/SingleFile/extension/lib/single-file/core/bg/scripts.js':
				// Change base path and add in the content scripts SingleFile recommends injecting
				// via manifest.json
				file.contents = Buffer.from(file.contents.toString()
					.replace('const basePath = "../../../";', 'const basePath = "lib/SingleFile/";')
				);

				// Override the type so we include this file in firefox and chrome builds
				type = 'browserExt';
				// Switch from resource to lib sub-directory
				parts[i+1] = 'lib';
				break;
			case 'zotero/resource/SingleFile/lib/single-file/processors/hooks/content/content-hooks-frames.js':
				// Change the path to include our particular directory structure
				file.contents = Buffer.from(file.contents.toString()
					.replace('/lib/single-file/processors/hooks/content/content-hooks-frames-web.js',
					'/lib/SingleFile/lib/single-file/processors/hooks/content/content-hooks-frames-web.js')
				);

				// Override the type so we include this file in firefox and chrome builds
				type = 'browserExt';
				// Switch from resource to lib sub-directory
				parts[i+1] = 'lib';
				break;
			case 'zotero/resource/SingleFile/lib/single-file/processors/hooks/content/content-hooks.js':
				// Change the path to include our particular directory structure
				file.contents = Buffer.from(file.contents.toString()
					.replace('/lib/single-file/processors/hooks/content/content-hooks-web.js',
						'/lib/SingleFile/lib/single-file/processors/hooks/content/content-hooks-web.js')
				);

				// Override the type so we include this file in firefox and chrome builds
				type = 'browserExt';
				// Switch from resource to lib sub-directory
				parts[i+1] = 'lib';
				break;
		}
		
		let f;
		
		// Amend paths
		if (type === 'common' || type === 'browserExt') {
			if (file.path.includes('.html')) {
				file.contents = Buffer.from(replaceScriptsHTML(
					file.contents.toString(), "<!--SCRIPTS-->", injectIncludeBrowserExt.map(s => `../../${s}`)));
			}
			['chrome', 'firefox'].forEach((browser) => {
				f = file.clone({contents: false});
				if (basename == 'zotero.js') {
					let contents = f.contents.toString()
						.replace('this.version = [^;]*', `this.version = "${argv.version}";`);
					contents = replaceBrowser(contents, { browserExt: true, firefox: browser == 'firefox' });
					f.contents = Buffer.from(contents);
				}
				f.path = parts.slice(0, i-1).join('/') + `/build/${browser}/` + parts.slice(i+1).join('/');
				console.log(`-> ${f.path.slice(f.cwd.length)}`);
				this.push(f);
			});
		}
		if (type === 'common' || type === 'safari') {
			f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/safari/' + parts.slice(i+1).join('/');
			if (basename == 'zotero.js') {
				let contents = f.contents.toString()
					.replace('this.version = [^;]*', `this.version = "${argv.version}";`);
				contents = replaceBrowser(contents, { safari: true });
				f.contents = Buffer.from(contents);
			}
			console.log(`-> ${f.path.slice(f.cwd.length)}`);
			this.push(f);
		}
		if (type === 'zotero-google-docs-integration') {
			f = file.clone({contents: false});
			f.path = parts.slice(0, i-1).join('/') + '/build/safari/zotero-google-docs-integration/'
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
	});
}

gulp.task('watch', function () {
	var watcher = gulp.watch(['./src/browserExt/**', './src/common/**', './src/safari/**',
		'./src/zotero-google-docs-integration/src/connector/**']);
	watcher.on('change', function(path) {
		gulp.src(path)
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
		'./src/common/node_modules.js',
		'./src/common/preferences/preferences.html',
		'./src/common/progressWindow/progressWindow.html',
		'./src/common/modalPrompt/modalPrompt.html',
		'./src/common/schema.js',
		'./src/common/zotero.js',
		'./src/common/zotero_config.js',
		'./src/common/test/**/*',
		'./src/**/*.jsx',
		'./src/zotero-google-docs-integration/src/connector/**',
		'./src/zotero/resource/SingleFile/extension/lib/single-file/core/bg/scripts.js',
		'./src/zotero/resource/SingleFile/lib/single-file/processors/hooks/content/content-hooks.js',
		'./src/zotero/resource/SingleFile/lib/single-file/processors/hooks/content/content-hooks-frames.js'
	];
	if (!argv.p) {
		sources.push('./src/common/test/**/*.js');	
	}
	return gulp.src(sources)
		.pipe(plumber())
		.pipe(processFile())
		.pipe(gulp.dest((data) => data.base));
});

gulp.task('watch-bookmarklet', watchBookmarklet(argv));

gulp.task('process-bookmarklet-scripts', processBookmarkletScripts(argv));

gulp.task('default', gulp.series(['watch']));
