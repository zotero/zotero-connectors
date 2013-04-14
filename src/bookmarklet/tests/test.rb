#!/usr/bin/ruby
require 'rubygems'
require 'json'
require 'thread'

TIMEOUT = 120

def run_tests(browser, translator_path)
	translator_code = File.read(translator_path)
	translator = JSON.parse(/^\s*\{[\S\s]*?\}\s*?[\r\n]/.match(translator_code)[0])
	translator["code"] = translator_code
	tests = /\/\*\* BEGIN TEST CASES \*\*\/\s*var testCases =\s*([\s\S]*?)\s*\/\*\* END TEST CASES \*\*\//.match(translator_code)
	if tests
		begin
			tests = JSON.parse(tests[1])
		rescue
			tests = []
		end
	else
		tests = []
	end
	
	if !translator["browserSupport"]
		translator["browserSupport"] = "g"
	end
	
	test_result = {
		'type' => 'web',
		'output' => "",
		'translatorID' => translator["translatorID"],
		'label' => translator["label"],
		'isSupported' => (translator["browserSupport"].include? $config["browser"]) \
			&& (translator["browserSupport"].include? "b"),
		'pending' => [],
		'failed' => [],
		'succeeded' => [],
		'unknown' => []
	}
	
	test_number = 1
	tests.each { |test|
		if test['type'] != 'web'
			next
		end
		
		test_info = {
			'translator' => translator,
			'testNumber' => test_number,
			'test' => test
		};
		
		test_output = nil
		begin
			Timeout::timeout(TIMEOUT) {
				browser.goto(test["url"])
				script = "window.zoteroSeleniumTestInfo = #{test_info.to_json.to_json};\n#{$inject_string}"
				if $config["browser"] == "i"
					browser.document.parentWindow.execScript(script)
				else
					browser.execute_script(script)
				end
				while !browser.div(:id, 'zoteroWatirResult').exists?
					sleep(1)
				end
				test_output = JSON.parse(browser.div(:id, 'zoteroWatirResult').text)
			}
		rescue Exception => e
			test_output = {
				'status' => 'failed',
				'output' => "#{translator["label"]} Test #{test_number}: failed (#{e})"
			};
		end
		
		print test_output['output']+"\n\n"
		$stdout.flush
		test_result['output'] << test_output['output']+"\n\n"
		test_result[test_output['status']] << test
		
		test_number += 1
	}
	
	return test_result
end

def get_browser()	
	if $config["browser"] == "i"
		require 'watir'
	else
		require 'watir-webdriver'		
		require 'selenium-webdriver'
	end
	
	if $config["browser"] == "i"
		browser = Watir::Browser.new
	elsif $config["browser"] == "g"
		browser = Watir::Browser.new(Selenium::WebDriver.for(:firefox, :profile => "default"))
	elsif $config["browser"] == "c"
		browser = Watir::Browser.new(Selenium::WebDriver.for(:chrome))
	elsif $config["browser"] == "s"
		browser = Watir::Browser.new(Selenium::WebDriver.for(:safari))
	end
end

if ARGV.length > 0
	config_file = ARGV[0]
else
	config_file = "config.json"
end

if ARGV.length > 1
	test_results_file = ARGV[1]
else
	test_results_file = "testResults.json"
end

$config = JSON.parse(File.read(config_file))
# Set up inject string
inject_script = "http://127.0.0.1:23119/provo/bookmarklet/tests/inject" + ($config["browser"] == "i" ? "_ie" : "") + "_test.js"
$inject_string = <<EOS
new function() {
	var tag = document.body || document.documentElement;
	window.zoteroSeleniumCallback = function(arg) {
		var div = document.createElement("div");
		div.id = "zoteroWatirResult";
		div.appendChild(document.createTextNode(arg));
		tag.appendChild(div);
	};
	var iframe = document.createElement("iframe")
	iframe.id = "zotero-iframe"
	iframe.style.visibility = "hidden";
	iframe.setAttribute("frameborder", "0");
	iframe.src = 'javascript:(function(){document.open();try{window.parent.document;}catch(e){document.domain="'+document.domain.replace(/[\\\\\\"]/g, "\\\\$0")+'";}document.write(\\'<!DOCTYPE html><html><head><script src="#{inject_script}"></script></head><body></body></html>\\');document.close();})()';
	tag.appendChild(iframe);
}
undefined;
EOS

# Hack for Ruby Unicode path brokenness on Windows
if ((RUBY_PLATFORM.downcase.include? "mswin") || (RUBY_PLATFORM.downcase.include? "mingw"))
	translator_paths = Dir.entries($config["translatorsDirectory"], {:encoding => 'UTF-8'})
else
	translator_paths = Dir.entries($config["translatorsDirectory"])
end

translator_paths = translator_paths.find_all { |f| f[0] != "." && f[-3..-1] == ".js" } \
	.map { |f| File.join($config["translatorsDirectory"], f) }

test_results = {
	"browser" => $config["browser"],
	"version" => $config["version"],
	"results" => []
}

# Only run in a separate thread if concurrentTests != 1, since threads appear to cause problems
# with IE
if $config["concurrentTests"] == 1
	browser = get_browser()
	while (translator_path = translator_paths.shift)
		test_results["results"] << run_tests(browser, translator_path)
	end
	browser.close
else
	semaphore = Mutex.new
	threads = []
	$config["concurrentTests"].times {
		threads << Thread.new {
			_browser = nil
			semaphore.synchronize { _browser = get_browser() }
			while (translator_path = translator_paths.shift)
				test_results["results"] << run_tests(_browser, translator_path)
			end
			_browser.close
		}
	}
	threads.each { |thr| thr.join }
end

test_results["results"].sort! { |a, b| a["label"].downcase <=> b["label"].downcase }
File.open(test_results_file, "w") { |f| f.write(test_results.to_json) }