import { IScraperStrategy } from './interfaces';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';

export class ProsasScraper implements IScraperStrategy {
    private readonly stateDocId = 'prosas';

    async getWatermark(): Promise<string | null> {
        const db = getFirestore();
        const doc = await db.collection('scraper_state').doc(this.stateDocId).get();
        if (!doc.exists) return null;
        return doc.data()?.lastSuccessfulScrapeTimestamp || null;
    }

    async fetchDelta(): Promise<any[]> {
        const watermark = await this.getWatermark();
        const watermarkDate = watermark ? new Date(watermark) : new Date(0);
        let page = 1;
        const allItems: any[] = [];
        let shouldContinue = true;
        const maxPages = 50;

        while (shouldContinue && page <= maxPages) {
            // Include 'created_at' in the API fields. This URL assumes API v2 structure from codebase
            const fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${page}&page%5Bsize%5D=20&&sort=`;

            try {
                const response = await fetch(fetchUrl);
                if (!response.ok) {
                    console.warn(`[ProsasScraper] API request failed for page ${page} with status: ${response.status}`);
                    break;
                }
                const data = await response.json();
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
                         if (itemDate <= watermarkDate) {
                             shouldContinue = false; // We hit the watermark, stop paginating
                             break; // Skip this and all older items on this page
                         }
                     }
                     allItems.push(item);
                }
                page++;

                // Add a small delay to avoid hitting rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.error(`[ProsasScraper] Error fetching delta for page ${page}:`, e);
                break;
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
