browser.runtime.onMessage.addListener(async (message) => {
	if (message?.type === 'redirect-attachment-monitor' && message.url) {
		window.location.href = message.url;
	}
});

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
});