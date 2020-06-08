/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2018 Center for History and New Media
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

const fs = require('fs').promises;
const { basename, join, extname } = require('path');
const through = require('through2');
const gulp = require('gulp');
const plumber = require('gulp-plumber');
const concat = require('gulp-concat');
const babel = require('@babel/core');
const browserify = require('browserify');
const replaceBrowser = require('./replace_browser');

const xpcomDir = './src/zotero/chrome/content/zotero/xpcom';

const sources = {
	'common.js': [
		"./src/common/zotero.js",
		"./src/bookmarklet/zotero_config.js",
		"./src/common/promise.js",
		join(xpcomDir, "debug.js"),
		"./src/common/errors_webkit.js",
		"./src/common/http.js",
		join(xpcomDir, "xregexp/xregexp.js"),
		join(xpcomDir, "xregexp/addons/build.js"),
		join(xpcomDir, "xregexp/addons/matchrecursive.js"),
		join(xpcomDir, "xregexp/addons/unicode/unicode-base.js"),
		join(xpcomDir, "xregexp/addons/unicode/unicode-categories.js"),
		join(xpcomDir, "xregexp/addons/unicode/unicode-zotero.js"),
		join(xpcomDir, "utilities.js"),
		"./src/common/utilities.js",
		join(xpcomDir, "translation/translator.js"),
		"./src/bookmarklet/translators.js",
		"./src/bookmarklet/messages.js",
		"./src/bookmarklet/i18n.js",
		"./src/messages.json"
	],
	'iframe.js': [
		"./src/common/connector.js",
		join(xpcomDir, "translation/tlds.js"),
		"./src/common/messaging.js",
		"./src/bookmarklet/iframe_base.js"
	],
	'inject.js': [
		"./src/common/cachedTypes.js",
		join(xpcomDir, "date.js"),
		"./src/common/inject/http.js",
		join(xpcomDir, "openurl.js"),
		join(xpcomDir, "rdf/init.js"),
		join(xpcomDir, "rdf/uri.js"),
		join(xpcomDir, "rdf/term.js"),
		join(xpcomDir, "rdf/identity.js"),
		join(xpcomDir, "rdf/match.js"),
		join(xpcomDir, "rdf/rdfparser.js"),
		join(xpcomDir, "translation/translate.js"),
		"./src/common/translate_item.js",
		"./src/common/inject/translate_inject.js",
		"./src/zotero/resource/schema/connectorTypeSchemaData.js",
		join(xpcomDir, "utilities_translate.js"),
		"./src/bookmarklet/messaging_inject.js",
		"./src/bookmarklet/inject_base.js",
		"./src/common/inject/progressWindow_inject.js",
	],
	"progressWindow/progressWindow.js": [
		"./node_modules/react/umd/react.production.min.js",
		"./node_modules/react-dom/umd/react-dom.production.min.js",
		"./node_modules/prop-types/prop-types.min.js",
		"./node_modules/react-dom-factories/index.js",
		"./src/common/zotero.js",
		"./src/bookmarklet/zotero_config.js",
		"./src/common/ui/tree/tree.js",
		"./src/common/ui/ProgressWindow.jsx",
		"./src/common/promise.js",
		"./src/common/messages.js",
		"./src/bookmarklet/messaging_inject.js",
		"./src/common/progressWindow/progressWindow.js",
		"./src/bookmarklet/i18n.js",
		"./src/messages.json"
	],
	"progressWindow/progressWindow.html": ["./src/common/progressWindow/progressWindow.html"],
	"itemSelector/itemSelector.html": ["./src/common/itemSelector/itemSelector.html"],
	"itemSelector/itemSelector.js": [
		'./src/common/itemSelector/itemSelector.js',
		'./src/bookmarklet/itemSelector/itemSelector_browserSpecific.js'
	],
	"loader.js": ["./src/bookmarklet/loader.js"]
}

function processFile(argv) { return through.obj(async function(file, enc, cb) {
	console.log(file.path.slice(file.cwd.length));
	var fileName = basename(file.path);
	var ext = fileName.split('.')[1];
	
	switch (fileName) {
	case 'messages.json':
		file.contents = Buffer.from("Zotero.i18n.localeJSON = " + file.contents.toString());
		break;
	case 'zotero.js':
		let contents = file.contents.toString()
			.replace('this.version = [^;]*', `this.version = "${argv.version}";`);
		if (!argv.p) {
			contents = contents.replace('"debug.log": false', '"debug.log": true');
		}
		contents = replaceBrowser(contents, { bookmarklet: true });
		file.contents = Buffer.from(contents);
		break;
	case 'zotero_config.js':
		if (!argv.p) {
			file.contents = Buffer.from(file.contents.toString()
				.replace(/www\.zotero\.org/g, 'staging.zotero.net')
				.replace(/REPOSITORY_URL:.*/, 'REPOSITORY_URL: "https://www.zotero.org/repo",')
				.replace(/API_URL:.*/, 'API_URL: "https://apidev.zotero.org/",')
			);
		}
		break;
	case 'progressWindow.html':
	case 'itemSelector.html':
		file.contents = Buffer.from(file.contents.toString()
			.replace(/<!--BEGIN DEBUG-->([\s\S]*?)<!--END DEBUG-->/g, '')
			.replace(/<!--BEGIN CONNECTOR-->([\s\S]*?)<!--END CONNECTOR-->/g, '')
		);
		break;
	case 'loader.js':
		if (!argv.p) {
			file.contents = Buffer.from(file.contents.toString()
				.replace('www.zotero.org', 'staging.zotero.net'));
		} else {
			let config = await fs.readFile(join(__dirname, '../src/bookmarklet/zotero_config.js'), 'utf-8');
			let url = /BOOKMARKLET_URL: ?['"]([^'"]*)['"]/.exec(config)[1];
			file.contents = Buffer.from(file.contents.toString()
				.replace('https://www.zotero.org/bookmarklet/', url));
		}
	}

	
	var plugins = [];
	if (ext == 'jsx') {
		plugins = [
			...plugins,
			'@babel/plugin-transform-react-jsx',
			'@babel/plugin-proposal-class-properties'
		];
		try {
			file.contents = new Buffer.from(babel.transform(file.contents, { plugins }).code);
		} catch (e) {
			console.log(e.message);
			return;
		}
	}


	this.push(file.clone({contents:false})); cb();
})}

function postProcess(argv) { return through.obj(function(file, enc, cb) {
	if (extname(file.path) == '.js' && argv.p) {
		let presets = [];
		// presets = [...presets, 'env'];
		if (argv.p) {
			presets = [...presets, 'minify'];
		}
		try {
			let fileStr = file.contents;
			// if (file.path.split('.')[1] == '.js') {
			// 	fileStr = "require('regenerator-runtime/runtime');" + fileStr;
			// }
			file.contents = new Buffer.from(babel.transform(fileStr, { presets }).code);
		} catch (e) {
			console.error(e);
			return;
		}
		// browserify(file).bundle((err, buf) => {file.contents = buf; this.push(file.clone({contents: false})); cb()});
	}
	this.push(file.clone({contents: false}));
})}

function logFinalOutput() {
	return through.obj(function(file) {
		console.log(`-> ${basename(file.path)}`);
		this.push(file);
	})
}

function watchBookmarklet(argv) {return function() {
	var watcher = gulp.watch(['./src/bookmarklet/**', './src/common/**']);
	watcher.on('change', function(event) {
		for (let key in sources) {
			let shouldProcess = false;
			for (let source of sources[key]) {
				if (event.path.includes(source.substr(2))) {
					shouldProcess = true;
					break;
				}
			}
			if (shouldProcess) {
				console.log(`${event.path} changed`);
				gulp.src(sources[key])
					.pipe(plumber())
					.pipe(processFile(argv))
					.pipe(concat(key))
					.pipe(postProcess(argv))
					.pipe(logFinalOutput())
					.pipe(gulp.dest('./build/bookmarklet/'));
			}
		}
		
	});
}}

function processBookmarkletScripts(argv) {return function() {
	for (let key in sources) {
		gulp.src(sources[key]).pipe(plumber())
			.pipe(processFile(argv))
			.pipe(concat(key))
			.pipe(postProcess(argv))
			.pipe(logFinalOutput())
			.pipe(gulp.dest('./build/bookmarklet/'));
	}
}}

module.exports = {
	watchBookmarklet, processBookmarkletScripts
};
