package org.zotero.BookmarkletTester;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedList;

import org.codehaus.jackson.map.ObjectMapper;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;

class TranslatorTester {
	Translator translator;
	boolean isSupported;
	LinkedList<Test> pending, failed, succeeded, unknown;
	String output;
	
	TranslatorTester(Translator aTranslator, ArrayList<Test> aTranslatorTests) {
		translator = aTranslator;
		
		pending = new LinkedList<Test>();
		failed = new LinkedList<Test>();
		succeeded = new LinkedList<Test>();
		unknown = new LinkedList<Test>();
		
		output = "";
		
		Iterator<Test> itr = aTranslatorTests.iterator();
		while(itr.hasNext()) {
			Test translatorTest = (Test) itr.next();
			if(translatorTest.type.equals("web")) {
				pending.add(translatorTest);
			}
		}
		
		isSupported = false;
		if(translator.browserSupport.contains("b")) {
			if(BookmarkletTester.config.browser.equals("firefox")) {
				isSupported = translator.browserSupport.contains("g");
			} else if(BookmarkletTester.config.browser.equals("ie")) {
				isSupported = translator.browserSupport.contains("i");
			} else {
				isSupported = translator.browserSupport.contains("c");
			}
		}
	}
	
	void runTests(WebDriver driver) {
		ObjectMapper mapper = new ObjectMapper();
		
		int i = 0;
		while(pending.size() != 0) {
			Test test = pending.removeFirst();
			TestInfo testInfo = new TestInfo(translator, i, test);

			TestOutput testOutput;
			try {
				driver.get(test.url);
				if(test.defer) {
					Thread.sleep(10000);
				}
			
				String json = null;
				String setup = "window.zoteroSeleniumCallback = arguments[0];\n"
						+"window.zoteroSeleniumTestInfo = "+mapper.writeValueAsString(mapper.writeValueAsString(testInfo))+";\n";
				//System.out.println(setup+BookmarkletTester.testPayload);
				json = (String) ((JavascriptExecutor) driver).executeAsyncScript(setup+BookmarkletTester.testPayload);
				
				testOutput = mapper.readValue(json, TestOutput.class);
			} catch (Exception e) { 
				testOutput = new TestOutput();
				testOutput.output = e.toString();
				testOutput.status = "failed";
			}
			
			System.out.println(testOutput.output+"\n");
			output += testOutput.output+"\n\n";
			
			if(testOutput.status.equals("succeeded")) {
				succeeded.add(test);
			} else if(testOutput.status.equals("failed")) {
				failed.add(test);
			} else {
				unknown.add(test);
			}
			
			i++;
		}
	}

	public String getType() { return "web"; }
	public String getOutput() { return output; }
	public String getTranslatorID() { return translator.translatorID; }
	public String getLabel() { return translator.label; }
	public boolean getIsSupported() { return isSupported; }
	public LinkedList<Test> getPending() { return pending; }
	public LinkedList<Test> getFailed() { return failed; }
	public LinkedList<Test> getSucceeded() { return succeeded; }
	public LinkedList<Test> getUnknown() { return unknown; }
}