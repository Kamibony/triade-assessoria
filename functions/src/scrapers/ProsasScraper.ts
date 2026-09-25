import { IScraperStrategy } from './interfaces';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { logger } from 'firebase-functions/logger';

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

        let page = 1;
        const allItems: any[] = [];
        const maxPages = 50;
        let debugCounter = 0;

        while (page <= maxPages) {
            // Include 'created_at' in the API fields. This URL assumes API v2 structure from codebase
            const fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${page}&page%5Bsize%5D=20&&sort=`;

            try {
                const response = await fetch(fetchUrl);
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
