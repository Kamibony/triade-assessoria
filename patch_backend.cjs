const fs = require('fs');
const filepath = 'functions/src/index.ts';
let code = fs.readFileSync(filepath, 'utf8');

const newFunction = `
export const refreshOscOpportunities = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { targetId } = request.data as { targetId: string };
    if (!targetId) {
        throw new HttpsError('invalid-argument', 'O parâmetro targetId (oscId) é obrigatório.');
    }

    const db = getFirestore();
    const oscRef = db.collection('oscs').doc(targetId);
    const oscDoc = await oscRef.get();

    if (!oscDoc.exists) {
        throw new HttpsError('not-found', 'OSC não encontrada.');
    }

    // Purge existing matches for this OSC
    const existingMatchesSnap = await db.collection('matches').where('oscId', '==', targetId).get();
    const batch = db.batch();
    existingMatchesSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    const oscData = oscDoc.data()!;
    let oscEmbedding = oscData.embedding;

    if (!oscEmbedding) {
        const oscText = \`Missão/Descrição: \${oscData.mission || 'Não especificada'}. Foco: \${(Array.isArray(oscData.coreActivities) ? oscData.coreActivities.join(', ') : 'Não especificadas')}. Nome: \${oscData.name || ''}\`;
        const embedding = await generateTextEmbedding(oscText);
        oscEmbedding = FieldValue.vector(embedding);
        await oscRef.update({ embedding: oscEmbedding });
    }

    const vectorQuery = Array.isArray(oscEmbedding) ? FieldValue.vector(oscEmbedding) : oscEmbedding;

    // Fetch top matching editais
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalEditaisSnapshot = await (db.collection('editais') as any)
        .where('ativo', '==', true)
        .findNearest('embedding', vectorQuery, { limit: 15, distanceMeasure: 'COSINE', distanceResultField: 'vectorDistance' })
        .get();

    const validInternalMatches = internalEditaisSnapshot.docs
        .map((editalDoc: any) => {
            let vectorDistance = (editalDoc.get('vectorDistance') ?? editalDoc.data()?.vectorDistance) as number | undefined;
            let similarity: number;

            if (vectorDistance === undefined || vectorDistance === null) {
                const editalEmbedding = editalDoc.data()?.embedding;
                similarity = cosineSimilarity(oscEmbedding, editalEmbedding);
                vectorDistance = 1 - similarity;
            } else {
                similarity = 1 - vectorDistance;
            }

            return {
                id: editalDoc.id,
                distance: vectorDistance,
                similarity: similarity
            };
        })
        .filter((m: any) => m.similarity >= 0.25);

    // Generate fresh matches
    const newMatches = [];
    for (const match of validInternalMatches) {
        const matchResult = await processMatchEvaluation(targetId, match.id, true);
        if (matchResult && matchResult.id && !matchResult.id.startsWith('error_')) {
             newMatches.push(matchResult);
        }
    }

    const pendingMatchesSnap = await db.collection('matches').where('oscId', '==', targetId).get();
    const pendingMatches = pendingMatchesSnap.docs.filter(doc => {
        const data = doc.data();
        return data.actionState !== 'Aprovado' && data.actionState !== 'Rejeitado' && data.eligibility !== false && !data.verificationResult;
    });

    if (pendingMatches.length === 0) {
        return { success: true, message: 'Novos editais buscados, mas nenhum match pendente para verificação.', jobId: null };
    }

    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    await jobRef.set({
        targetId,
        targetType: 'osc',
        type: 'batch_verification',
        totalTasks: pendingMatches.length,
        completedTasks: 0,
        failedTasks: 0,
        status: 'running',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const queue = getFunctions().taskQueue('verifyMatchConstraintWorker');
    const enqueuePromises = pendingMatches.map(matchDoc =>
        queue.enqueue({ matchId: matchDoc.id, jobId })
    );

    await Promise.all(enqueuePromises);

    return { success: true, jobId, message: \`\${pendingMatches.length} novas oportunidades enfileiradas para verificação.\` };
});
`;

if (!code.includes('refreshOscOpportunities')) {
    code += '\n' + newFunction;
    fs.writeFileSync(filepath, code);
    console.log('Added refreshOscOpportunities');
} else {
    console.log('Already added');
}
