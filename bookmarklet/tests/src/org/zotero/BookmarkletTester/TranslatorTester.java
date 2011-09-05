package org.zotero.BookmarkletTester;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedList;

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
	}
	
	void runTests(WebDriver driver) {
		int i = 0;
		while(pending.size() != 0) {
			Test test = pending.removeFirst();
			TestInfo testInfo = new TestInfo(translator, i, test);

			TestOutput testOutput;
			try {
				driver.get(test.url);
			
				String json = null;
				String setup = "var seleniumCallback = arguments[0];\n"
						+"var seleniumTestInfo = "+BookmarkletTester.mapper.writeValueAsString(testInfo)+";\n";
				json = (String) ((JavascriptExecutor) driver).executeAsyncScript(setup+BookmarkletTester.testPayload);
			
				testOutput = BookmarkletTester.mapper.readValue(json, TestOutput.class);
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
	public int getPending() { return pending.size(); }
	public int getFailed() { return failed.size(); }
	public int getSucceeded() { return succeeded.size(); }
	public int getUnknown() { return unknown.size(); }
}