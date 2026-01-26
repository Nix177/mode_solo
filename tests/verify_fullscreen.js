const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.setViewport({ width: 390, height: 844, isMobile: true });

    const filePath = path.resolve(__dirname, '../index.html');
    const url = 'file://' + filePath;

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Verify button exists
    const btn = await page.$('#fullscreen-btn');
    if (!btn) {
        console.error('Fullscreen button NOT found.');
        process.exit(1);
    }
    console.log('Fullscreen button found.');

    // We can't easily verify actual fullscreen visualization in headless, 
    // but we can verify clicking it calls the function.
    // Let's spy on the window.toggleFullscreen or document.documentElement.requestFullscreen

    await page.evaluate(() => {
        // Mock requestFullscreen on Element prototype to capture all
        Element.prototype.requestFullscreen = async () => {
            window.__FS_CALLED = true;
            console.log('Mock requestFullscreen called');
        };
        // Also check if it's vendor prefixed? standard should be enough in modern puppeteer
    });

    console.log('Clicking fullscreen button...');
    await page.click('#fullscreen-btn');

    // Wait a bit for the event loop
    await new Promise(r => setTimeout(r, 500));

    const called = await page.evaluate(() => window.__FS_CALLED);
    if (called) {
        console.log('SUCCESS: Fullscreen logic triggered.');
    } else {
        console.error('FAIL: Fullscreen logic NOT triggered.');
        process.exit(1);
    }

    await browser.close();
})();
