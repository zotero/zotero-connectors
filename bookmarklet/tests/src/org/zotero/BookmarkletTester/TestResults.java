package org.zotero.BookmarkletTester;

import java.util.LinkedList;

class TestResults {
	LinkedList<TranslatorTester> translatorTesters;
	String browser, version;
	
	TestResults(String aBrowser, String aVersion, LinkedList<TranslatorTester> aTranslatorTesters) {
		browser = aBrowser;
		version = aVersion;
		translatorTesters = aTranslatorTesters;
	}
	
	public String getBrowser() { return browser; };
	public String getVersion() { return version; };
	public LinkedList<TranslatorTester> getTranslatorTesters() { return translatorTesters; };
}
