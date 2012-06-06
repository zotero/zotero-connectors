#!/usr/bin/ruby
require 'rubygems'
require 'rack'
require 'json'

# Start server for test payload
if ARGV.length > 0
	config_file = ARGV[0]
else
	config_file = "config.json"
end
$config = JSON.parse(File.read(config_file))
payload = [File.read($config["testPayload"])]
Rack::Handler::WEBrick.run proc {|env| [200, {"Content-Type" => "application/javascript"}, payload]}, :Port => 31330