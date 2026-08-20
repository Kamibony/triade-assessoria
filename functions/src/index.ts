import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import * as admin from 'firebase-admin';
import { genkit } from 'genkit';
import { z } from 'zod';
import { vertexAI } from '@genkit-ai/google-genai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { ngoProfileSchema, editalSchema, matchSchema } from './shared/schemas.js';

admin.initializeApp();

const ai = genkit({
    plugins: [vertexAI({ projectId: process.env.GCLOUD_PROJECT || 'triade-assessoria', location: 'us-central1' })],
});

export { matchSchema };

const parsePdfToProfile = ai.defineFlow(
    {
        name: 'parsePdfToProfile',
        inputSchema: z.object({
            pdfBase64: z.string().describe("Arquivo PDF codificado em Base64"),
        }),
        outputSchema: ngoProfileSchema,
    },
    async (input) => {
        const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social ou Cartão CNPJ de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: [
                    { text: prompt },
                    { media: { url: `data:application/pdf;base64,${input.pdfBase64}` } }
                ]}
            ],
            output: { schema: ngoProfileSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao extrair dados do PDF");
        }
        return response.output;
    }
);



const scoreMatch = ai.defineFlow(
    {
        name: 'scoreMatch',
        inputSchema: z.object({
            osc: ngoProfileSchema,
            edital: editalSchema,
            oscId: z.string(),
            editalId: z.string()
        }),
        outputSchema: matchSchema,
    },
    async (input) => {
        const prompt = `Você é um agente especialista em avaliação de projetos culturais para leis de incentivo no Brasil, atuando pela Tríade Assessoria.

A sua tarefa é cruzar os dados de uma ONG com as regras e critérios de elegibilidade de um Edital específico e determinar o Match (compatibilidade).

Perfil da ONG:
Nome: ${input.osc.name}
Data de Fundação: ${input.osc.foundationDate}
Localização: ${input.osc.location}
Status da Documentação: ${input.osc.documentationStatus}
Projetos Culturais Anteriores: ${input.osc.previousProjectsApproved ? 'Sim' : 'Não'}
Atividades Principais: ${input.osc.coreActivities.join(', ')}

Regras do Edital:
Título: ${input.edital.title}
Emissor: ${input.edital.issuer}
Critérios de Elegibilidade:
- Anos mínimos de atividade: ${input.edital.eligibilityCriteria.minYearsActive}
- Localizações exigidas: ${input.edital.eligibilityCriteria.requiredLocations.join(', ')}
- Documentação exigida: ${input.edital.eligibilityCriteria.requiredDocumentation.join(', ')}
- Atividades permitidas: ${input.edital.eligibilityCriteria.allowedActivities.join(', ')}

Avalie os critérios cruzando a ONG com o Edital.
Gere um 'matchScore' de 0 a 100 indicando o grau de compatibilidade.
Determine 'eligibility' (true ou false).
Forneça um 'reasoning' (justificativa detalhada para a nota e elegibilidade).
Se a ONG for INELEGÍVEL ou tiver nota baixa, você DEVE gerar um 'actionPlan' (Plano de Ação) estruturado.
Responda estritamente em português do Brasil (pt-BR).
`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            prompt: prompt,
            output: { schema: matchSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar resultado de match");
        }

        // Garante que os IDs repassados na entrada retornem na saída
        return {
            ...response.output,
            editalId: input.editalId,
            oscId: input.oscId
        };
    }
);


export const parsePdfProfileFunction = onCall({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return await parsePdfToProfile(request.data);
});

const extractEditalRules = ai.defineFlow(
    {
        name: 'extractEditalRules',
        inputSchema: z.object({
            text: z.string().optional().describe("Texto bruto do edital"),
            pdfBase64: z.string().optional().describe("Arquivo PDF do edital codificado em Base64"),
        }),
        outputSchema: editalSchema,
    },
    async (input) => {
        if (!input.text && !input.pdfBase64) {
            throw new Error("É necessário fornecer 'text' ou 'pdfBase64' do edital.");
        }

        const prompt = `Você é um agente especialista em análise de editais governamentais e privados de financiamento (Grants/Tenders) no Brasil.
Sua tarefa é ler atentamente o texto ou o documento PDF do edital fornecido e extrair com precisão as regras, informações financeiras, datas importantes e os critérios de elegibilidade para ONGs (Organizações da Sociedade Civil - OSCs).

Se alguma informação não estiver explícita, você deve tentar deduzir com base no contexto geral ou, se impossível, preencher de forma condizente. Não invente informações.
Sempre retorne os dados no formato estruturado solicitado em português do Brasil (pt-BR).`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [{ text: prompt }];

        if (input.pdfBase64) {
             content.push({ media: { url: `data:application/pdf;base64,${input.pdfBase64}` } });
        } else if (input.text) {
             content.push({ text: `Texto do edital:\n\n${input.text}` });
        }

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: content }
            ],
            output: { schema: editalSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao extrair as regras do edital");
        }
        return response.output;
    }
);


export const extractEditalRulesFunction = onCall({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return await extractEditalRules(request.data);
});



import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';


export async function processMatchEvaluation(oscId: string, editalId: string, forceRecalculate: boolean = false) {
    const db = getFirestore();

    // Fetch OSC and Edital
    const oscDoc = await db.collection('oscs').doc(oscId).get();
    const editalDoc = await db.collection('editais').doc(editalId).get();

    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error(`OSC (${oscId}) or Edital (${editalId}) not found`);
    }

    const rawOscData = oscDoc.data();
    const rawEditalData = editalDoc.data();

    // Fix 4: Dirty Data Resilience (use safeParse)
    const oscParseResult = ngoProfileSchema.safeParse(rawOscData);
    const editalParseResult = editalSchema.safeParse(rawEditalData);

    if (!oscParseResult.success) {
        console.warn(`Invalid OSC data for ${oscId}:`, oscParseResult.error);
        throw new Error(`Invalid OSC data for ${oscId}`);
    }
    if (!editalParseResult.success) {
        console.warn(`Invalid Edital data for ${editalId}:`, editalParseResult.error);
        throw new Error(`Invalid Edital data for ${editalId}`);
    }

    const oscData = oscParseResult.data;
    const editalData = editalParseResult.data;

    // Check for existing match
    const matchesQuery = await db.collection('matches')
        .where('oscId', '==', oscId)
        .where('editalId', '==', editalId)
        .limit(1)
        .get();

    let existingMatchRef: FirebaseFirestore.DocumentReference | null = null;
    let existingMatchData: Record<string, unknown> | null = null;

    if (!matchesQuery.empty) {
        existingMatchRef = matchesQuery.docs[0]?.ref || null;
        existingMatchData = matchesQuery.docs[0]?.data() || null;
    }

    // Helper for safe timestamp extraction
    const getMillis = (field: any): number | null => {
        if (!field) return null;
        if (typeof field.toMillis === 'function') return field.toMillis();
        if (field instanceof Date) return field.getTime();
        if (typeof field === 'string' || typeof field === 'number') {
            const date = new Date(field);
            if (!isNaN(date.getTime())) return date.getTime();
        }
        return null;
    };

    // Fix 6: Robust timestamp validation for caching
    let shouldRecalculate = forceRecalculate;

    if (!shouldRecalculate && existingMatchData) {
        if (existingMatchData.createdAt) {
            const matchTime = getMillis(existingMatchData.createdAt);
            const oscUpdateTime = getMillis(rawOscData?.updatedAt);
            const editalUpdateTime = getMillis(rawEditalData?.updatedAt);

            // If we can't reliably determine any timestamp, force recalculation
            if (matchTime === null || oscUpdateTime === null || editalUpdateTime === null) {
                shouldRecalculate = true;
            } else if (matchTime >= oscUpdateTime && matchTime >= editalUpdateTime) {
                console.log(`Returning cached match for OSC ${oscId} and Edital ${editalId}`);
                return existingMatchData;
            } else {
                // Cache is stale
                shouldRecalculate = true;
            }
        } else {
            // Missing createdAt timestamp
            shouldRecalculate = true;
        }
    } else if (!existingMatchData) {
        shouldRecalculate = true;
    }

    if (!shouldRecalculate) {
        return existingMatchData;
    }

    console.log(`Evaluating match for OSC ${oscId} and Edital ${editalId}`);
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

export const matchEvaluatorWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 30,
    },
    rateLimits: {
        maxConcurrentDispatches: 5, // Prevent Vertex AI rate limits (HTTP 429)
    },
    timeoutSeconds: 540 // Allow enough time for Genkit execution
}, async (request) => {
    const { oscId, editalId } = request.data as { oscId: string, editalId: string };

    if (!oscId || !editalId) {
        console.error("Invalid task payload: missing oscId or editalId.");
        return;
    }

    try {
        await processMatchEvaluation(oscId, editalId);
        console.log(`Successfully processed task for OSC ${oscId} and Edital ${editalId}`);
    } catch (error) {
        console.error(`Task execution failed for OSC ${oscId} and Edital ${editalId}`, error);
        throw error; // Let the queue handle the retry
    }
});


export const onEditalCreated = onDocumentCreated('editais/{editalId}', async (event) => {
    const editalSnapshot = event.data;
    if (!editalSnapshot) {
        console.log("No data associated with the event.");
        return;
    }

    const editalId = event.params.editalId;
    const db = getFirestore();
    const oscsSnapshot = await db.collection('oscs').get();

    const queue = getFunctions().taskQueue('matchEvaluatorWorker');

    const enqueuePromises = oscsSnapshot.docs.map(oscDoc => {
        return queue.enqueue({
            oscId: oscDoc.id,
            editalId: editalId
        });
    });

    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${oscsSnapshot.docs.length} match tasks for new Edital ${editalId}.`);
});


export const triggerMatchOrchestrator = onCall({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { editalId, oscId, forceRecalculate } = request.data;

    if (!editalId || !oscId) {
        throw new HttpsError('invalid-argument', 'Missing editalId or oscId.');
    }

    try {
        const matchResult = await processMatchEvaluation(oscId, editalId, forceRecalculate);
        return matchResult;
    } catch (error: unknown) {
        console.error('Error generating match:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error generating match.';
        throw new HttpsError('internal', errorMessage);
    }
});


export const onOscUpdated = onDocumentUpdated('oscs/{oscId}', async (event) => {
    const oscSnapshot = event.data?.after;
    const oscBefore = event.data?.before;

    if (!oscSnapshot || !oscBefore) {
        console.log("No data associated with the event.");
        return;
    }

    const beforeData = oscBefore.data();
    const afterData = oscSnapshot.data();

    // Fix 1: Trigger Cascades - Strict diff check
    const criticalFields = ['location', 'coreActivities', 'documentationStatus', 'foundationDate', 'previousProjectsApproved'];
    const hasCriticalChanges = criticalFields.some(field =>
        JSON.stringify(beforeData[field]) !== JSON.stringify(afterData[field])
    );

    if (!hasCriticalChanges) {
        console.log(`No critical fields changed for OSC ${event.params.oscId}. Skipping match evaluation.`);
        return;
    }

    const oscId = event.params.oscId;
    const db = getFirestore();

    // Fetch all open editais (assuming we might want a status check, for now fetch all)
    // Actually we will just fetch all editais for simplicity based on the current schema logic
    const editaisSnapshot = await db.collection('editais').get();
    const queue = getFunctions().taskQueue('matchEvaluatorWorker');

    const enqueuePromises = editaisSnapshot.docs.map(editalDoc => {
        return queue.enqueue({
            oscId: oscId,
            editalId: editalDoc.id
        });
    });

    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${editaisSnapshot.docs.length} match tasks for OSC update ${oscId}.`);
});


export const scheduledMatchSweeper = onSchedule('0 0 * * 0', async () => {
    const db = getFirestore();
    const editaisSnapshot = await db.collection('editais').get();
    const oscsSnapshot = await db.collection('oscs').get();
    const queue = getFunctions().taskQueue('matchEvaluatorWorker');

    const oscIds = oscsSnapshot.docs.map(doc => doc.id);
    let enqueuedCount = 0;

    for (const editalDoc of editaisSnapshot.docs) {
        const editalId = editalDoc.id;

        // Check which OSCs already have matches for this Edital
        const matchesQuery = await db.collection('matches')
            .where('editalId', '==', editalId)
            .get();

        const matchedOscIds = new Set(matchesQuery.docs.map(doc => doc.data().oscId));

        // Find missing oscIds
        const missingOscIds = oscIds.filter(id => !matchedOscIds.has(id));

        console.log(`Sweeping ${missingOscIds.length} missing matches for Edital ${editalId}`);

        const enqueuePromises = missingOscIds.map(oscId => {
            return queue.enqueue({
                oscId: oscId,
                editalId: editalId
            });
        });

        await Promise.all(enqueuePromises);
        enqueuedCount += missingOscIds.length;
    }

    console.log(`Weekly sweeper complete. Enqueued ${enqueuedCount} missing matches.`);
});
