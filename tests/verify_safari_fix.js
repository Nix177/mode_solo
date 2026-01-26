const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Set typical iPhone viewport
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // Mock user agent for iOS if we want to test that path, but first let's test the generic fallback

    const filePath = path.resolve(__dirname, '../index.html');
    const url = 'file://' + filePath;

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // 1. Verify CSS Variable --vh
    const vhVar = await page.evaluate(() => {
        return document.documentElement.style.getPropertyValue('--vh');
    });

    console.log(`--vh value: ${vhVar}`);
    if (vhVar && vhVar.endsWith('px')) {
        console.log("SUCCESS: --vh custom property is set.");
    } else {
        console.error("FAIL: --vh custom property is NOT set.");
        process.exit(1);
    }

    // 2. Verify toggleFullscreen logic structure
    const fsFunction = await page.evaluate(() => window.toggleFullscreen.toString());
    if (fsFunction.includes('navigator.userAgent') && fsFunction.includes('alert')) {
        console.log("SUCCESS: toggleFullscreen contains iOS detection.");
    } else {
        console.error("FAIL: toggleFullscreen likely missing iOS detection.");
        process.exit(1);
    }

    await browser.close();
})();
