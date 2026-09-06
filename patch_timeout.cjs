const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

const timeoutCode = `
export const scheduledIngestionTimeoutSweeper = onSchedule('*/30 * * * *', async () => {
    const db = getFirestore();
    const now = Date.now();
    const timeoutMs = 45 * 60 * 1000; // 45 minutes

    const snapshot = await db.collection('ingestion_runs')
        .where('status', '==', 'RUNNING')
        .get();

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const startTime = data.startTime?.toMillis() || now;

        if (now - startTime > timeoutMs) {
            console.log(\`Timeout Sweeper: Marking run \${doc.id} as TIMEOUT\`);

            const updates: any = {
                status: 'TIMEOUT',
                endTime: FieldValue.serverTimestamp()
            };

            if (data.phases) {
                if (data.phases.prosas?.status === 'RUNNING') {
                    updates['phases.prosas.status'] = 'TIMEOUT';
                }
                if (data.phases.internalFontes?.status === 'RUNNING') {
                    updates['phases.internalFontes.status'] = 'TIMEOUT';
                }
                if (data.phases.rssAndQueries?.status === 'RUNNING') {
                    updates['phases.rssAndQueries.status'] = 'TIMEOUT';
                }
            }

            await doc.ref.update(updates);
        }
    }
});
`;

code += "\n" + timeoutCode;

fs.writeFileSync('functions/src/index.ts', code, 'utf8');
console.log("Patched timeout sweeper");
