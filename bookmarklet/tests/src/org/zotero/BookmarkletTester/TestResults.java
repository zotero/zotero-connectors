package org.zotero.BookmarkletTester;

import java.util.LinkedList;

class TestResults {
	LinkedList<TranslatorTester> results;
	String browser, version;
	
	TestResults(String aBrowser, String aVersion, LinkedList<TranslatorTester> aTranslatorTesters) {
		browser = aBrowser;
		version = aVersion;
		results = aTranslatorTesters;
	}
	
	public String getBrowser() { return browser; };
	public String getVersion() { return version; };
	public LinkedList<TranslatorTester> getResults() { return results; };
}
