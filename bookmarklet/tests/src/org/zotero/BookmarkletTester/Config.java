package org.zotero.BookmarkletTester;

import java.util.ArrayList;

public class Config {
	public String translatorsDirectory, testPayload, browser;
	public ArrayList<String> exclude;
	public int concurrentTests;
	
	public void setTranslatorsDirectory(String x) { translatorsDirectory = x; };
	public void setTestPayload(String x) { testPayload = x; };
	public void setBrowser(String x) { browser = x; };
	public void setExclude(ArrayList<String> x) { exclude = x; };
	public void setConcurrentTests(int x) { concurrentTests = x; };
}
