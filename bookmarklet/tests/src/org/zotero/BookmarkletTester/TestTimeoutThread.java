package org.zotero.BookmarkletTester;

import org.openqa.selenium.WebDriver;

public class TestTimeoutThread extends Thread {
	final private int timeout;
	final private WebDriver driver;
	volatile boolean timedOut = false; 

	public TestTimeoutThread(int seconds, WebDriver driver) {
		this.timeout = seconds;
		this.driver = driver;
	}

	public void run() {
		try {
			Thread.sleep(timeout * 1000);
			driver.close();
		} catch (InterruptedException ex) {
			return;
		}
	}
}