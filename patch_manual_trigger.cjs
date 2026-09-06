const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// In triggerGlobalIngestion:
code = code.replace(
    /try \{\n\s+const targetsSnapshot = await db\.collection\('scraping_targets'\)\.get\(\); \/\/ Assume all are active for now, or filter if status field exists\n\s+const queue = getFunctions\(\)\.taskQueue\('processScrapingTargetWorker'\);/g,
    `try {
        const targetsSnapshot = await db.collection('scraping_targets').get();
        await db.collection('ingestion_runs').doc(runId).update({
            'phases.internalFontes.totalTargets': targetsSnapshot.docs.length
        });
        const queue = getFunctions().taskQueue('processScrapingTargetWorker');`
);

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched triggerGlobalIngestion");
