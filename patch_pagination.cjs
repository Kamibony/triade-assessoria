const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// 1. Pagination Cap (page < 100 to page < 5)
content = content.replace(
    `} else if (candidateLinks.length > 0 && target.strategy !== 'RSS' && page < 100) {`,
    `} else if (candidateLinks.length > 0 && target.strategy !== 'RSS' && page < 5) {`
);

// 2. Add Rejection Caching Logic in processScrapingTargetWorker
// Search for existingRef logic:
const findRef = `const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                return;
            }`;

const replacementRef = `const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                return;
            }

            // Rejection Cache Deduplication
            const rejectionRef = await db.collection('scraping_cache').where('url', '==', link).limit(1).get();
            if (!rejectionRef.empty) {
                totalProcessed++;
                return;
            }`;

content = content.replace(findRef, replacementRef);

// 3. Save to rejection cache when a link is rejected
const findReject = `} else {
                    if (searchRef) {
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Ignorado/Rejeitado', reason: safeReason })
                        });
                    }
                }`;

const replacementReject = `} else {
                    if (searchRef) {
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Ignorado/Rejeitado', reason: safeReason })
                        });
                    }
                    // Save to rejection cache with 30-day TTL
                    const expireAt = new Date();
                    expireAt.setDate(expireAt.getDate() + 30);
                    await db.collection('scraping_cache').add({
                        url: link,
                        reason: safeReason,
                        createdAt: FieldValue.serverTimestamp(),
                        expireAt: expireAt
                    });
                }`;

content = content.replace(findReject, replacementReject);

// 4. Also add rejection caching in processRssFeeds
const findRssReject = `} else {
                    console.log(\`Link rejected: \${item.link} - \${routeResult.message}\`);
                }`;
// Since there's no else block in the snippet we saw, let's look for how it handles routeResult.success
const rssFindSuccess = `if (routeResult.success) {
                     savedCount++;

                }`;

const rssReplacementSuccess = `if (routeResult.success) {
                     savedCount++;
                } else {
                    const safeReason = routeResult.message ? routeResult.message.substring(0, 200) : '';
                    const expireAt = new Date();
                    expireAt.setDate(expireAt.getDate() + 30);
                    await db.collection('scraping_cache').add({
                        url: item.link,
                        reason: safeReason,
                        createdAt: FieldValue.serverTimestamp(),
                        expireAt: expireAt
                    });
                }`;

content = content.replace(rssFindSuccess, rssReplacementSuccess);

// 5. Also add rejection cache to processPredefinedQueries
const queryFindSuccess = `if (routeResult.success) {
                     savedCount++;

                }`;

content = content.replace(queryFindSuccess, rssReplacementSuccess);

// 6. Check existingQueue AND existingCache in processRssFeeds
const findRssCache = `const existingQueue = await db.collection('scraping_contents').where('url', '==', item.link).limit(1).get();
                if (!existingQueue.empty) {
                    console.log(\`Skipping link already in scraping queue: \${item.link}\`);
                    continue;
                }`;

const replacementRssCache = `const existingQueue = await db.collection('scraping_contents').where('url', '==', item.link).limit(1).get();
                if (!existingQueue.empty) {
                    console.log(\`Skipping link already in scraping queue: \${item.link}\`);
                    continue;
                }

                const rejectionRef = await db.collection('scraping_cache').where('url', '==', item.link).limit(1).get();
                if (!rejectionRef.empty) {
                    console.log(\`Skipping link in rejection cache: \${item.link}\`);
                    continue;
                }`;

content = content.replace(findRssCache, replacementRssCache);

// 7. Check existingQueue AND existingCache in processPredefinedQueries
const queryFindCache = `const existingQueue = await db.collection('scraping_contents').where('url', '==', link).limit(1).get();
                 if (!existingQueue.empty) continue;`;

const queryReplacementCache = `const existingQueue = await db.collection('scraping_contents').where('url', '==', link).limit(1).get();
                 if (!existingQueue.empty) continue;

                 const rejectionRef = await db.collection('scraping_cache').where('url', '==', link).limit(1).get();
                 if (!rejectionRef.empty) continue;`;

content = content.replace(queryFindCache, queryReplacementCache);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
