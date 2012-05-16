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
		test_result['output'] << test_output['output']+"\n\n"
		test_result[test_output['status']] << test
		
		test_number += 1
	}
	
	return test_result
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
payload = File.read($config["testPayload"])
$inject_string = <<EOS
new function() {
	var a = (document.body ? document.body : document.documentElement);
	window.zoteroSeleniumCallback = function(arg) {
		var div = document.createElement("div");
		div.id = "zoteroWatirResult";
		div.appendChild(document.createTextNode(arg));
		a.appendChild(div);
	};
	var f = document.createElement('iframe'),
		code = #{payload.to_json};
	f.id = 'zotero-iframe';
	f.style.display = 'inline';
	f.style.width = '1px';
	f.style.height = '1px';
	f.style.borderStyle = 'none';
	f.setAttribute('frameborder', '0');
	a.appendChild(f);
	var init = function() {
		var d = f.contentWindow.document, s = d.createElement('script');
		s.type = 'text/javascript';
		if(s.canHaveChildren === false) {
			s.text = code;
		} else {
			s.appendChild(d.createTextNode(code));
		}
		(d.body ? d.body : d.documentElement).appendChild(s);
	}
	if(f.contentWindow.document.readyState === 'complete') {
		init();
	} else {
		f.onload = init;
	}
}
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

if $config["browser"] == "i"
	require 'watir'
else
	require 'watir-webdriver'
end

semaphore = Mutex.new

threads = []
$config["concurrentTests"].times {
	threads << Thread.new {
		_browser = nil
		semaphore.synchronize {
			if $config["browser"] == "i"
				_browser = Watir::IE.new
			elsif $config["browser"] == "g"
				_browser = Watir::Browser.new("firefox")
			elsif $config["browser"] == "c"
				_browser = Watir::Browser.new("chrome")
			elsif $config["browser"] == "s"
				_browser = Watir::Browser.new("safari")
			end
		}
		
		while (translator_path = translator_paths.shift)
			test_results["results"] << run_tests(_browser, translator_path)
		end
		
		_browser.close
	}
}
threads.each { |thr| thr.join }

File.open(test_results_file, "w") { |f| f.write(test_results.to_json) }