import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

/**
 * Simulates a physical user click on the "Acessar" or "Inscreva-se" button
 * nested inside Shadow DOMs, and captures the resulting external URL.
 *
 * @param {import('playwright').Page} page - The current Playwright page.
 * @param {import('playwright').BrowserContext} context - The Playwright browser context.
 * @returns {Promise<string|null>} - The external URL, or null if failed/timed out.
 */
async function captureExternalUrl(page: any, context: any): Promise<string | null> {
  try {
    // 1. Locate the target button.
    // Playwright natively pierces Shadow DOMs automatically.
    // We use getByText to find the deepest node containing our target words,
    // explicitly filtering out the global header button via regex.
    const targetButton = page.getByText(/(acessar|inscreva-se)/i)
      .filter({ hasNotText: /acessar perfil/i })
      .first();

    // Check if the button actually exists and is visible on the page
    if (!(await targetButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      return null;
    }

    const currentUrl = page.url();
    let isResolved = false;

    // 2. Prepare listeners BEFORE clicking, to catch both navigation scenarios

    // Scenario A: The click opens an external link in a new tab/window
    const newPagePromise = context.waitForEvent('page', { timeout: 5000 })
      .then(async (newPage: any) => {
        if (isResolved) {
          // If the race was already won (e.g. by a timeout), clean up this late-arriving tab
          await newPage.close().catch(() => {});
          return null;
        }
        // Wait briefly for the new tab to process any immediate redirects
        await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        const url = newPage.url();
        await newPage.close().catch(() => {}); // Clean up the popup to avoid memory leaks
        return url;
      })
      .catch(() => null); // Catch timeouts to prevent Unhandled Rejection errors

    // Scenario B: The click triggers a direct navigation/redirect in the same tab
    const navigationPromise = page.waitForURL((url: URL) => url.href !== currentUrl, { timeout: 5000 })
      .then(() => page.url())
      .catch(() => null);

    // Scenario C: Graceful fallback timeout (5 seconds max wait)
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));

    // 3. Execute the physical click
    // We use force: true to bypass any transparent overlays often found in Web Components
    await targetButton.click({ force: true, timeout: 3000 }).catch(() => {});

    // 4. Race the outcomes to dynamically return whichever happens first
    const resultingUrl = await Promise.race([
      // If a promise resolved to null (it timed out internally), we replace it
      // with a never-resolving promise so it doesn't mistakenly win the race.
      newPagePromise.then((url: string | null) => url ? url : new Promise<null>(() => {})),
      navigationPromise.then((url: string | null) => url ? url : new Promise<null>(() => {})),
      timeoutPromise
    ]);

    // Flag as resolved so any lingering background events know to clean themselves up
    isResolved = true;

    return resultingUrl as string | null;

  } catch (error: any) {
    // Catch any unexpected exceptions to ensure the main scraping loop never breaks.
    console.warn(`[captureExternalUrl] Failed to capture URL gracefully: ${error.message}`);
    return null;
  }
}

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
        browser = await chromium.launch({ headless: true });
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
                    hasMore = false;
                }
            } catch (e: any) {
                hasMore = false;
                break;
            }
        }

        const uniqueMap = new Map<string, any>();
        allItems.forEach(item => uniqueMap.set(String(item.id), item));
        const deduplicatedItems = Array.from(uniqueMap.values());
        console.log(`[StandaloneProsasScraper] Deduplication complete. Found ${deduplicatedItems.length} unique items.`);

        const maxDeepScrape = process.env.MAX_DEEP_SCRAPE ? parseInt(process.env.MAX_DEEP_SCRAPE, 10) : 450;
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
                    const isCentral = item.attributes && item.attributes['e_central?'] === true;
                    const detailUrl = isCentral 
                        ? `https://produtos.prosas.com.br/editais/edital?edital_id=${item.id}` 
                        : `https://prosas.com.br/editais/${item.id}`;
                    
                    let workerPage: any = null;
                    try {
                        workerPage = await context.newPage();
                        await workerPage.goto(detailUrl, { waitUntil: 'networkidle', timeout: 60000 });
                        await workerPage.waitForTimeout(3000);

                        let pageText = '';
                        let finalExternalLink = '';

                        for (let poll = 0; poll < 3; poll++) {
                            await workerPage.waitForTimeout(1000);
                            
                            const text = await workerPage.evaluate(() => {
                                let text = document.body.innerText || '';
                                const allElements = document.querySelectorAll('*');
                                for (let i = 0; i < allElements.length; i++) {
                                    if (allElements[i].shadowRoot) {
                                        text += '\n' + (allElements[i].shadowRoot.textContent || '');
                                    }
                                }

                                return text.replace(/\n\s*\n/g, '\n').trim();
                            });

                            pageText = text;

                            // Break early if we got enough text, otherwise wait for next poll
                            if (pageText.length > 500) {
                                break;
                            }
                        }

                        // Try clicking the button to capture external url
                        const extUrl = await captureExternalUrl(workerPage, context);
                        if (extUrl) {
                            finalExternalLink = extUrl;
                            pageText += `\n\nEXTERNAL_EDITAL_LINK: ${extUrl}`;

                            // If navigation happened in same tab, we must go back or the next evaluation might break
                            // if there is more logic, but here we close the workerPage in `finally` anyway.
                        }

                        console.log(`[StandaloneProsasScraper] Deep scraping (${currentIndex}/${totalItems}): ${detailUrl} -> Extracted ${pageText.length} chars | Link: ${finalExternalLink || 'None'}`);

                        if (pageText.length > 15000) pageText = pageText.substring(0, 15000);
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

        console.log(`[StandaloneProsasScraper] Deep scraping phase complete. Writing final output...`);
        fs.writeFileSync(outPath, JSON.stringify(deduplicatedItems, null, 2));
        console.log(`[StandaloneProsasScraper] Done!`);

    } finally {
        if (context) await context.close();
        if (browser) await browser.close();
    }
}

runStandaloneScraper().catch((err) => {
    console.error("[StandaloneProsasScraper] Fatal error:", err);
    process.exit(1);
});
