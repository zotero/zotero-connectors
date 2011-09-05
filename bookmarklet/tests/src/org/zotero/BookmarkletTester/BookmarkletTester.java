package org.zotero.BookmarkletTester;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.LinkedList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.type.TypeReference;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.android.AndroidDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.ie.InternetExplorerDriver;
import org.openqa.selenium.iphone.IPhoneDriver;

public class BookmarkletTester {
	public static ObjectMapper mapper;
	public static String testPayload = "";
	public static Config config = null;
	public static LinkedList<TranslatorTester> translatorTesters = new LinkedList<TranslatorTester>();
	
	public static void main(String[] args) throws IOException {
		mapper = new ObjectMapper();
		
		// Load config file
		try {
			config = mapper.readValue(new File("config.json"), Config.class);
		} catch(Exception e) {
			System.err.println("Invalid configuration file");
			e.printStackTrace();
			System.exit(1);
		}
		
		// Load js inject code
		String s;
		BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(config.testPayload), "UTF-8"));
		while((s = in.readLine()) != null) {
			testPayload += s+"\n";
		}
		
		loadTranslators();
		runTests();
		mapper.writeValue(new File("testOutput.json"), translatorTesters);
	}
	
	static void loadTranslators() throws IOException {
		Pattern infoRe = Pattern.compile("^\\s*\\{[\\S\\s]*?\\}\\s*?[\\r\\n]");
		int nTests = 0;
		
		File[] translators = new File(config.translatorsDirectory).listFiles();
		for(File file : translators) {
			if(!file.getName().endsWith(".js")) {
				continue;
			}
			
			// Read file
			String s;
			String translatorContent = "";
			BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(file), "UTF-8"));
			while((s = in.readLine()) != null) {
				translatorContent += s+"\n";
			}
			
			// Cut BOM if necessary
			if(translatorContent.charAt(0) == 0xFEFF) {
				translatorContent = translatorContent.substring(1);
			}
			
			// Extract translator metadata
			Matcher m = infoRe.matcher(translatorContent);
			if(!m.find()) {
				System.err.println("Invalid translator metadata for "+file.getName()+"\n");
				System.exit(1);
			}

			Translator translator = null;
			try {
				String json = m.group();
				translator = mapper.readValue(json, Translator.class);
			} catch(Exception e) {
				System.err.println("Invalid translator metadata for "+file.getName()+"\n");
				e.printStackTrace();
				System.exit(1);
			}
			translator.code = translatorContent;
			
			// Extract translator tests
			ArrayList<Test> translatorTests;
			int testStart = translatorContent.indexOf("/** BEGIN TEST CASES **/");
			int testEnd = translatorContent.indexOf("/** END TEST CASES **/");
			if(testStart != -1 && testEnd != -1) {
				String testCode = translatorContent.substring(testStart+24, testEnd);
				testCode = testCode.replace("var testCases = ", "");
				if(testCode.endsWith(";")) {
					testCode = testCode.substring(0, -1);
				}
				translatorTests = mapper.readValue(testCode, new TypeReference<ArrayList<Test>>() {});
			} else {
				translatorTests = new ArrayList<Test>();
			}
			nTests += translatorTests.size();
			
			// Create translator tester
			TranslatorTester translatorTester = new TranslatorTester(translator, translatorTests);
			translatorTesters.add(translatorTester);
		}
		
		System.out.println("Loaded "+Integer.toString(translatorTesters.size())
				+" translators ("+Integer.toString(nTests)+" tests)");
	}
	
	static void runTests() {
		WebDriver driver;
		if(config.browser.equals("firefox")) {
			driver = new FirefoxDriver();
		} else if(config.browser.equals("chrome")) {
			System.setProperty("webdriver.chrome.driver", "chromedriver");
			driver = new ChromeDriver();
		} else if(config.browser.equals("ie")) {
			driver = new InternetExplorerDriver();
		} else if(config.browser.equals("iphone")) {
			try {
				driver = new IPhoneDriver();
			} catch(Exception e) {
				System.err.println("iPhone driver not available");
				e.printStackTrace();
				System.exit(1);
				return;
			}
		} else if(config.browser.equals("android")) {
			driver = new AndroidDriver();
		} else {
			System.out.println("Unknown browser "+config.browser);
			System.exit(1);
			return;
		}
		
		driver.manage().timeouts().setScriptTimeout(15, java.util.concurrent.TimeUnit.SECONDS);
		
		for(TranslatorTester translatorTester : translatorTesters) {
			translatorTester.runTests(driver);
		}
	}
}
