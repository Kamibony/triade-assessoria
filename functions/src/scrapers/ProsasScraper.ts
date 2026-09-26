import { IScraperStrategy } from './interfaces.js';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { chromium } from 'playwright-extra';
import chromiumSparticuz from '@sparticuz/chromium';
import stealth from 'puppeteer-extra-plugin-stealth';

const prosasUsernameSecret = defineSecret('PROSAS_USERNAME');
const prosasPasswordSecret = defineSecret('PROSAS_PASSWORD');

export class ProsasScraper implements IScraperStrategy {
    public readonly stateDocId = 'prosas';

    async getWatermark(): Promise<string | null> {
        const db = getFirestore();
        const doc = await db.collection('scraper_state').doc(this.stateDocId).get();
        if (!doc.exists) return null;
        return doc.data()?.lastSuccessfulScrapeTimestamp || null;
    }

    async fetchDelta(): Promise<any[]> {
        const watermark = await this.getWatermark();
        let watermarkDate = watermark ? new Date(watermark) : new Date(0);

        // 7-day Lookback Window
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (watermarkDate < sevenDaysAgo) {
             watermarkDate = sevenDaysAgo;
        }

        const username = prosasUsernameSecret.value();
        const password = prosasPasswordSecret.value();

        if (!username || !password) {
            throw new Error("[ProsasScraper] PROSAS_USERNAME or PROSAS_PASSWORD environment variables are not set.");
        }

        logger.info("[ProsasScraper] Initiating unified in-function Playwright authentication...");

        chromium.use(stealth());
        let browser: any;
        let context: any;

        try {
            browser = await chromium.launch({
                args: chromiumSparticuz.args,
                executablePath: await chromiumSparticuz.executablePath(),
                headless: true,
            });
            context = await browser.newContext();
            const page = await context.newPage();

            logger.info('[ProsasScraper] Navigating to login page...');
            await page.goto('https://prosas.com.br/users/sign_in', { waitUntil: 'networkidle', timeout: 60000 });

            logger.info('[ProsasScraper] Filling credentials...');
            await page.locator('#user_email').last().waitFor({ state: 'visible', timeout: 30000 });
            await page.locator('#user_email').last().fill(username);
            await page.locator('#user_password').last().fill(password);

            logger.info('[ProsasScraper] Submitting form...');
            await page.locator('input[type="submit"][name="commit"]').last().click();

            await page.waitForLoadState('networkidle');
            // Give it a moment to complete any redirect/cookie setting
            await page.waitForTimeout(5000);

            // Wait until we are no longer on the login page or a logged-in indicator is present.
            // If we are still on the login page after waiting, it likely failed.
            if (page.url().includes('/users/sign_in')) {
                throw new Error("[ProsasScraper] Failed to navigate past login page. Authentication likely failed.");
            }

            logger.info("[ProsasScraper] Authentication successful. Proceeding to fetch data in-browser.");

            let pageNum = 1;
            const allItems: any[] = [];
            const maxPages = 50;
            let debugCounter = 0;

            while (pageNum <= maxPages) {
                const fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${pageNum}&page%5Bsize%5D=20&&sort=`;

                try {
                    await page.goto(fetchUrl, { waitUntil: 'networkidle', timeout: 60000 });

                    const rawText = await page.evaluate(() => document.body.innerText);

                    let data: any = {};
                    try {
                        data = JSON.parse(rawText);
                    } catch (e) {
                        if (rawText.includes("Forbidden") || rawText.includes("403")) {
                             throw new Error(`[ProsasScraper] 403 Forbidden: WAF block or session expired during API fetch on page ${pageNum}`);
                        }
                        logger.error(`[ProsasScraper] Failed to parse JSON from Prosas API response: ${rawText.substring(0, 200)}...`, e);
                        throw new Error("Failed to parse JSON from Prosas API response");
                    }

                    const items = data.data || [];

                    if (items.length === 0) {
                         break; // No more items
                    }

                    for (const item of items) {
                         const itemDateString = item.attributes?.created_at || item.created_at;

                         if (itemDateString) {
                             const itemDate = new Date(itemDateString);
                             if (pageNum === 1 && debugCounter < 5) {
                                 logger.info(`[ProsasScraper Debug] Raw: ${itemDateString} | Parsed: ${itemDate} | Watermark: ${watermarkDate} | Keep?: ${itemDate > watermarkDate}`);
                                 debugCounter++;
                             }
                             if (itemDate > watermarkDate) {
                                 allItems.push(item);
                             }
                         } else {
                             if (pageNum === 1 && debugCounter < 5) {
                                 logger.info(`[ProsasScraper Debug] Raw: null/undefined | Parsed: N/A | Watermark: ${watermarkDate} | Keep?: true (default)`);
                                 debugCounter++;
                             }
                             allItems.push(item);
                         }
                    }
                    pageNum++;

                    // Add a small delay to avoid hitting rate limits
                    await page.waitForTimeout(500);
                } catch (e) {
                    logger.error(`[ProsasScraper] Error fetching delta for page ${pageNum}:`, e);
                    throw e; // re-throw to orchestrator
                }
            }

            return allItems;
        } finally {
            if (context) await context.close();
            if (browser) await browser.close();
            logger.info("[ProsasScraper] Playwright browser and context closed safely.");
        }
    }

    async extractRaw(item: any): Promise<any> {
        const url = `https://prosas.com.br/editais/${item.id}`;
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const externalProviderId = `prosas_${item.id || hash}`;

        return {
            externalProviderId,
            url,
            rawPayload: item,
            title: item.attributes?.name || item.name || '',
        };
    }
}
