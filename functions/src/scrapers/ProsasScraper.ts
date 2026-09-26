import { IScraperStrategy } from './interfaces';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';

const prosasUsernameSecret = defineSecret('PROSAS_USERNAME');
const prosasPasswordSecret = defineSecret('PROSAS_PASSWORD');

export class ProsasScraper implements IScraperStrategy {
    public readonly stateDocId = 'prosas';


private async authenticate(): Promise<string> {
        const username = prosasUsernameSecret.value();
        const password = prosasPasswordSecret.value();

        if (!username || !password) {
            throw new Error("[ProsasScraper] PROSAS_USERNAME or PROSAS_PASSWORD environment variables are not set.");
        }

        try {
            logger.info("[ProsasScraper] Initiating authentication sequence...");

            // Step 1: GET request to grab CSRF token and initial session cookie
            const getResponse = await fetch('https://prosas.com.br/users/sign_in', {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                }
            });

            if (!getResponse.ok) {
                 throw new Error(`[ProsasScraper] Initial GET request failed with status: ${getResponse.status}`);
            }

            // Collect initial cookies
            const initialSetCookie = getResponse.headers.get('set-cookie');
            let initialCookies = '';
            if (initialSetCookie) {
                // Split multiple cookies, handling the fact they might be comma separated, though we just need the raw value parts
                // Browsers usually take everything before the first ';' as the key=value
                const cookies = String(initialSetCookie).split(/,(?=\s*[a-zA-Z0-9_-]+\s*=)/).map((c: string) => { const p = c.split(';'); return p[0] ? p[0].trim() : ''; });
                initialCookies = cookies.join('; ');
            }

            const html = await getResponse.text();

            // Extract authenticity_token using regex
            const csrfMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/);
            const authenticityToken = csrfMatch ? csrfMatch[1] : null;

            if (!authenticityToken) {
                logger.warn("[ProsasScraper] Could not find CSRF token on login page, attempting to proceed without it...");
            } else {
                logger.info("[ProsasScraper] Successfully extracted CSRF token.");
            }

            const formData = new URLSearchParams();
            if (authenticityToken) {
                formData.append('authenticity_token', authenticityToken);
            }
            formData.append('user[email]', username);
            formData.append('user[password]', password);
            formData.append('commit', 'Entrar');

            // Step 2: POST credentials with CSRF token and initial session cookie
            logger.info("[ProsasScraper] Authenticating directly with Prosas API...");
            const postResponse = await fetch('https://prosas.com.br/users/sign_in', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Cookie': initialCookies,
                    // Typically needed for rails CSRF protection on form submissions if not standard HTML navigation
                    'X-CSRF-Token': authenticityToken || ''
                },
                redirect: 'manual', // Prevent automatic following to capture cookies from 302
                body: formData.toString()
            });

            // Accept 200 or 302 as successful login indicators
            if (postResponse.status !== 200 && postResponse.status !== 302 && postResponse.status !== 303) {
                throw new Error(`[ProsasScraper] Authentication request failed with status: ${postResponse.status}`);
            }

            const setCookieHeader = postResponse.headers.get('set-cookie');
            if (!setCookieHeader) {
                throw new Error("[ProsasScraper] No set-cookie header received from authentication endpoint.");
            }

            // Properly parse Set-Cookie headers into a compliant Cookie string
            // Fetch concatenates multiple Set-Cookie headers with a comma.
            // Example: _proses_session=abc; path=/; HttpOnly, _prosesv2_session=''; Expires=...
            // We split by comma (taking care not to split on commas inside date strings)
            // A robust way without a library: split by /,(?=s*[a-zA-Z0-9_-]+s*=)/
            const parsedCookies = String(setCookieHeader).split(/,(?=\s*[a-zA-Z0-9_-]+\s*=)/).map((cookieStr: string) => { const p = cookieStr.split(';'); return p[0] ? p[0].trim() : ''; });
            const finalCookieString = parsedCookies.join('; ');

            logger.info("[ProsasScraper] Authentication successful. Session token acquired in-memory.");

            return finalCookieString;
        } catch (error) {
            logger.error("[ProsasScraper] Native authentication failed:", error);
            throw error;
        }
    }

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

        // Fetch authenticated session cookies once before the loop
        const cookieString = await this.authenticate();

        let page = 1;
        const allItems: any[] = [];
        const maxPages = 50;
        let debugCounter = 0;

        while (page <= maxPages) {
            // Include 'created_at' in the API fields. This URL assumes API v2 structure from codebase
            const fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${page}&page%5Bsize%5D=20&&sort=`;

            try {
                const response = await fetch(fetchUrl, {
                    headers: {
                        'Cookie': cookieString,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json, text/plain, */*'
                    }
                });

                if (response.status === 403) {
                    const errorMsg = `[ProsasScraper] 403 Forbidden: Authenticated session state is expired or invalid. (Page ${page})`;
                    logger.error(errorMsg);
                    throw new Error(errorMsg);
                }

                if (!response.ok) {
                    const errorMsg = `[ProsasScraper] API request failed for page ${page} with status: ${response.status}`;
                    console.error(errorMsg);
                    throw new Error(errorMsg);
                }

                const rawText = await response.text();
                console.log(`[ProsasScraper] RAW PROSAS RESPONSE (Page ${page}):`, rawText);

                let data: any = {};
                try {
                    data = JSON.parse(rawText);
                } catch (e) {
                    console.error(`[ProsasScraper] Failed to parse JSON from Prosas API response:`, e);
                    throw new Error("Failed to parse JSON from Prosas API response");
                }

                const items = data.data || [];

                if (items.length === 0) {
                     break; // No more items
                }

                for (const item of items) {
                     // Check if item date is older than watermark
                     // Prosas API typically returns created_at or updated_at
                     const itemDateString = item.attributes?.created_at || item.created_at;

                     if (itemDateString) {
                         const itemDate = new Date(itemDateString);
                         if (page === 1 && debugCounter < 5) {
                             logger.info(`[ProsasScraper Debug] Raw: ${itemDateString} | Parsed: ${itemDate} | Watermark: ${watermarkDate} | Keep?: ${itemDate > watermarkDate}`);
                             debugCounter++;
                         }
                         if (itemDate > watermarkDate) {
                             allItems.push(item);
                         }
                     } else {
                         if (page === 1 && debugCounter < 5) {
                             logger.info(`[ProsasScraper Debug] Raw: null/undefined | Parsed: N/A | Watermark: ${watermarkDate} | Keep?: true (default)`);
                             debugCounter++;
                         }
                         allItems.push(item);
                     }
                }
                page++;

                // Add a small delay to avoid hitting rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.error(`[ProsasScraper] Error fetching delta for page ${page}:`, e);
                throw e; // re-throw to orchestrator
            }
        }

        return allItems;
    }

    async extractRaw(item: any): Promise<any> {
        const url = `https://prosas.com.br/editais/${item.id}`;
        // Generate a deterministic ID based on the URL or Prosas ID
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const externalProviderId = `prosas_${item.id || hash}`;

        return {
            externalProviderId,
            url,
            rawPayload: item,
            title: item.attributes?.name || item.name || '',
            // Additional extraction can go here
        };
    }
}
