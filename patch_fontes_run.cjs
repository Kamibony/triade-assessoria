const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// The replacement in triggerGlobalIngestion might have been done twice due to /g or similar, or scheduledGlobalIngestion might not have been hit.
// Let's use a simpler replace specifically for scheduledGlobalIngestion:
code = code.replace(
    /try \{\n\s+const targetsSnapshot = await db\.collection\('scraping_targets'\)\.get\(\);\n\s+const queue = getFunctions\(\)\.taskQueue\('processScrapingTargetWorker'\);/g,
    `try {
         const targetsSnapshot = await db.collection('scraping_targets').get();
         await db.collection('ingestion_runs').doc(runId).update({
             'phases.internalFontes.totalTargets': targetsSnapshot.docs.length
         });
         const queue = getFunctions().taskQueue('processScrapingTargetWorker');`
);

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched Fontes worker scheduled");
