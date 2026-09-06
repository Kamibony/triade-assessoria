const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// Replace the rssWorker logic
const oldWorkerStart = "export const rssWorker = onTaskDispatched({";
const newWorker = `export const rssWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 60,
    },
    rateLimits: {
        maxConcurrentDispatches: 1,
    }
}, async (request) => {
    const runId = request.data.runId;
    const db = getFirestore();

    try {
        console.log(\`[RSS & Queries Worker] Starting Phase 3 for run \${runId}\`);

        await processRssFeeds(runId);
        await processPredefinedQueries(runId);

        if (runId) {
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.rssAndQueries.status': 'COMPLETED'
            });
        }
    } catch (e: any) {
        console.error(\`[RSS & Queries Worker] Failed for run \${runId}:\`, e);
        if (runId) {
             await db.collection('ingestion_runs').doc(runId).update({
                 'phases.rssAndQueries.status': 'FAILED',
                 'phases.rssAndQueries.errors': FieldValue.arrayUnion(\`Worker failed: \${e.message}\`)
             });
        }
    }
});`;

// We also need to remove the completion update from inside processRssFeeds to let the worker handle it
code = code.replace(
    /if \(runId\) \{\s+await db.collection\('ingestion_runs'\).doc\(runId\).update\(\{\s+'phases.rssAndQueries.status': 'COMPLETED'\s+\}\);\s+\}/,
    ''
);

// We also need to remove the catch inside the cron for processRssFeeds
code = code.replace(
    /processRssFeeds\(runId\)\.catch\(async \(e: any\) => \{\s+await db.collection\('ingestion_runs'\).doc\(runId\).update\(\{\s+'phases.rssAndQueries.status': 'FAILED',\s+'phases.rssAndQueries.errors': FieldValue.arrayUnion\(\`RSS Process failed: \$\{e.message\}\`\)\s+\}\);\s+\}\);/,
    `try {
         const rssQueue = getFunctions().taskQueue('rssWorker');
         await rssQueue.enqueue({ runId });
     } catch (e: any) {
         await db.collection('ingestion_runs').doc(runId).update({
             'phases.rssAndQueries.status': 'FAILED',
             'phases.rssAndQueries.errors': FieldValue.arrayUnion(\`Failed to enqueue RSS worker: \${e.message}\`)
         });
     }`
);


const rssWorkerRegex = /export const rssWorker = onTaskDispatched\(\{[\s\S]*?\}\);/;
code = code.replace(rssWorkerRegex, newWorker);

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched rssWorker function");
