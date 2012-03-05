package org.zotero.BookmarkletTester;

public class Test {
	public String type;
	public String url;
	public Object input;
	public Object items;
	public boolean defer;
	
	public void setType(String x) { type = x; };
	public void setUrl(String x) { url = x; };
	public void setInput(Object x) { input = x; };
	public void setItems(Object x) { items = x; };
	public void setDefer(boolean x) { defer = x; };
	
	public String getType(String x) { return type; };
	public String getUrl(String x) { return url; };
	public Object getItems(String x) { return items; };
	public boolean getDefer(String x) { return defer; };
}
