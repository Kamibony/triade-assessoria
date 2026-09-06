const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

// 1. Update triggerGlobalIngestion and scheduledGlobalIngestion to set totalTargets
code = code.replace(
    /internalFontes: \{ status: 'RUNNING', targetsProcessed: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: \[\] \}/g,
    "internalFontes: { status: 'RUNNING', targetsProcessed: 0, totalTargets: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: [] }"
);

// We need to set totalTargets after getting the snapshot.
// In triggerGlobalIngestion:
code = code.replace(
    /const targetsSnapshot = await db\.collection\('scraping_targets'\)\.get\(\);(.*?)\n(.*?)const queue = getFunctions\(\)\.taskQueue\('processScrapingTargetWorker'\);/s,
    `const targetsSnapshot = await db.collection('scraping_targets').get();
        await db.collection('ingestion_runs').doc(runId).update({
            'phases.internalFontes.totalTargets': targetsSnapshot.docs.length
        });
        const queue = getFunctions().taskQueue('processScrapingTargetWorker');`
);

// In processScrapingTargetWorker, when a target finishes (either successfully or through error loop), update completedTargets and check.
// In the success exit path:
code = code.replace(
    /\/\/ No more links to process, and no next page to fetch \(either RSS, reached end, or max pages\)\n\s+await searchRef\.update\(\{\n\s+completedTargets: FieldValue\.increment\(1\)\n\s+\}\);/,
    `// No more links to process, and no next page to fetch (either RSS, reached end, or max pages)
            await searchRef.update({
                completedTargets: FieldValue.increment(1)
            });
            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
                });

                // Check if we are done with all targets
                const runDoc = await db.collection('ingestion_runs').doc(runId).get();
                const runData = runDoc.data();
                if (runData && runData.phases && runData.phases.internalFontes) {
                    if (runData.phases.internalFontes.targetsProcessed >= runData.phases.internalFontes.totalTargets) {
                        await db.collection('ingestion_runs').doc(runId).update({
                            'phases.internalFontes.status': 'COMPLETED'
                        });
                    }
                }
            }`
);

// In the error exit path:
code = code.replace(
    /if \(runId\) \{\n\s+await db\.collection\('ingestion_runs'\)\.doc\(runId\)\.update\(\{\n\s+'phases\.internalFontes\.errors': FieldValue\.arrayUnion\(\`Target \$\{target\.name\} failed: \$\{error\.message\}\`\)\n\s+\}\);\n\s+\}/,
    `if (runId) {
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.internalFontes.errors': FieldValue.arrayUnion(\`Target \${target.name} failed: \${error.message}\`),
                'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
            });

            // Check if we are done with all targets
            const runDoc = await db.collection('ingestion_runs').doc(runId).get();
            const runData = runDoc.data();
            if (runData && runData.phases && runData.phases.internalFontes) {
                if (runData.phases.internalFontes.targetsProcessed >= runData.phases.internalFontes.totalTargets) {
                    await db.collection('ingestion_runs').doc(runId).update({
                        'phases.internalFontes.status': 'COMPLETED'
                    });
                }
            }
        }`
);

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched Fontes worker");
