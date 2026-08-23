const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// The replacement logic:
// 1. We replace the large onSearchCreated function with a simplified version.
// 2. We add the new processScrapingTargetWorker using onTaskDispatched.

const onSearchCreatedStart = `export const onSearchCreated = onDocumentCreated({ document: 'searches/{searchId}', timeoutSeconds: 540 }, async (event) => {`;
const onSearchCreatedEnd = `    } catch (error) {
        console.error('Error during autonomous search:', error);
        await searchRef.update({
            status: 'error',
            message: error instanceof Error ? error.message : 'Erro interno durante a busca.',
        });
    }
});`;

let startIndex = content.indexOf(onSearchCreatedStart);
let endIndex = content.indexOf(onSearchCreatedEnd) + onSearchCreatedEnd.length;

if (startIndex === -1 || endIndex === -1) {
    console.error("Could not find onSearchCreated block to replace.");
    process.exit(1);
}

const originalOnSearchCreated = content.substring(startIndex, endIndex);

const newCode = `
export const processScrapingTargetWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 540
}, async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query } = request.data as { searchId: string, target: any, query?: string };

    if (!searchId || !target) {
        console.error("Invalid task payload: missing searchId or target.");
        return;
    }

    const db = getFirestore();
    const searchRef = db.collection('searches').doc(searchId);

    try {
        let totalProcessed = 0;
        let totalSaved = 0;
        let candidateLinks: string[] = [];

        try {
            if (target.strategy === 'RSS') {
                const parser = new Parser();
                const feed = await parser.parseURL(target.url);
                candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
            } else if (target.strategy === 'API') {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(target.url, {
                    signal: controller.signal,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const data = await response.json();
                    const jsonString = JSON.stringify(data);
                    const urlRegex = /(https?:\\/\\/[^\\s"',]+)/g;
                    const matches = jsonString.match(urlRegex) || [];
                    candidateLinks = [...new Set(matches)];
                } else {
                    logger.warn(\`API fetch failed for \${target.name}: \${response.statusText}\`);
                }
            } else if (target.strategy === 'HTML') {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(target.url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    }
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const html = await response.text();
                    const $ = cheerio.load(html);
                    const selector = target.cssSelector || 'a';

                    $(selector).each((_, el) => {
                        let href = $(el).attr('href');
                        if (href) {
                            try {
                                href = new URL(href, target.url).href;
                                candidateLinks.push(href);
                            } catch (e) {
                                // Ignore
                            }
                        }
                    });
                    candidateLinks = [...new Set(candidateLinks)];
                } else {
                    logger.warn(\`HTML fetch failed for \${target.name}: \${response.statusText}\`);
                }
            } else if (target.strategy === 'AUTO') {
                const isRss = target.url.toLowerCase().endsWith('.xml') || target.url.toLowerCase().includes('feed');
                if (isRss) {
                    try {
                        const parser = new Parser();
                        const feed = await parser.parseURL(target.url);
                        candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                    } catch (e) {
                        logger.warn(\`Direct RSS parsing failed for \${target.url}\`);
                    }
                }

                if (candidateLinks.length === 0) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    const response = await fetch(target.url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                        }
                    });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const contentType = response.headers.get('content-type') || '';
                        const html = await response.text();

                        if (contentType.includes('xml') || contentType.includes('rss')) {
                            try {
                                const parser = new Parser();
                                const feed = await parser.parseString(html);
                                candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                            } catch (e) {
                                logger.warn(\`Failed to parse XML response as RSS for \${target.url}\`);
                            }
                        } else {
                            const $ = cheerio.load(html);
                            const rssLink = $('link[type="application/rss+xml"]').attr('href');
                            if (rssLink) {
                                try {
                                    const absoluteRssUrl = new URL(rssLink, target.url).href;
                                    const parser = new Parser();
                                    const feed = await parser.parseURL(absoluteRssUrl);
                                    candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                                } catch (e) {
                                    logger.warn(\`Failed to parse discovered RSS feed\`);
                                }
                            }

                            if (candidateLinks.length === 0) {
                                let rawLinks: string[] = [];
                                $('a').each((_, el) => {
                                    let href = $(el).attr('href');
                                    if (href) {
                                        try {
                                            href = new URL(href, target.url).href;
                                            rawLinks.push(href);
                                        } catch (e) {
                                            // Ignore
                                        }
                                    }
                                });
                                rawLinks = [...new Set(rawLinks)];
                                const excludePatterns = [/sobre/i, /contato/i, /\\.jpg$/i, /\\.png$/i, /facebook\\.com/i, /instagram\\.com/i, /twitter\\.com/i, /mailto:/i, /login/i, /entrar/i];
                                const preFiltered = rawLinks.filter(link => !excludePatterns.some(pattern => pattern.test(link)));
                                const selectionResult = await selectEditalLinksFlow({ links: preFiltered });
                                candidateLinks = selectionResult.selectedLinks;
                            }
                        }
                    } else {
                        logger.warn(\`AUTO fetch failed for \${target.name}: \${response.statusText}\`);
                    }
                }
            }
        } catch (error) {
            logger.error(\`Error extracting links for target \${target.name}:\`, error);
        }

        const linksToProcess = candidateLinks.slice(0, 10);

        for (let i = 0; i < linksToProcess.length; i++) {
            const link = linksToProcess[i];
            if (!link) continue;

            const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                continue;
            }

            try {
                const text = await fetchAndExtractText(link);
                if (!text || text.length < 500) {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Ignorado', reason: 'Texto ausente ou muito curto.' })
                    });
                    totalProcessed++;
                    continue;
                }

                const triageResult = await triageEditalWebpage({ text, searchQuery: query });

                if (triageResult.isValidEdital) {
                    const editalResult = await extractEditalRules({ text });
                    const parseResult = editalSchema.safeParse(editalResult);

                    if (parseResult.success) {
                        const editalDocData = {
                            ...parseResult.data,
                            rawText: text.substring(0, 5000),
                            sourceUrl: link,
                            createdAt: FieldValue.serverTimestamp(),
                        };

                        await db.collection('editais').add(editalDocData);
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Importado', reason: triageResult.reason })
                        });
                        totalSaved++;
                    } else {
                         await searchRef.update({
                             logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: 'Falha na validação do schema do edital.' })
                         });
                    }
                } else {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Rejeitado', reason: triageResult.reason })
                    });
                }
            } catch (error) {
                console.error(\`Error processing link \${link} from \${target.name}:\`, error);
                await searchRef.update({
                    logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: error instanceof Error ? error.message : 'Erro desconhecido' })
                });
            }

            totalProcessed++;
        }

        await searchRef.update({
            processedCount: FieldValue.increment(totalProcessed),
            savedCount: FieldValue.increment(totalSaved)
        });

    } catch (error) {
        console.error('Error during autonomous search target worker:', error);
    }
});

export const onSearchCreated = onDocumentCreated({ document: 'searches/{searchId}' }, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const searchId = event.params.searchId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = data.targets as any[] || [];

    const db = getFirestore();
    const searchRef = db.collection('searches').doc(searchId);
    const queue = getFunctions().taskQueue('processScrapingTargetWorker');

    try {
        const enqueuePromises = targets.map(target => {
            return queue.enqueue({
                searchId,
                target,
                query: data.query
            });
        });

        await Promise.all(enqueuePromises);

        await searchRef.update({
            status: 'running',
            message: 'Agente Autônomo enviado para execução em segundo plano.',
        });

    } catch (error) {
        console.error('Error enqueuing search tasks:', error);
        await searchRef.update({
            status: 'error',
            message: error instanceof Error ? error.message : 'Erro interno ao enfileirar tarefas de busca.',
        });
    }
});
`;

content = content.replace(originalOnSearchCreated, newCode);
fs.writeFileSync('functions/src/index.ts', content, 'utf8');
console.log("Successfully replaced onSearchCreated and added processScrapingTargetWorker");
