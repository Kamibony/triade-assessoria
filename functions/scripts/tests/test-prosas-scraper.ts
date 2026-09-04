import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(stealth());

async function runTest() {
    const sessionFilePath = './prosas_session.json';
    // Write a dummy cookie file that bypasses the "no cookies" check in the worker logic
    // Normally it checks if `cookies` exists and is not empty.
    fs.writeFileSync(sessionFilePath, JSON.stringify({
        cookies: [{
            name: "dummy_cookie",
            value: "123",
            domain: "prosas.com.br",
            path: "/",
            expires: Date.now() / 1000 + 86400,
            httpOnly: false,
            secure: true,
            sameSite: "Lax"
        }]
    }));

    console.log("Created dummy prosas_session.json");

    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({ storageState: sessionFilePath });
        const page = await context.newPage();

        const testUrl = 'https://prosas.com.br/editais/142981-2a-edicao-do-fundo-nossas-do-nossas-em-parceria-com-a-unicef'; // Sample valid structure for Prosas url
        console.log(`Navigating to ${testUrl}...`);

        await page.goto(testUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Wait a bit to simulate the scraping worker logic
        await page.waitForTimeout(5000);

        const pageText = await page.evaluate(() => document.body.innerText);

        console.log("Scraped text snippet:");
        console.log(pageText.substring(0, 500));

        console.log("\nSuccess: Able to navigate and extract text using Playwright stealth flow.");
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await browser.close();
        if (fs.existsSync(sessionFilePath)) {
            fs.unlinkSync(sessionFilePath);
        }
    }
}

runTest();
