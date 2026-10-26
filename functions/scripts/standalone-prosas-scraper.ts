import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

async function runStandaloneScraper() {
    const username = process.env.PROSAS_USERNAME;
    const password = process.env.PROSAS_PASSWORD;

    if (!username || !password) {
        throw new Error("[StandaloneProsasScraper] PROSAS_USERNAME or PROSAS_PASSWORD environment variables are not set.");
    }

    console.log("[StandaloneProsasScraper] Initiating standalone Playwright authentication...");

    chromium.use(stealth());
    let browser: any;
    let context: any;

    try {
        browser = await chromium.launch({
            headless: true,
        });
        context = await browser.newContext();
        const page = await context.newPage();

        console.log('[StandaloneProsasScraper] Navigating to login page...');
        await page.goto('https://prosas.com.br/users/sign_in', { waitUntil: 'networkidle', timeout: 60000 });

        console.log('[StandaloneProsasScraper] Filling credentials...');
        await page.locator('#user_email').last().waitFor({ state: 'visible', timeout: 30000 });
        await page.locator('#user_email').last().fill(username);
        await page.locator('#user_password').last().fill(password);

        console.log('[StandaloneProsasScraper] Submitting form...');
        await page.locator('input[type="submit"][name="commit"]').last().click();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);

        if (page.url().includes('/users/sign_in')) {
            throw new Error("[StandaloneProsasScraper] Failed to navigate past login page. Authentication likely failed.");
        }

        console.log("[StandaloneProsasScraper] Authentication successful. Proceeding to fetch data via UI network interception on /editais...");

        const allItems: any[] = [];
        let currentPage = 1;
        const maxPages = 50;
        let hasMore = true;

        const seenUrls = new Set<string>();

        const waitNextApiResponse = () => page.waitForResponse(
            (response: any) => {
                const url = response.url();
                return url.includes('selecao/api/v2/third_party/oportunidades/inscricoes_abertas') &&
                       response.request().method() === 'GET' &&
                       !seenUrls.has(url);
            },
            { timeout: 30000 }
        ).then(async (res: any) => {
            if (!res.ok()) {
                if (res.status() === 403) throw new Error("403_FORBIDDEN");
                throw new Error(`API returned HTTP ${res.status()}`);
            }
            seenUrls.add(res.url());
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

                if (allItems.length > 0 && JSON.stringify(allItems.slice(-items.length)) === JSON.stringify(items)) {
                    console.warn(`[StandaloneProsasScraper] Page ${currentPage} returned duplicate items. Stopping pagination.`);
                    hasMore = false;
                    break;
                }

                allItems.push(...items);
                console.log(`[StandaloneProsasScraper] Captured page ${currentPage} with ${items.length} items.`);

                await page.waitForTimeout(1000);

                const nextApiPromise = waitNextApiResponse();

                const nextClicked = await page.evaluate(() => {
                    const component = document.querySelector('prosas-listagem-editais');
                    if (component && component.shadowRoot) {
                        const buttons = component.shadowRoot.querySelectorAll('button');
                        const matchingButtons = Array.from(buttons).filter((btn: any) => {
                            return btn.querySelector('svg') &&
                                   btn.innerHTML.includes('M.29.71a.996.996 0 0 0 0 1.41L4.17 6 .29 9.88') &&
                                   !btn.disabled;
                        });

                        if (matchingButtons.length > 0) {
                            const nextBtn = matchingButtons[matchingButtons.length - 1] as HTMLElement;
                            nextBtn.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (nextClicked) {
                    apiPromise = nextApiPromise;
                    currentPage++;
                    await page.waitForTimeout(1000);
                } else {
                    nextApiPromise.catch(() => {});
                    console.log("[StandaloneProsasScraper] No active 'Next' button found. Ending pagination.");
                    hasMore = false;
                }
            } catch (e: any) {
                if (e.message && e.message.includes("403_FORBIDDEN")) {
                    throw new Error(`[StandaloneProsasScraper] 403 Forbidden: WAF block or session expired during UI network interception on page ${currentPage}`);
                }
                console.warn(`[StandaloneProsasScraper] Expected timeout or non-fatal error waiting for page ${currentPage}. Likely reached end of list. Error:`, e.message);
                hasMore = false;
                break;
            }
        }

        console.log(`[StandaloneProsasScraper] Interception phase complete. Found ${allItems.length} items.`);

        const uniqueMap = new Map<string, any>();
        allItems.forEach(item => uniqueMap.set(String(item.id), item));
        const deduplicatedItems = Array.from(uniqueMap.values());
        console.log(`[StandaloneProsasScraper] Deduplication complete. Found ${deduplicatedItems.length} unique items.`);

        const maxDeepScrape = process.env.MAX_DEEP_SCRAPE ? parseInt(process.env.MAX_DEEP_SCRAPE, 10) : 450;
        console.log(`[StandaloneProsasScraper] Starting deep scraping phase for up to ${maxDeepScrape} items...`);

        const itemsToDeepScrape = deduplicatedItems.slice(0, maxDeepScrape);
        const concurrency = 2; 
        let processedCount = 0;
        const totalItems = itemsToDeepScrape.length;
        const outPath = path.join(__dirname, '..', 'editais_prosas.json');

        const queue = [...itemsToDeepScrape];

        await Promise.all(
            Array.from({ length: concurrency }).map(async () => {
                while (queue.length > 0) {
                    const item = queue.shift();
                    if (!item) break;

                    const currentIndex = ++processedCount;
                    const detailUrl = `https://prosas.com.br/editais/${item.id}`;
                    
                    let workerPage: any = null;
                    try {
                        workerPage = await context.newPage();
                        await workerPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

                        let pageText = '';

                        for (let poll = 0; poll < 10; poll++) {
                            await workerPage.waitForTimeout(1000);
                            
                            const extracted = await workerPage.evaluate(() => {
                                let text = document.body.innerText || '';
                                const list = document.querySelector('prosas-listagem-editais');
                                const detail = document.querySelector('prosas-detalhe-edital') || document.querySelector('prosas-oportunidade-detalhes');

                                if (list && list.shadowRoot) text += '\n' + (list.shadowRoot.textContent || '');
                                if (detail && detail.shadowRoot) text += '\n' + (detail.shadowRoot.textContent || '');

                                let externalLink = '';

                                // Plochý prístup bez akýchkoľvek vnútorných funkcií (vyhnutie sa esbuild __name chybe)
                                const roots = [document];
                                if (detail && detail.shadowRoot) roots.push(detail.shadowRoot as any);
                                if (list && list.shadowRoot) roots.push(list.shadowRoot as any);

                                for (let i = 0; i < roots.length; i++) {
                                    if (!roots[i]) continue;
                                    const links = (roots[i] as any).querySelectorAll('a');
                                    for (let j = 0; j < links.length; j++) {
                                        const a = links[j] as HTMLAnchorElement;
                                        const btnText = (a.textContent || '').toLowerCase();
                                        // Hľadáme tlačidlo s textom Acessar
                                        if (btnText.includes('acessar') && a.href) {
                                            externalLink = a.href;
                                            break;
                                        }
                                    }
                                    if (externalLink) break;
                                }

                                return {
                                    text: text.replace(/\n\s*\n/g, '\n').replace(/ {2,}/g, ' ').trim(),
                                    externalLink: externalLink,
                                    hasDetail: !!detail
                                };
                            });

                            pageText = extracted.text;
                            if (extracted.externalLink) {
                                pageText += `\n\nEXTERNAL_EDITAL_LINK: ${extracted.externalLink}`;
                            }

                            if (pageText.length > 4000 || (extracted.hasDetail && pageText.length > 500) || extracted.externalLink) {
                                break;
                            }
                        }

                        console.log(`[StandaloneProsasScraper] Deep scraping (${currentIndex}/${totalItems}): ${detailUrl} -> Extracted ${pageText.length} chars`);

                        if (pageText.length > 15000) {
                            pageText = pageText.substring(0, 15000);
                        }

                        item.full_text = pageText;

                    } catch (err: any) {
                        console.error(`[StandaloneProsasScraper] Failed to deep scrape ${detailUrl}: ${err.message}`);
                    } finally {
                        if (workerPage) await workerPage.close();
                    }

                    if (currentIndex % 25 === 0) {
                        fs.writeFileSync(outPath, JSON.stringify(deduplicatedItems, null, 2));
                        console.log(`[StandaloneProsasScraper] Checkpoint saved at item ${currentIndex}`);
                    }
                }
            })
        );

        console.log(`[StandaloneProsasScraper] Deep scraping phase complete. Writing final output to editais_prosas.json...`);
        fs.writeFileSync(outPath, JSON.stringify(deduplicatedItems, null, 2));
        console.log(`[StandaloneProsasScraper] Done! Saved to ${outPath}`);

    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
        console.log("[StandaloneProsasScraper] Playwright browser and context closed safely.");
    }
}

runStandaloneScraper().catch((err) => {
    console.error("[StandaloneProsasScraper] Fatal error:", err);
    process.exit(1);
});
