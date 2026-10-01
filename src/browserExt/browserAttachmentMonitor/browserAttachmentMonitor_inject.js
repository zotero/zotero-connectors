browser.runtime.onMessage.addListener(async (message) => {
	if (message?.type === 'redirect-attachment-monitor' && message.url) {
		window.location.href = message.url;
	}
});

window.addEventListener('load', async () => {
	const success = window.location.hash === '#success';
	try {
		await browser.runtime.sendMessage({
			type: 'attachment-monitor-loaded',
			success
		});
	}
	catch (e) { }
});