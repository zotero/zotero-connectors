(async function() {
	window.addEventListener('load', async () => {
		const match = /success=(.*)/.exec(window.location.hash);
		const success = match ? match[1] : false;
		try {
			await browser.runtime.sendMessage({
				type: 'attachment-monitor-loaded',
				success
			});
		}
		catch (e) { }
		// Sanity wait for DNR to be updated in the background
		await new Promise(resolve => setTimeout(resolve, 200));
		const urlMatch = new URLSearchParams(window.location.hash.slice(1)).get('url');
		if (urlMatch) {
			window.location.href = decodeURIComponent(urlMatch);
		}
	});
})(); 