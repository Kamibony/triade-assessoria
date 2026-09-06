const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

const predefinedQueriesCode = `
async function processPredefinedQueries(runId?: string) {
    const db = getFirestore();
    const PREDEFINED_QUERIES = [
        "edital ONG 2024",
        "fomento cultura terceiro setor",
        "financiamento projetos sociais brasil",
        "chamada publica para osc",
        "edital projetos ambientais ong"
    ];

    let processedCount = 0;
    let savedCount = 0;

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
        console.warn("Vertex AI Search config missing for processPredefinedQueries.");
        return { processedCount: 0, savedCount: 0 };
    }

    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
    let client, accessToken;
    try {
        client = await auth.getClient();
        accessToken = await client.getAccessToken();
    } catch(e) {
        console.error("Failed to authenticate with GoogleAuth:", e);
        throw e;
    }

    const vertexUrl = \`https://discoveryengine.googleapis.com/v1/projects/\${vertexProjectId}/locations/\${vertexLocation}/collections/default_collection/engines/\${vertexEngineId}/servingConfigs/default_search:search\`;

    for (const query of PREDEFINED_QUERIES) {
        try {
            console.log(\`[Predefined Queries] Executing Vertex AI Search for query: "\${query}"\`);

            let vertexResponse;
            let attempt = 0;
            const maxAttempts = 3;

            while (attempt < maxAttempts) {
                vertexResponse = await fetch(vertexUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': \`Bearer \${accessToken.token}\`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query: query, pageSize: 10 })
                });

                if (vertexResponse.ok) break;

                if (vertexResponse.status === 429 || vertexResponse.status >= 500) {
                    attempt++;
                    console.warn(\`Vertex AI API failed with status \${vertexResponse.status}. Retrying \${attempt}/\${maxAttempts}...\`);
                    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
                } else {
                    break;
                }
            }

            if (!vertexResponse || !vertexResponse.ok) {
                 const status = vertexResponse ? vertexResponse.status : 'unknown';
                 console.error(\`Vertex AI API failed permanently for query "\${query}" with status: \${status}\`);
                 if (runId) {
                     await db.collection('ingestion_runs').doc(runId).update({
                         'phases.rssAndQueries.errors': FieldValue.arrayUnion(\`Vertex AI API falhou permanentemente para "\${query}": \${status}\`)
                     });
                 }
                 continue;
            }

            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.rssAndQueries.feedsProcessed': FieldValue.increment(1) // Treating query as a 'feed' for UI purposes
                });
            }

            const vertexData = await vertexResponse.json() as any;
            const results = vertexData.results || [];

            for (const result of results) {
                 const derivedStructData = result.document?.derivedStructData;
                 if (!derivedStructData || !derivedStructData.link) continue;

                 const link = derivedStructData.link;

                 const existingEdital = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
                 if (!existingEdital.empty) continue;

                 const existingQueue = await db.collection('scraping_contents').where('url', '==', link).limit(1).get();
                 if (!existingQueue.empty) continue;

                 processedCount++;

                 const routeResult = await routeEditalUrl(link, "VERTEX_SEARCH", undefined, { searchQuery: query }, "VERTEX_SEARCH");
                 if (routeResult.success) {
                     savedCount++;
                     if (runId) {
                         await db.collection('ingestion_runs').doc(runId).update({
                             'phases.rssAndQueries.newEditaisEnqueued': FieldValue.increment(1)
                         });
                     }
                 }

                 if (runId) {
                     await db.collection('ingestion_runs').doc(runId).update({
                         'phases.rssAndQueries.urlsDiscovered': FieldValue.increment(1),
                         'totalUrlsScanned': FieldValue.increment(1)
                     });
                 }
            }
        } catch (error: any) {
            console.error(\`Error processing predefined query \${query}:\`, error);
            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.rssAndQueries.errors': FieldValue.arrayUnion(\`Error on query \${query}: \${error.message}\`)
                });
            }
        }
    }

    return { processedCount, savedCount };
}
`;

// Insert the new function before processRssFeeds
code = code.replace(
    'async function processRssFeeds(runId?: string) {',
    predefinedQueriesCode + '\nasync function processRssFeeds(runId?: string) {'
);

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched predefined queries function");
