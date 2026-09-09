const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');

const targetFunctionStart = code.indexOf('export const triggerBulkInternalMatch = onCall(');
const searchSnippet = `    const { cidade, limit = 100 } = request.data as { cidade: string, limit?: number };
    if (!cidade) {
        throw new HttpsError('invalid-argument', 'O parâmetro cidade é obrigatório.');
    }

    try {
        const oscsSnapshot = await db.collection('oscs').get();`;

const replaceSnippet = `    const { cidade, limit = 100 } = request.data as { cidade: string, limit?: number };
    if (!cidade) {
        throw new HttpsError('invalid-argument', 'O parâmetro cidade é obrigatório.');
    }

    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    try {
        const oscsSnapshot = await db.collection('oscs').get();`;

code = code.replace(searchSnippet, replaceSnippet);


const searchSnippet2 = `        const lowerCidade = cidade.toLowerCase();
        oscs = oscs.filter(osc => typeof osc.location === 'string' && osc.location.toLowerCase().includes(lowerCidade));
        oscs = oscs.slice(0, limit);

        let matchesTriggered = 0;
        const matchEvaluatorQueue = getFunctions().taskQueue('matchEvaluatorWorker');

        for (const osc of oscs) {`;

const replaceSnippet2 = `        const lowerCidade = cidade.toLowerCase();
        oscs = oscs.filter(osc => typeof osc.location === 'string' && osc.location.toLowerCase().includes(lowerCidade));
        oscs = oscs.slice(0, limit);

        await jobRef.set({
            type: 'bulk_match',
            status: 'running',
            cidade: cidade,
            totalOscs: oscs.length,
            oscsProcessed: 0,
            matchesTriggered: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        let matchesTriggered = 0;
        let oscsProcessed = 0;
        const matchEvaluatorQueue = getFunctions().taskQueue('matchEvaluatorWorker');

        for (const osc of oscs) {`;

code = code.replace(searchSnippet2, replaceSnippet2);

const searchSnippet3 = `            for (const match of validInternalMatches) {
                await matchEvaluatorQueue.enqueue({
                    oscId: osc.id,
                    editalId: match.id
                });
                matchesTriggered++;
            }
        }`;

const replaceSnippet3 = `            for (const match of validInternalMatches) {
                await matchEvaluatorQueue.enqueue({
                    oscId: osc.id,
                    editalId: match.id
                });
                matchesTriggered++;
            }

            oscsProcessed++;
            if (oscsProcessed % 5 === 0 || oscsProcessed === oscs.length) {
                await jobRef.update({
                    oscsProcessed: oscsProcessed,
                    matchesTriggered: matchesTriggered,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

        await jobRef.update({
            status: 'completed',
            oscsProcessed: oscsProcessed,
            matchesTriggered: matchesTriggered,
            updatedAt: FieldValue.serverTimestamp()
        });`;

code = code.replace(searchSnippet3, replaceSnippet3);

const searchSnippetError = `        console.error('Error in triggerBulkInternalMatch:', error);
        throw new HttpsError('internal', 'Erro interno ao processar matches em massa.');
    }
});`;

const replaceSnippetError = `        console.error('Error in triggerBulkInternalMatch:', error);
        await jobRef.update({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: FieldValue.serverTimestamp()
        }).catch(e => console.error('Failed to update job status on error:', e));
        throw new HttpsError('internal', 'Erro interno ao processar matches em massa.');
    }
});`;

code = code.replace(searchSnippetError, replaceSnippetError);


fs.writeFileSync('functions/src/index.ts', code);
