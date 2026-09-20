import { IScraperStrategy } from './interfaces';
import { getFirestore } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { defineString } from 'firebase-functions/params';

const vertexAiSearchProjectIdString = defineString('VERTEX_AI_SEARCH_PROJECT_ID');
const vertexAiSearchLocationString = defineString('VERTEX_AI_SEARCH_LOCATION');
const vertexAiSearchEngineIdString = defineString('VERTEX_AI_SEARCH_ENGINE_ID');

export class VertexAIScraper implements IScraperStrategy {
    private readonly query: string;
    public readonly stateDocId: string;

    constructor(query: string) {
        this.query = query;
        // Generate a valid document ID from the query
        const queryHash = crypto.createHash('md5').update(query).digest('hex');
        this.stateDocId = `vertex_${queryHash}`;
    }

    async getWatermark(): Promise<string | null> {
        const db = getFirestore();
        const doc = await db.collection('scraper_state').doc(this.stateDocId).get();
        if (!doc.exists) return null;
        return doc.data()?.lastSuccessfulScrapeTimestamp || null;
    }

    async fetchDelta(): Promise<any[]> {
        let vertexProjectId = process.env.VERTEX_AI_SEARCH_PROJECT_ID;
        if (!vertexProjectId) {
            try { vertexProjectId = vertexAiSearchProjectIdString.value(); } catch (e) { /* ignore */ }
        }
        vertexProjectId = vertexProjectId || "566889139686";

        let vertexLocation = process.env.VERTEX_AI_SEARCH_LOCATION;
        if (!vertexLocation) {
            try { vertexLocation = vertexAiSearchLocationString.value(); } catch (e) { /* ignore */ }
        }
        vertexLocation = vertexLocation || "global";

        let vertexEngineId = process.env.VERTEX_AI_SEARCH_ENGINE_ID;
        if (!vertexEngineId) {
            try { vertexEngineId = vertexAiSearchEngineIdString.value(); } catch (e) { /* ignore */ }
        }
        vertexEngineId = vertexEngineId || "triade-sniper-search_1787960465651";

        if (!vertexEngineId || !vertexLocation || !vertexProjectId) {
            console.warn("[VertexAIScraper] Vertex AI Search config missing.");
            return [];
        }

        let auth, client, accessToken;
        try {
            auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
            client = await auth.getClient();
            accessToken = await client.getAccessToken();
        } catch(e: any) {
            console.error("[VertexAIScraper] Failed to authenticate with GoogleAuth:", e);
            return [];
        }

        const vertexUrl = `https://discoveryengine.googleapis.com/v1/projects/${vertexProjectId}/locations/${vertexLocation}/collections/default_collection/engines/${vertexEngineId}/servingConfigs/default_search:search`;

        const watermark = await this.getWatermark();
        const watermarkDate = watermark ? new Date(watermark) : new Date(0);

        let activeQuery = this.query;
        if (watermark) {
             const dateStr = watermarkDate.toISOString().split('T')[0];
             activeQuery = `${activeQuery} after:${dateStr}`;
        }

        const allItems: any[] = [];
        let attempt = 0;
        const maxAttempts = 3;

        while (attempt < maxAttempts) {
            try {
                const response = await fetch(vertexUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken.token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: activeQuery,
                        pageSize: 40 // Fetch top results
                    })
                });

                if (response.ok) {
                    const data = await response.json() as any;
                    const results = data.results || [];

                    for (const result of results) {
                        // Vertex AI doesn't always provide a straightforward timestamp for generic web searches
                        // If it doesn't, we might have to rely on downstream deduplication or heuristic filtering.
                        // We will simulate a date check if a date is present in derivedStructData
                        const derivedStructData = result.document?.derivedStructData;
                        if (!derivedStructData || !derivedStructData.link) continue;

                        let itemDate = new Date(); // Default to now if not provided, meaning it will always be ingested if no watermark exists

                        // Example: Try to extract a date if Vertex provides one in metadata
                        // This might require specific schema configuration in Vertex
                        if (derivedStructData.pagemap?.metatags && derivedStructData.pagemap.metatags.length > 0) {
                            const metatags = derivedStructData.pagemap.metatags[0];
                            const dateStr = metatags['article:published_time'] || metatags['og:updated_time'];
                            if (dateStr) {
                                const parsedDate = new Date(dateStr);
                                if (!isNaN(parsedDate.getTime())) {
                                    itemDate = parsedDate;
                                }
                            }
                        }

                        if (itemDate > watermarkDate) {
                             allItems.push({
                                 link: derivedStructData.link,
                                 title: derivedStructData.title || '',
                                 snippet: derivedStructData.snippets?.map((s: any) => s.snippet).join(' ') || '',
                                 query: this.query,
                                 rawResult: result
                             });
                        }
                    }
                    break; // Success
                }

                if (response.status === 429 || response.status >= 500) {
                    attempt++;
                    console.warn(`[VertexAIScraper] API failed with status ${response.status}. Retrying ${attempt}/${maxAttempts}...`);
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
                } else {
                    console.error(`[VertexAIScraper] API failed permanently with status: ${response.status}`);
                    break;
                }
            } catch (e) {
                 console.error(`[VertexAIScraper] Exception during fetch:`, e);
                 break;
            }
        }

        return allItems;
    }

    async extractRaw(item: any): Promise<any> {
        const url = item.link;
        // Deterministic ID based on URL
        const hash = crypto.createHash('sha256').update(url).digest('hex');
        const externalProviderId = `vertex_${hash}`;

        return {
            externalProviderId,
            url,
            rawPayload: item,
            title: item.title,
            snippet: item.snippet
        };
    }
}
