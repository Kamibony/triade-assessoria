const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// Need to import onDocumentUpdated
if (!content.includes("onDocumentUpdated")) {
    content = content.replace(
        "import { onDocumentCreated } from 'firebase-functions/v2/firestore';",
        "import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';"
    );
}

const onOscUpdatedCode = `
export const onOscUpdated = onDocumentUpdated('oscs/{oscId}', async (event) => {
    const oscSnapshot = event.data?.after;
    if (!oscSnapshot) {
        console.log("No data associated with the event.");
        return;
    }

    const oscId = event.params.oscId;
    const db = getFirestore();

    // Fetch all open editais (assuming we might want a status check, for now fetch all)
    // Actually we will just fetch all editais for simplicity based on the current schema logic
    const editaisSnapshot = await db.collection('editais').get();

    const BATCH_SIZE = 10;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < editaisSnapshot.docs.length; i += BATCH_SIZE) {
        const chunk = editaisSnapshot.docs.slice(i, i + BATCH_SIZE);

        const matchPromises = chunk.map(async (editalDoc) => {
            const editalId = editalDoc.id;
            try {
                const matchResult = await processMatchEvaluation(oscId, editalId);
                console.log(\`Successfully processed match for OSC \${oscId} and Edital \${editalId}\`);
                return matchResult;
            } catch (error) {
                console.error(\`Failed to process match for OSC \${oscId} and Edital \${editalId}\`, error);
                throw error;
            }
        });

        const results = await Promise.allSettled(matchPromises);
        successful += results.filter(r => r.status === 'fulfilled').length;
        failed += results.filter(r => r.status === 'rejected').length;
    }

    console.log(\`Batch matchmaking complete for OSC update. \${successful} successful, \${failed} failed.\`);
});
`;

content += '\n' + onOscUpdatedCode;

fs.writeFileSync('functions/src/index.ts', content);
