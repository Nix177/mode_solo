const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    const filePath = path.resolve(__dirname, '../index.html');
    const url = 'file://' + filePath;

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Inject a spy on callBot text generation or just inspect the function's source logic if possible?
    // Hard to spy on private variables, but we can overwrite window.callBot since it is not exposed?
    // Wait, engine.js is a module. We can't easily access internal functions unless exposed.
    // However, sendPlayerAction IS exposed as window.sendUserMessage.

    // We will monitor the Network requests to /chat (even if they fail) to see the payload!
    // Or better, we define a mock API_BASE or intercept requests.

    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().includes('/chat')) {
            try {
                const data = JSON.parse(request.postData());
                console.log("CAPTURED PROMPT:", JSON.stringify(data.system));
                request.respond({
                    content: 'application/json',
                    body: JSON.stringify({ reply: "MOCK_REPLY" })
                });
            } catch (e) {
                console.error("Error parsing request:", e);
                request.continue();
            }
        } else {
            request.continue();
        }
    });

    // Initialize Game
    await page.evaluate(() => {
        // Mock game data to ensure we have a scene loaded
        window.loadScene('level_1');
    });

    // Wait for init
    await new Promise(r => setTimeout(r, 1000));

    // Trigger a user message
    console.log("Sending user message...");
    await page.evaluate(() => window.sendUserMessage("Je décide de tout arrêter."));

    // We rely on the console logs above to see the captured prompt.
    // We can also store it in a variable in the node process by listening to the event.

    await new Promise(r => setTimeout(r, 2000));
    await browser.close();
})();
