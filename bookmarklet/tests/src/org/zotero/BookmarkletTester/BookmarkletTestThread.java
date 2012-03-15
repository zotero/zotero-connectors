package org.zotero.BookmarkletTester;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.android.AndroidDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxProfile;
import org.openqa.selenium.ie.InternetExplorerDriver;
import org.openqa.selenium.iphone.IPhoneDriver;

public class BookmarkletTestThread extends Thread {
	public void run() {
		WebDriver driver;
		if(BookmarkletTester.config.browser.equals("g")) {
			FirefoxProfile profile = new FirefoxProfile();
			profile.setPreference("permissions.default.stylesheet", 2);
			profile.setPreference("permissions.default.image", 2);
			
			driver = new FirefoxDriver();
			driver.manage().timeouts().pageLoadTimeout(600, java.util.concurrent.TimeUnit.SECONDS);
		} else if(BookmarkletTester.config.browser.equals("c")) {
			System.setProperty("sun.net.client.defaultReadTimeout", "600000");
			System.setProperty("sun.net.client.defaultConnectTimeout", "600000");
			
			driver = new ChromeDriver();
		} else if(BookmarkletTester.config.browser.equals("i")) {
			System.setProperty("sun.net.client.defaultReadTimeout", "600000");
			System.setProperty("sun.net.client.defaultConnectTimeout", "600000");
			
			driver = new InternetExplorerDriver();
		} else if(BookmarkletTester.config.browser.equals("p")) {
			try {
				driver = new IPhoneDriver();
			} catch(Exception e) {
				System.err.println("iPhone driver not available");
				e.printStackTrace();
				System.exit(1);
				return;
			}
		} else if(BookmarkletTester.config.browser.equals("a")) {
			driver = new AndroidDriver();
		} else {
			System.out.println("Unknown browser "+BookmarkletTester.config.browser);
			System.exit(1);
			return;
		}
		
		driver.manage().timeouts().setScriptTimeout(180, java.util.concurrent.TimeUnit.SECONDS);
		
		TranslatorTester translatorTester;
		while((translatorTester = BookmarkletTester.getNextTranslatorTester()) != null) {
			// Don't try to translate with excluded translators
			if(BookmarkletTester.config.exclude.contains(translatorTester.translator.translatorID)) continue;
			
			translatorTester.runTests(driver);
		}
		
		driver.quit();
	}
}
