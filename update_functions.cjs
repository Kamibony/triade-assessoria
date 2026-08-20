const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// Insert processMatchEvaluation before onEditalCreated
const processMatchEvaluationCode = `
export async function processMatchEvaluation(oscId: string, editalId: string, forceRecalculate: boolean = false) {
    const db = getFirestore();

    // Fetch OSC and Edital
    const oscDoc = await db.collection('oscs').doc(oscId).get();
    const editalDoc = await db.collection('editais').doc(editalId).get();

    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error(\`OSC (\${oscId}) or Edital (\${editalId}) not found\`);
    }

    const oscData = oscDoc.data() as z.infer<typeof ngoProfileSchema> & { updatedAt?: admin.firestore.Timestamp };
    const editalData = editalDoc.data() as z.infer<typeof editalSchema> & { updatedAt?: admin.firestore.Timestamp };

    // Check for existing match
    const matchesQuery = await db.collection('matches')
        .where('oscId', '==', oscId)
        .where('editalId', '==', editalId)
        .limit(1)
        .get();

    let existingMatchRef = null;
    let existingMatchData = null;

    if (!matchesQuery.empty) {
        existingMatchRef = matchesQuery.docs[0].ref;
        existingMatchData = matchesQuery.docs[0].data();
    }

    // Cache logic
    if (!forceRecalculate && existingMatchData && existingMatchData.createdAt) {
        const matchTime = existingMatchData.createdAt.toMillis();
        const oscUpdateTime = oscData.updatedAt ? oscData.updatedAt.toMillis() : 0;
        const editalUpdateTime = editalData.updatedAt ? editalData.updatedAt.toMillis() : 0;

        if (matchTime >= oscUpdateTime && matchTime >= editalUpdateTime) {
            console.log(\`Returning cached match for OSC \${oscId} and Edital \${editalId}\`);
            return existingMatchData;
        }
    }

    console.log(\`Evaluating match for OSC \${oscId} and Edital \${editalId}\`);
    const matchResult = await scoreMatch({
        osc: oscData,
        edital: editalData,
        oscId: oscId,
        editalId: editalId
    });

    const matchRef = existingMatchRef || db.collection('matches').doc();
    const matchDocData = {
        ...matchResult,
        id: matchRef.id,
        createdAt: FieldValue.serverTimestamp()
    };

    await matchRef.set(matchDocData, { merge: true });
    return matchDocData;
}
`;

content = content.replace("export const onEditalCreated", processMatchEvaluationCode + "\nexport const onEditalCreated");

const newOnEditalCreatedCode = `export const onEditalCreated = onDocumentCreated('editais/{editalId}', async (event) => {
    const editalSnapshot = event.data;
    if (!editalSnapshot) {
        console.log("No data associated with the event.");
        return;
    }

    const editalId = event.params.editalId;
    const db = getFirestore();
    const oscsSnapshot = await db.collection('oscs').get();

    const BATCH_SIZE = 10;
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < oscsSnapshot.docs.length; i += BATCH_SIZE) {
        const chunk = oscsSnapshot.docs.slice(i, i + BATCH_SIZE);

        const matchPromises = chunk.map(async (oscDoc) => {
            const oscId = oscDoc.id;
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

    console.log(\`Batch matchmaking complete. \${successful} successful, \${failed} failed.\`);
});`;

// Need to replace the whole onEditalCreated function
content = content.replace(/export const onEditalCreated = onDocumentCreated[\s\S]*?console\.log\(\`Batch matchmaking complete.*?\n\}\);/, newOnEditalCreatedCode);

fs.writeFileSync('functions/src/index.ts', content);
