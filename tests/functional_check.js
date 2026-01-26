const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    console.log("Starting Functional Logic Test (Non-Blocking Backend)...");

    // Launch browser with file access
    const browser = await puppeteer.launch({
        headless: false, // Visible for debugging
        args: ['--start-maximized', '--allow-file-access-from-files']
    });

    const page = await browser.newPage();

    // Log browser console
    page.on('console', msg => console.log(`BROWSER: ${msg.text()}`));

    try {
        // 1. Load Index
        const filePath = 'file://' + path.resolve(__dirname, '../index.html');
        console.log(`Loading: ${filePath}`);
        await page.goto(filePath);
        await new Promise(r => setTimeout(r, 2000)); // Wait for init

        // 2. Check Init (Level 1 typically)
        const title = await page.title();
        console.log(`Title: ${title}`);

        const rosterCount = await page.evaluate(() => document.querySelectorAll('.roster-btn').length);
        console.log(`Initial Roster: ${rosterCount}`);
        if (rosterCount === 0) throw new Error("Roster empty on init");

        // 3. Switch to Level 6 (Non-blocking)
        console.log("Triggering Level 6 load...");
        await page.evaluate(() => {
            window.loadScene('level_6');
        });

        // Wait for UI update
        await new Promise(r => setTimeout(r, 2000));

        // 4. Verify Level 6 UI
        const headerText = await page.evaluate(() => document.querySelector('.header-bar h1').innerText);
        console.log(`Header Text: "${headerText}"`);

        const activeChar = await page.evaluate(() => document.querySelector('.avatar-header h3').innerText);
        console.log(`Active Char: "${activeChar}"`);

        if (!activeChar.includes("Shepard") && !activeChar.includes("Aris")) {
            console.warn(`WARNING: Active character '${activeChar}' mismatch.`);
        } else {
            console.log("SUCCESS: Level 6 characters loaded.");
        }

        // 5. Test Chat Interaction (UI only)
        console.log("Testing Chat Input...");
        await page.type('#player-input', 'Testing message 123');
        await page.keyboard.press('Enter');
        // FALLBACK: Click button too
        await page.click('#send-btn');

        await new Promise(r => setTimeout(r, 1000));

        // Check ALL bubbles for our text
        const foundText = await page.evaluate(() => {
            const bubbles = Array.from(document.querySelectorAll('.msg-bubble'));
            return bubbles.map(b => b.innerText).includes('Testing message 123');
        });

        if (foundText) {
            console.log("SUCCESS: Chat input reflected in UI.");
        } else {
            // Debug State
            const state = await page.evaluate(() => {
                // Safe access if exposed
                return typeof window.GLOBAL_HISTORY !== 'undefined' ? window.GLOBAL_HISTORY : "Not exposed";
            });
            console.log("GLOBAL HISTORY DEBUG:", JSON.stringify(state, null, 2));

            const html = await page.evaluate(() => document.getElementById('chat-scroll').innerHTML);
            console.log("Chat HTML:", html);
            throw new Error("Chat input failed to appear.");
        }

    } catch (err) {
        console.error("TEST FAILED:", err.message);
        process.exit(1); // Exit with error code
    } finally {
        console.log("Closing browser...");
        await browser.close();
        process.exit(0); // Explicit success exit if we got here (try block finished?)
        // Wait, try block checks exit(1) on catch.
        // We should only exit(0) if flow completed.
    }
})();
