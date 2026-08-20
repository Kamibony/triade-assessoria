const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

if (!content.includes("import { onSchedule } from 'firebase-functions/v2/scheduler';")) {
    content = "import { onSchedule } from 'firebase-functions/v2/scheduler';\n" + content;
}

const scheduledSweeperCode = `
export const scheduledMatchSweeper = onSchedule('every 1 weeks', async (event) => {
    const db = getFirestore();
    const editaisSnapshot = await db.collection('editais').get();
    const oscsSnapshot = await db.collection('oscs').get();

    const oscIds = oscsSnapshot.docs.map(doc => doc.id);
    let successful = 0;
    let failed = 0;
    const BATCH_SIZE = 10;

    for (const editalDoc of editaisSnapshot.docs) {
        const editalId = editalDoc.id;

        // Check which OSCs already have matches for this Edital
        const matchesQuery = await db.collection('matches')
            .where('editalId', '==', editalId)
            .get();

        const matchedOscIds = new Set(matchesQuery.docs.map(doc => doc.data().oscId));

        // Find missing oscIds
        const missingOscIds = oscIds.filter(id => !matchedOscIds.has(id));

        console.log(\`Sweeping \${missingOscIds.length} missing matches for Edital \${editalId}\`);

        for (let i = 0; i < missingOscIds.length; i += BATCH_SIZE) {
            const chunk = missingOscIds.slice(i, i + BATCH_SIZE);

            const matchPromises = chunk.map(async (oscId) => {
                try {
                    const matchResult = await processMatchEvaluation(oscId, editalId);
                    return matchResult;
                } catch (error) {
                    console.error(\`Sweeper failed for OSC \${oscId} and Edital \${editalId}\`, error);
                    throw error;
                }
            });

            const results = await Promise.allSettled(matchPromises);
            successful += results.filter(r => r.status === 'fulfilled').length;
            failed += results.filter(r => r.status === 'rejected').length;
        }
    }

    console.log(\`Weekly sweeper complete. \${successful} successful, \${failed} failed.\`);
});
`;

content += '\n' + scheduledSweeperCode;

fs.writeFileSync('functions/src/index.ts', content);
