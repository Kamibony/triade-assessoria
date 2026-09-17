const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const oldBlock = `    // Generate fresh matches
    const newMatches = [];
    for (const match of validInternalMatches) {
        const matchResult = await processMatchEvaluation(targetId, match.id, true);
        if (matchResult && matchResult.id && typeof matchResult.id === 'string' && !matchResult.id.startsWith('error_')) {
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

    return { success: true, jobId, message: \`\${pendingMatches.length} novas oportunidades enfileiradas para verificação.\` };`;

const newBlock = `    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    if (validInternalMatches.length === 0) {
        return { success: true, message: 'Nenhuma oportunidade encontrada.', jobId: null };
    }

    await jobRef.set({
        targetId,
        targetType: 'osc',
        type: 'batch_verification',
        totalTasks: validInternalMatches.length,
        completedTasks: 0,
        failedTasks: 0,
        status: 'running',
        matchesTriggered: validInternalMatches.length,
        matchesEvaluated: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    // Generate fresh matches decoupled using matchEvaluatorWorker
    const queue = getFunctions().taskQueue('matchEvaluatorWorker');
    const enqueuePromises = validInternalMatches.map(match =>
        queue.enqueue({ oscId: targetId, editalId: match.id, jobId })
    );

    await Promise.all(enqueuePromises);

    return { success: true, jobId, message: \`\${validInternalMatches.length} novas oportunidades enfileiradas para avaliação.\` };`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync('functions/src/index.ts', content);
