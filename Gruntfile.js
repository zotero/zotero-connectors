module.exports = function (grunt) {
	require('load-grunt-tasks')(grunt);
	
	function reloadChromeExtensionsTab(err, stdout, stderr, cb) {
		if (err) {
			grunt.log.writeln("Not reloading Chrome extensions tab");
			cb();
			return;
		}
		
		console.log("Reloading Chrome extensions tab");
		
		var exec = require('child_process').exec;
		
		var extensionsTabMatches = stdout.match(/\[\d{1,5}:(\d{1,5})\] Extensions/);
		if (extensionsTabMatches) {
			extensionsTabID = extensionsTabMatches[1];
			
			exec('chrome-cli reload -t ' + extensionsTabID, function (err, stdout, stderr) {
				cb();
			});
		}
		else {
			exec('chrome-cli open chrome://extensions && chrome-cli reload', function (err, stdout, stderr) {
				cb();
			});
		}
	}
	
	// On OS X, reload Chrome extensions tab
	var watchTasks = ['default'];
	if (process.platform == 'darwin') {
		watchTasks.push('shell:reloadChromeExtensionsTab');
	}
	
	grunt.initConfig({
		watch: {
			scripts: {
				files: [
					'src/common/**',
					'src/chrome/**',
				],
				tasks: watchTasks
			}
		},
		shell: {
			build: {
				command: './build.sh -d',
				options: {
					stdout: true
				}
			},
			reloadChromeExtensionsTab: {
				command: 'chrome-cli list tabs',
				options: {
					callback: reloadChromeExtensionsTab,
					stdout: false
				}
			}
		}
	});
	
	grunt.registerTask('default', ['shell:build']);
};