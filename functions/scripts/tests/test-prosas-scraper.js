"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const fs = __importStar(require("fs"));
playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
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
    const browser = await playwright_extra_1.chromium.launch({ headless: true });
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
    }
    catch (e) {
        console.error("Test failed:", e);
    }
    finally {
        await browser.close();
        if (fs.existsSync(sessionFilePath)) {
            fs.unlinkSync(sessionFilePath);
        }
    }
}
runTest();
//# sourceMappingURL=test-prosas-scraper.js.map