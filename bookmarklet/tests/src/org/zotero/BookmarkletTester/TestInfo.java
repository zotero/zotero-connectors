package org.zotero.BookmarkletTester;

public class TestInfo {
	Translator translator;
	Integer testNumber;
	Test test;
	
	public TestInfo(Translator translator, Integer testNumber,
			Test test) {
		this.translator = translator;
		this.testNumber = testNumber;
		this.test = test;
	}
	
	public Translator getTranslator() { return translator; }
	public Integer getTestNumber() { return testNumber; }
	public Test getTest() { return test; }
}
