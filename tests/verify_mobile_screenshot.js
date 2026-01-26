const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
    });
    const page = await browser.newPage();

    await page.setViewport({ width: 390, height: 844, isMobile: true });

    const filePath = path.resolve(__dirname, '../index.html');
    const url = 'file://' + filePath;

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });

    try {
        await page.waitForSelector('#roster-bar', { timeout: 5000 });
        console.log('Roster loaded.');
    } catch (e) {
        console.error('Timeout waiting for roster.');
    }

    try {
        await page.waitForSelector('.chat-box', { timeout: 5000 });
        console.log('Chat box loaded.');
    } catch (e) {
        console.error('Timeout waiting for chat box.');
    }

    try {
        await page.type('#player-input', 'Testing input visibility on mobile...');
        console.log('Typed text into input.');
    } catch (e) {
        console.error('Error typing into input:', e);
    }

    await page.evaluate(() => {
        const chatBox = document.querySelector('.chat-box');
        if (!chatBox) {
            console.error('Chat box not found in evaluate!');
            return;
        }
        for (let i = 0; i < 10; i++) {
            const div = document.createElement('div');
            div.className = 'message-bubble bot';
            div.innerText = `Filler message ${i} to test scrolling and overlap.`;
            chatBox.appendChild(div);
        }
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    console.log('Added filler messages.');

    // Wait a moment for rendering
    await new Promise(r => setTimeout(r, 1000));

    // Take screenshot
    const screenshotPath = path.resolve(__dirname, 'mobile_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved to ${screenshotPath}`);

    await browser.close();
})();
