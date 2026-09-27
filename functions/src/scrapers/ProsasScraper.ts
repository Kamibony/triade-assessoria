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

            logger.info("[ProsasScraper] Authentication successful. Proceeding to fetch data via UI network interception on /editais...");

            const allItems: any[] = [];
            let currentPage = 1;
            const maxPages = 50;
            let hasMore = true;

            const waitNextApiResponse = () => page.waitForResponse(
                (response: any) => response.url().includes('selecao/api/v2/third_party/oportunidades/inscricoes_abertas') && response.request().method() === 'GET',
                { timeout: 30000 }
            ).then(async (res: any) => {
                if (!res.ok()) {
                    if (res.status() === 403) throw new Error("403_FORBIDDEN");
                    throw new Error(`API returned HTTP ${res.status()}`);
                }
                return res.json();
            });

            let apiPromise = waitNextApiResponse();
            await page.goto('https://prosas.com.br/editais', { waitUntil: 'networkidle', timeout: 60000 });

            while (currentPage <= maxPages && hasMore) {
                try {
                    const data = await apiPromise;
                    const items = data.data || [];
                    if (items.length === 0) {
                        hasMore = false;
                        break;
                    }
                    allItems.push(...items);
                    logger.info(`[ProsasScraper] Captured page ${currentPage} with ${items.length} items.`);

                    // Set up the promise BEFORE clicking to avoid race conditions
                    const nextApiPromise = waitNextApiResponse();

                    const nextClicked = await page.evaluate(() => {
                        const component = document.querySelector('prosas-listagem-editais');
                        if (component && component.shadowRoot) {
                            const buttons = component.shadowRoot.querySelectorAll('button');
                            for (const btn of buttons) {
                                if (btn.querySelector('svg') && btn.innerHTML.includes('M.29.71a.996.996 0 0 0 0 1.41L4.17 6 .29 9.88') && !btn.disabled) {
                                    btn.click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    });

                    if (nextClicked) {
                        apiPromise = nextApiPromise;
                        currentPage++;
                        await page.waitForTimeout(1000); // polite delay
                    } else {
                        // We didn't click next, so we don't need to await this promise. We can just ignore it.
                        // Playwright will eventually timeout the promise, but we'll break out of the loop anyway.
                        // To avoid unhandled rejection warnings from Playwright, we can catch it.
                        nextApiPromise.catch(() => {});
                        logger.info("[ProsasScraper] No active 'Next' button found. Ending pagination.");
                        hasMore = false;
                    }
                } catch (e: any) {
                    if (e.message && e.message.includes("403_FORBIDDEN")) {
                        throw new Error(`[ProsasScraper] 403 Forbidden: WAF block or session expired during UI network interception on page ${currentPage}`);
                    }
                    logger.error(`[ProsasScraper] Failed to intercept or parse API for page ${currentPage}:`, e);
                    throw new Error("Failed to intercept/parse JSON from Prosas API");
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
