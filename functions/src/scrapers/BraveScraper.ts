import { IScraperStrategy } from './interfaces';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { defineString } from 'firebase-functions/params';

const braveApiKeyString = defineString('BRAVE_SEARCH_API_KEY');

export class BraveScraper implements IScraperStrategy {
    private readonly query: string;
    public readonly stateDocId: string;

    constructor(query: string) {
        this.query = query;
        const queryHash = crypto.createHash('md5').update(query).digest('hex');
        this.stateDocId = `brave_${queryHash}`;
    }

    async getWatermark(): Promise<string | null> {
        const db = getFirestore();
        const doc = await db.collection('scraper_state').doc(this.stateDocId).get();
        if (!doc.exists) return null;
        return doc.data()?.lastSuccessfulScrapeTimestamp || null;
    }

    async fetchDelta(): Promise<any[]> {
        let braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
        if (!braveApiKey) {
            try { braveApiKey = braveApiKeyString.value(); } catch (e) { /* ignore */ }
        }

        if (!braveApiKey) {
            console.warn(`[BraveScraper] BRAVE_SEARCH_API_KEY not found. Skipping Brave search.`);
            return [];
        }

        const watermark = await this.getWatermark();
        let watermarkDate = watermark ? new Date(watermark) : new Date(0);

        // 48-hour Lookback Window
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
        if (watermarkDate > fortyEightHoursAgo) {
             watermarkDate = fortyEightHoursAgo;
        }

        let activeQuery = this.query;
        const dateStr = watermarkDate.toISOString().split('T')[0];
        activeQuery = `${activeQuery} after:${dateStr}`;

        const allItems: any[] = [];

        // Pagination loop for a few pages (e.g. offset 0 and 1 as in original code)
        // Note: Promise.all is used to run them concurrently in original code, we do it sequentially here for simplicity and rate limit safety
        for (let offset = 0; offset < 2; offset++) {
            const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(activeQuery)}&count=20&offset=${offset}`;
            try {
                const searchResponse = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'Accept-Encoding': 'gzip',
                        'X-Subscription-Token': braveApiKey
                    }
                });

                if (!searchResponse.ok) {
                    console.warn(`[BraveScraper] API request failed for offset ${offset} with status: ${searchResponse.status}`);
                    continue;
                }

                const braveData = await searchResponse.json() as any;
                const results = braveData.web?.results || [];

                for (const r of results) {
                    if (r.url) {
                        let itemDate = new Date(); // Default to now

                        // Try to parse age or date if Brave returns it
                        if (r.age) {
                            // Brave age string is often relative (e.g., '14 hours', '2 days')
                            // Attempt fallback robust parsing or assume it passed the API date filter.
                            const lowerAge = r.age.toLowerCase();
                            let parsedDate = null;
                            const nowMs = Date.now();
                            if (lowerAge.includes('hour')) {
                                const hours = parseInt(lowerAge) || 1;
                                parsedDate = new Date(nowMs - (hours * 3600 * 1000));
                            } else if (lowerAge.includes('day')) {
                                const days = parseInt(lowerAge) || 1;
                                parsedDate = new Date(nowMs - (days * 86400 * 1000));
                            } else if (lowerAge.includes('month')) {
                                const months = parseInt(lowerAge) || 1;
                                parsedDate = new Date(nowMs - (months * 30 * 86400 * 1000));
                            } else if (lowerAge.includes('year')) {
                                const years = parseInt(lowerAge) || 1;
                                parsedDate = new Date(nowMs - (years * 365 * 86400 * 1000));
                            } else {
                                // standard date parse fallback
                                const fallback = new Date(r.age);
                                if (!isNaN(fallback.getTime())) {
                                    parsedDate = fallback;
                                }
                            }

                            if (parsedDate && !isNaN(parsedDate.getTime())) {
                                itemDate = parsedDate;
                            }
                        }

                        if (itemDate > watermarkDate) {
                            allItems.push({
                                link: r.url,
                                title: r.title || '',
                                snippet: r.description || '',
                                query: this.query,
                                rawResult: r
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn(`[BraveScraper] API request threw error for offset ${offset}`, e);
            }
        }

        return allItems;
    }

    async extractRaw(item: any): Promise<any> {
        const url = item.link;
        // Deterministic ID based on URL
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const externalProviderId = `brave_${hash}`;

        return {
            externalProviderId,
            url,
            rawPayload: item,
            title: item.title,
            snippet: item.snippet
        };
    }
}
