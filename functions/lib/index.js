"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledMatchSweeper = exports.ingestGoogleAlertsRss = exports.onOscUpdated = exports.triggerMatchOrchestrator = exports.onEditalCreated = exports.ingestOscDataFunction = exports.matchEvaluatorWorker = exports.extractEditalRulesFunction = exports.parsePdfProfileFunction = exports.matchSchema = void 0;
exports.processMatchEvaluation = processMatchEvaluation;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-admin/firestore");
const functions_1 = require("firebase-admin/functions");
const admin = __importStar(require("firebase-admin"));
const genkit_1 = require("genkit");
const zod_1 = require("zod");
const google_genai_1 = require("@genkit-ai/google-genai");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const schemas_js_1 = require("./shared/schemas.js");
Object.defineProperty(exports, "matchSchema", { enumerable: true, get: function () { return schemas_js_1.matchSchema; } });
const cheerio = __importStar(require("cheerio"));
const rss_parser_1 = __importDefault(require("rss-parser"));
admin.initializeApp();
const ai = (0, genkit_1.genkit)({
    plugins: [(0, google_genai_1.vertexAI)({ projectId: process.env.GCLOUD_PROJECT || 'triade-assessoria', location: 'us-central1' })],
});
const parsePdfToProfile = ai.defineFlow({
    name: 'parsePdfToProfile',
    inputSchema: zod_1.z.object({
        pdfBase64: zod_1.z.string().describe("Arquivo PDF codificado em Base64"),
    }),
    outputSchema: schemas_js_1.ngoProfileSchema,
}, async (input) => {
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
                ] }
        ],
        output: { schema: schemas_js_1.ngoProfileSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair dados do PDF");
    }
    return response.output;
});
const scoreMatch = ai.defineFlow({
    name: 'scoreMatch',
    inputSchema: zod_1.z.object({
        osc: schemas_js_1.ngoProfileSchema,
        edital: schemas_js_1.editalSchema,
        oscId: zod_1.z.string(),
        editalId: zod_1.z.string()
    }),
    outputSchema: schemas_js_1.matchSchema,
}, async (input) => {
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
        output: { schema: schemas_js_1.matchSchema }
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
});
exports.parsePdfProfileFunction = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return await parsePdfToProfile(request.data);
});
const extractEditalRules = ai.defineFlow({
    name: 'extractEditalRules',
    inputSchema: zod_1.z.object({
        text: zod_1.z.string().optional().describe("Texto bruto do edital"),
        pdfBase64: zod_1.z.string().optional().describe("Arquivo PDF do edital codificado em Base64"),
    }),
    outputSchema: schemas_js_1.editalSchema,
}, async (input) => {
    if (!input.text && !input.pdfBase64) {
        throw new Error("É necessário fornecer 'text' ou 'pdfBase64' do edital.");
    }
    const prompt = `Você é um agente especialista em análise de editais governamentais e privados de financiamento (Grants/Tenders) no Brasil.
Sua tarefa é ler atentamente o texto ou o documento PDF do edital fornecido e extrair com precisão as regras, informações financeiras, datas importantes e os critérios de elegibilidade para ONGs (Organizações da Sociedade Civil - OSCs).

Se alguma informação não estiver explícita, você deve tentar deduzir com base no contexto geral ou, se impossível, preencher de forma condizente. Não invente informações.
Sempre retorne os dados no formato estruturado solicitado em português do Brasil (pt-BR).`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = [{ text: prompt }];
    if (input.pdfBase64) {
        content.push({ media: { url: `data:application/pdf;base64,${input.pdfBase64}` } });
    }
    else if (input.text) {
        content.push({ text: `Texto do edital:\n\n${input.text}` });
    }
    const response = await ai.generate({
        model: 'vertexai/gemini-2.5-flash',
        messages: [
            { role: 'user', content: content }
        ],
        output: { schema: schemas_js_1.editalSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair as regras do edital");
    }
    return response.output;
});
const triageEditalWebpage = ai.defineFlow({
    name: 'triageEditalWebpage',
    inputSchema: zod_1.z.object({
        text: zod_1.z.string().describe("Texto bruto da página web"),
    }),
    outputSchema: schemas_js_1.triageSchema,
}, async (input) => {
    const prompt = `Você é um assistente que filtra notícias para encontrar editais reais de financiamento para ONGs no Brasil.
Vou te passar o texto extraído de uma página web.
Determine se o texto contém as REGRAS e CRITÉRIOS do edital em si (ou se é a página oficial do edital), ou se é apenas uma notícia (press release) comentando que um edital foi lançado, sem os detalhes completos.
Responda com isValidEdital = true apenas se contiver os detalhes do edital.
Justifique sua resposta.
Sempre retorne os dados em português do Brasil (pt-BR).`;
    const response = await ai.generate({
        model: 'vertexai/gemini-2.5-flash',
        messages: [
            { role: 'user', content: [
                    { text: prompt },
                    { text: `Texto:\n\n${input.text.substring(0, 30000)}` }
                ] }
        ],
        output: { schema: schemas_js_1.triageSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao processar a triagem do edital");
    }
    return response.output;
});
async function fetchAndExtractText(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);
        // Remove script, style, nav, footer, etc to get main content
        $('script, style, nav, footer, header, aside, noscript, iframe').remove();
        const text = $('body').text();
        // Clean up whitespace
        return text.replace(/\s+/g, ' ').trim();
    }
    catch (e) {
        console.error("Error fetching text from URL", url, e);
        return "";
    }
}
exports.extractEditalRulesFunction = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return await extractEditalRules(request.data);
});
const firestore_2 = require("firebase-functions/v2/firestore");
async function processMatchEvaluation(oscId, editalId, forceRecalculate = false) {
    const db = (0, firestore_1.getFirestore)();
    // Fetch OSC and Edital
    const oscDoc = await db.collection('oscs').doc(oscId).get();
    const editalDoc = await db.collection('editais').doc(editalId).get();
    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error(`OSC (${oscId}) or Edital (${editalId}) not found`);
    }
    const rawOscData = oscDoc.data();
    const rawEditalData = editalDoc.data();
    // Fix 4: Dirty Data Resilience (use safeParse)
    const oscParseResult = schemas_js_1.ngoProfileSchema.safeParse(rawOscData);
    const editalParseResult = schemas_js_1.editalSchema.safeParse(rawEditalData);
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
    let existingMatchRef = null;
    let existingMatchData = null;
    if (!matchesQuery.empty) {
        existingMatchRef = matchesQuery.docs[0]?.ref || null;
        existingMatchData = matchesQuery.docs[0]?.data() || null;
    }
    // Helper for safe timestamp extraction
    const getMillis = (field) => {
        if (!field)
            return null;
        if (typeof field.toMillis === 'function')
            return field.toMillis();
        if (field instanceof Date)
            return field.getTime();
        if (typeof field === 'string' || typeof field === 'number') {
            const date = new Date(field);
            if (!isNaN(date.getTime()))
                return date.getTime();
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
            }
            else if (matchTime >= oscUpdateTime && matchTime >= editalUpdateTime) {
                console.log(`Returning cached match for OSC ${oscId} and Edital ${editalId}`);
                return existingMatchData;
            }
            else {
                // Cache is stale
                shouldRecalculate = true;
            }
        }
        else {
            // Missing createdAt timestamp
            shouldRecalculate = true;
        }
    }
    else if (!existingMatchData) {
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
        createdAt: firestore_1.FieldValue.serverTimestamp()
    };
    await matchRef.set(matchDocData, { merge: true });
    return matchDocData;
}
exports.matchEvaluatorWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 30,
    },
    rateLimits: {
        maxConcurrentDispatches: 5, // Prevent Vertex AI rate limits (HTTP 429)
    },
    timeoutSeconds: 540 // Allow enough time for Genkit execution
}, async (request) => {
    const { oscId, editalId } = request.data;
    if (!oscId || !editalId) {
        console.error("Invalid task payload: missing oscId or editalId.");
        return;
    }
    try {
        await processMatchEvaluation(oscId, editalId);
        console.log(`Successfully processed task for OSC ${oscId} and Edital ${editalId}`);
    }
    catch (error) {
        console.error(`Task execution failed for OSC ${oscId} and Edital ${editalId}`, error);
        throw error; // Let the queue handle the retry
    }
});
exports.ingestOscDataFunction = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 540,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { cnpjs } = request.data;
    if (!cnpjs || !Array.isArray(cnpjs) || cnpjs.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'A list of CNPJs is required.');
    }
    const db = (0, firestore_1.getFirestore)();
    const results = [];
    for (const cnpj of cnpjs) {
        try {
            // Clean CNPJ (remove non-digits)
            const cleanCnpj = cnpj.replace(/\D/g, '');
            if (cleanCnpj.length !== 14) {
                results.push({ cnpj, status: 'error', error: 'Invalid CNPJ length' });
                continue;
            }
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (!response.ok) {
                results.push({ cnpj, status: 'error', error: `BrasilAPI returned ${response.status}` });
                continue;
            }
            const rawData = await response.json();
            // Transform data to match ngoProfileSchema
            const name = rawData.razao_social || 'Nome Desconhecido';
            const foundationDate = rawData.data_inicio_atividade || new Date().toISOString().split('T')[0];
            const city = rawData.municipio || 'Cidade Desconhecida';
            const state = rawData.uf || 'UF';
            const location = `${city}/${state}`;
            // Add dummy data for required fields not in BrasilAPI
            const transformedData = {
                name,
                foundationDate,
                location,
                documentationStatus: 'Pendente',
                previousProjectsApproved: false,
                coreActivities: ['Assistência Social', 'Educação'], // Default dummy activities
            };
            const parseResult = schemas_js_1.ngoProfileSchema.safeParse(transformedData);
            if (!parseResult.success) {
                results.push({ cnpj, status: 'error', error: 'Failed schema validation', });
                console.warn(`Validation failed for CNPJ ${cnpj}:`, parseResult.error);
                continue;
            }
            const oscRef = db.collection('oscs').doc(cleanCnpj);
            const oscDoc = await oscRef.get();
            const now = firestore_1.FieldValue.serverTimestamp();
            const upsertData = {
                ...parseResult.data,
                cnpj: cleanCnpj,
                updatedAt: now,
            };
            if (!oscDoc.exists) {
                Object.assign(upsertData, { createdAt: now });
            }
            await oscRef.set(upsertData, { merge: true });
            results.push({ cnpj, status: 'success' });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            results.push({ cnpj, status: 'error', error: errorMessage });
            console.error(`Error processing CNPJ ${cnpj}:`, error);
        }
    }
    return { results };
});
exports.onEditalCreated = (0, firestore_2.onDocumentCreated)('editais/{editalId}', async (event) => {
    const editalSnapshot = event.data;
    if (!editalSnapshot) {
        console.log("No data associated with the event.");
        return;
    }
    const editalId = event.params.editalId;
    const db = (0, firestore_1.getFirestore)();
    const oscsSnapshot = await db.collection('oscs').get();
    const queue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
    const enqueuePromises = oscsSnapshot.docs.map(oscDoc => {
        return queue.enqueue({
            oscId: oscDoc.id,
            editalId: editalId
        });
    });
    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${oscsSnapshot.docs.length} match tasks for new Edital ${editalId}.`);
});
exports.triggerMatchOrchestrator = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { editalId, oscId, forceRecalculate } = request.data;
    if (!editalId || !oscId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing editalId or oscId.');
    }
    try {
        const matchResult = await processMatchEvaluation(oscId, editalId, forceRecalculate);
        return matchResult;
    }
    catch (error) {
        console.error('Error generating match:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error generating match.';
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
exports.onOscUpdated = (0, firestore_2.onDocumentUpdated)('oscs/{oscId}', async (event) => {
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
    const hasCriticalChanges = criticalFields.some(field => JSON.stringify(beforeData[field]) !== JSON.stringify(afterData[field]));
    if (!hasCriticalChanges) {
        console.log(`No critical fields changed for OSC ${event.params.oscId}. Skipping match evaluation.`);
        return;
    }
    const oscId = event.params.oscId;
    const db = (0, firestore_1.getFirestore)();
    // Fetch all open editais (assuming we might want a status check, for now fetch all)
    // Actually we will just fetch all editais for simplicity based on the current schema logic
    const editaisSnapshot = await db.collection('editais').get();
    const queue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
    const enqueuePromises = editaisSnapshot.docs.map(editalDoc => {
        return queue.enqueue({
            oscId: oscId,
            editalId: editalDoc.id
        });
    });
    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${editaisSnapshot.docs.length} match tasks for OSC update ${oscId}.`);
});
exports.ingestGoogleAlertsRss = (0, scheduler_1.onSchedule)('0 2 * * *', async () => {
    const RSS_URLS = [
        // Mock Google Alerts RSS URLs
        "https://news.google.com/rss/search?q=edital+ONG+OR+OSC+brasil",
        "https://news.google.com/rss/search?q=financiamento+projetos+culturais+edital"
    ];
    const parser = new rss_parser_1.default();
    const db = (0, firestore_1.getFirestore)();
    let processedCount = 0;
    let savedCount = 0;
    for (const feedUrl of RSS_URLS) {
        try {
            console.log(`Fetching RSS feed: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);
            for (const item of feed.items) {
                if (!item.link)
                    continue;
                // Check if already ingested
                const existingEdital = await db.collection('editais').where('sourceUrl', '==', item.link).get();
                if (!existingEdital.empty) {
                    console.log(`Skipping already ingested link: ${item.link}`);
                    continue;
                }
                processedCount++;
                console.log(`Processing link: ${item.link}`);
                const text = await fetchAndExtractText(item.link);
                if (!text || text.length < 500) {
                    console.log(`Skipping: Text too short or extraction failed for ${item.link}`);
                    continue;
                }
                const triageResult = await triageEditalWebpage({ text });
                console.log(`Triage for ${item.link}: isValidEdital=${triageResult.isValidEdital}, reason=${triageResult.reason}`);
                if (triageResult.isValidEdital) {
                    try {
                        const editalResult = await extractEditalRules({ text });
                        const parseResult = schemas_js_1.editalSchema.safeParse(editalResult);
                        if (parseResult.success) {
                            const editalDocData = {
                                ...parseResult.data,
                                rawText: text.substring(0, 5000), // Save a snippet
                                sourceUrl: item.link,
                                createdAt: firestore_1.FieldValue.serverTimestamp(),
                            };
                            const editalRef = db.collection('editais').doc();
                            await editalRef.set(editalDocData);
                            savedCount++;
                            console.log(`Successfully saved Edital from ${item.link}`);
                        }
                        else {
                            console.warn(`Validation failed for extracted Edital from ${item.link}:`, parseResult.error);
                        }
                    }
                    catch (e) {
                        console.error(`Error extracting rules for ${item.link}:`, e);
                    }
                }
            }
        }
        catch (error) {
            console.error(`Error fetching or parsing RSS feed ${feedUrl}:`, error);
        }
    }
    console.log(`Ingestion complete. Processed ${processedCount} items, saved ${savedCount} valid editais.`);
});
exports.scheduledMatchSweeper = (0, scheduler_1.onSchedule)('0 0 * * 0', async () => {
    const db = (0, firestore_1.getFirestore)();
    const editaisSnapshot = await db.collection('editais').get();
    const oscsSnapshot = await db.collection('oscs').get();
    const queue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
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
//# sourceMappingURL=index.js.map