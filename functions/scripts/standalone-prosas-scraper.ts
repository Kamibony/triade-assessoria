import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

/**
 * Julesova optimalizovaná rutina na fyzické kliknutie na "Acessar"
 * Bezpečne odchytí nové okná aj presmerovania v aktuálnom okne.
 */
async function captureExternalUrl(page: any) {
  let capturedPopup: any = null;
  let finalUrl: string | null = null;
  const initialUrl = page.url();
  
  // Passive listener explicitly scoped to this page's popups
  const pageListener = (newPage: any) => {
    capturedPopup = newPage;
  };

  try {
    const targetButton = page.getByText(/(acessar|inscreva-se)/i)
      .filter({ hasNotText: /acessar perfil/i })
      .first();

    if (!(await targetButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      return null;
    }

    // 1. Setup passive listener on the current page
    page.on('popup', pageListener);

    // 2. Physical click
    await targetButton.click({ force: true, timeout: 3000 }).catch(() => {});

    // 3. Active Polling Loop (no Promise.race)
    for (let i = 0; i < 10; i++) {
      try {
        await page.waitForTimeout(500); // Poll every 500ms
      } catch (e) {
        break;
      }

      // Condition A: New Tab / Popup detected
      if (capturedPopup) {
        try {
          let u = capturedPopup.url();
          if (u === 'about:blank') {
            // Briefly wait if it's still about:blank, but without hanging the whole loop
            await capturedPopup.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => {});
            u = capturedPopup.url();
          }
          if (u && !u.includes('prosas.com.br') && !u.includes('linkedin.com') && !u.includes('wa.me')) {
            finalUrl = u;
          }
        } catch (e) {}
        break; // Stop polling once we process the popup
      }

      // Condition B: Same-Tab Redirect detected
      try {
        const currentUrl = page.url();
        if (currentUrl !== initialUrl && !currentUrl.includes('prosas.com.br') && !currentUrl.includes('linkedin.com') && !currentUrl.includes('wa.me')) {
          finalUrl = currentUrl;
          break; // Stop polling once we process the redirect
        }
      } catch (e) {
        break;
      }
    }

    return finalUrl;
  } catch (error: any) {
    console.warn(`[captureExternalUrl] Failed: ${error.message}`);
    return null;
  } finally {
    // 4. Strict Teardown & Cleanup
    try {
      page.off('popup', pageListener);
    } catch (e) {}
    if (capturedPopup) {
      try {
        await capturedPopup.close();
      } catch (e) {}
    }
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
                        await workerPage.waitForTimeout(2000);

                        // Extrakcia plného textu
                        let pageText = await workerPage.evaluate(() => {
                            let text = document.body.innerText || '';
                            const allElements = document.querySelectorAll('*');
                            for (let i = 0; i < allElements.length; i++) {
                                if (allElements[i].shadowRoot) {
                                    text += '\n' + (allElements[i].shadowRoot.textContent || '');
                                }
                            }
                            return text.replace(/\n\s*\n/g, '\n').trim();
                        });

                        // 1. Spustenie spoľahlivej Julesovej funkcie pre klik
                        let externalLink = await captureExternalUrl(workerPage);
                        
                        // 2. Fallback (pre staré domény prosas.com.br) ak klik nič nenašiel
                        if (!externalLink) {
                            externalLink = await workerPage.evaluate(() => {
                                let fallback = '';
                                const allElements = document.querySelectorAll('*');
                                const allLinks: HTMLAnchorElement[] = [];
                                
                                for (let i = 0; i < allElements.length; i++) {
                                    if (allElements[i].tagName === 'A') allLinks.push(allElements[i] as HTMLAnchorElement);
                                    if (allElements[i].shadowRoot) {
                                        const shadowLinks = allElements[i].shadowRoot!.querySelectorAll('a');
                                        for(let j=0; j<shadowLinks.length; j++) allLinks.push(shadowLinks[j]);
                                    }
                                }
                                
                                for (let i = 0; i < allLinks.length; i++) {
                                    const a = allLinks[i];
                                    const btnText = (a.textContent || '').toLowerCase().trim();
                                    const href = a.href || a.getAttribute('href') || '';
                                    
                                    if (href && href.startsWith('http') && !href.includes('prosas.com.br') && !href.includes('wa.me') && !href.includes('linkedin.com')) {
                                        if (btnText.includes('acessar') || btnText.includes('inscreva-se') || btnText.includes('edital')) {
                                            fallback = href;
                                            break;
                                        }
                                        if (!fallback) fallback = href;
                                    }
                                }
                                return fallback;
                            });
                        }

                        // Prilepenie linku k textu
                        if (externalLink) {
                            pageText += `\n\nEXTERNAL_EDITAL_LINK: ${externalLink}`;
                        }

                        console.log(`[StandaloneProsasScraper] Deep scraping (${currentIndex}/${totalItems}): ${detailUrl} -> Extracted ${pageText.length} chars | Link: ${externalLink || 'None'}`);

                        if (pageText.length > 15000) pageText = pageText.substring(0, 15000);
                        item.full_text = pageText;

                    } catch (err: any) {
                        console.error(`[StandaloneProsasScraper] Failed to deep scrape ${detailUrl}: ${err.message}`);
                    } finally {
                        // Bezpečné uzatvorenie stránky
                        if (workerPage) {
                            try {
                                await workerPage.close();
                            } catch (e) {}
                        }
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
        console.log(`[StandaloneProsasScraper] Done! Saved to ${outPath}`);

    } finally {
        if (context) {
            try {
                await context.close();
            } catch (e) {}
        }
        if (browser) {
            try {
                await browser.close();
            } catch (e) {}
        }
        console.log("[StandaloneProsasScraper] Playwright browser and context closed safely.");
    }
}

runStandaloneScraper().catch((err) => {
    console.error("[StandaloneProsasScraper] Fatal error:", err);
    process.exit(1);
});
