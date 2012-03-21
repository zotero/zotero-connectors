package org.zotero.BookmarkletTester;

public class TestTimeoutThread extends Thread {
	final private int timeout;
	final private Thread watchingThread;

	public TestTimeoutThread(int seconds, Thread watchingThread) {
		this.timeout = seconds;
		this.watchingThread = watchingThread;
	}

	public void run() {
		try {
			Thread.sleep(timeout * 1000);
			this.watchingThread.interrupt();
		} catch (InterruptedException ex) {
			return;
		}
	}
}