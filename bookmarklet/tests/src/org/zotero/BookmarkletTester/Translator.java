package org.zotero.BookmarkletTester;

import java.util.Map;

public class Translator {
	public String translatorID, label, creator, target, minVersion, maxVersion, browserSupport, lastUpdated, code;
	public int translatorType, priority;
	public Map<String,Object> configOptions, displayOptions;
	public boolean inRepository;
	
	public void setTranslatorID(String x) { translatorID = x; }
	public void setLabel(String x) { label = x; }
	public void setCreator(String x) { creator = x; }
	public void setTarget(String x) { target = x; }
	public void setMinVersion(String x) { minVersion = x; }
	public void setMaxVersion(String x) { maxVersion = x; }
	public void setBrowserSupport(String x) { browserSupport = x; }
	public void setLastUpdated(String x) { lastUpdated = x; }
	public void setTranslatorType(int x) { translatorType = x; }
	public void setPriority(int x) { priority = x; }
	public void setConfigOptions(Map<String,Object> x) { configOptions = x; }
	public void setDisplayOptions(Map<String,Object> x) { displayOptions = x; }
	public void setInRepository(Object x) throws Exception {
		if(x instanceof Boolean) {
			inRepository = (Boolean) x;
		} else if(x instanceof String) {
			inRepository = x.equals("1");
		} else {
			throw new Exception("Invalid value for inRepository");
		}
	};
	
	public String getTranslatorID() { return translatorID; }
	public String getLabel() { return label; }
	public String getCreator() { return creator; }
	public String getTarget() { return target; }
	public String getMinVersion() { return minVersion; }
	public String getMaxVersion() { return maxVersion; }
	public String getBrowserSupport() { return browserSupport; }
	public String getLastUpdated() { return lastUpdated; }
	public String getCode() { return code; }
	public Integer getTranslatorType() { return translatorType; }
	public Integer getPriority() { return translatorType; }
	public Map<String,Object> getConfigOptions() { return configOptions; }
	public Map<String,Object> getDisplayOptions() { return displayOptions; }
	public Boolean getInRepository() { return inRepository; }
}
