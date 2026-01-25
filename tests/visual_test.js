const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    // Launch browser in HEADFUL mode so the user can see it
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null, // Allows resizing
        args: ['--start-maximized', '--allow-file-access-from-files'] // Allow local fetch
    });

    const page = await browser.newPage();

    // 1. Open the local file
    // Note: Windows path handling
    const filePath = 'file://' + path.resolve(__dirname, '../index.html');
    console.log(`Opening: ${filePath}`);
    await page.goto(filePath);

    // 2. Initial PC View
    console.log("Viewing Desktop Layout...");
    await new Promise(r => setTimeout(r, 2000)); // Pause for viewing

    // 3. Switch to Level 2 (Art AI)
    console.log("Switching to Level 2...");
    await page.evaluate(() => {
        window.loadScene('level_2');
    });
    await new Promise(r => setTimeout(r, 3000)); // Pause to see characters

    // 4. Resize to Mobile
    console.log("Resizing to Mobile (iPhone size)...");
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1000)); // Wait for transition

    // Scroll down a bit to show flow
    await page.evaluate(() => {
        window.scrollBy(0, 200);
    });

    await new Promise(r => setTimeout(r, 4000)); // Pause to verify

    console.log("Test Complete. Closing in 5 seconds.");
    await new Promise(r => setTimeout(r, 5000));

    await browser.close();
})();
