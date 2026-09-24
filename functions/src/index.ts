process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
import { createConverter } from './converters/index.js';

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
import chromiumSparticuz from '@sparticuz/chromium';
// @ts-ignore
const pLimit = require('p-limit');
// @ts-ignore
const { PDFParse } = require('pdf-parse');
import stealth from 'puppeteer-extra-plugin-stealth';
import { getFirestore, FieldValue, FieldPath } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFunctions } from 'firebase-admin/functions';
import { ProsasScraper } from './scrapers/ProsasScraper.js';
import { VertexAIScraper } from './scrapers/VertexAIScraper.js';
import { BraveScraper } from './scrapers/BraveScraper.js';
import { IScraperStrategy } from './scrapers/interfaces.js';
import * as admin from 'firebase-admin';
import { defineString, defineSecret } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';
import { genkit } from 'genkit';
export function formatGenkitError(error: unknown, defaultMessage: string = "Erro interno desconhecido.") {
    let message = defaultMessage;
    if (error instanceof Error) {
        if (error.message.includes("429") || error.message.includes("Quota")) {
            message = "Cota diária de IA esgotada. Tente novamente amanhã.";
        } else if (error.message.includes("403") || error.message.includes("fetch") || error.message.includes("auth") || error.message.includes("Unable to authenticate your request")) {
            message = "Erro de comunicação com o serviço de IA. Verifique as credenciais ou permissões.";
        } else if (error.message.includes("Unknown action type returned from plugin vertexai")) {
             message = "Erro interno: Versão do plugin vertexai incompatível ou ação desconhecida.";
        } else {
             message = error.message;
        }
    }
    console.error("Original raw error:", error);
    return new HttpsError("internal", message);
}
import { z } from 'zod';
import { vertexAI } from '@genkit-ai/google-genai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import * as logger from 'firebase-functions/logger';
import { ngoProfileSchema, editalSchema, matchSchema, bureaucracySchema, triageSchema, copilotResponseSchema, verificationResultSchema, reverseMatchResultSchema } from '../../shared/schemas/index.js';

const oscConverter = createConverter(ngoProfileSchema);
const editalConverter = createConverter(editalSchema);
const matchConverter = createConverter(matchSchema);
import * as cheerio from 'cheerio';
const Parser = require('rss-parser');

import { cosineSimilarity, findTopVectorMatches } from './services/vectorSearch.js';
import { safeEnqueueTasks } from './services/safeTasks.js';

const braveApiKeyString = defineString('BRAVE_SEARCH_API_KEY');
const vertexAiSearchEngineIdString = defineString('VERTEX_AI_SEARCH_ENGINE_ID');
const vertexAiSearchLocationString = defineString('VERTEX_AI_SEARCH_LOCATION');
const vertexAiSearchProjectIdString = defineString('VERTEX_AI_SEARCH_PROJECT_ID');

function removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    const defaultHeaders = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TriadeAssessoria/1.0)'
    };
    const opts = { ...options, headers: { ...defaultHeaders, ...options.headers } };

    for (let i = 0; i < retries; i++) {
        try {
            // Use AbortSignal.timeout if available (Node 17.3+), fallback to AbortController otherwise.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const signal = (AbortSignal as any).timeout ? (AbortSignal as any).timeout(15000) : undefined;
            const res = await fetch(url, { ...opts, signal });

            if (!res.ok) {
                throw new Error(`API returned ${res.status} for ${url}`);
            }
            return res;
        } catch (error: unknown) {
            const err = error as Error;
            logger.warn(`Fetch attempt ${i + 1} failed for ${url}: ${err.message}`);
            if (i === retries - 1) throw err;

            let backoffTime = 2000 * Math.pow(2, i);
            if (err.message.includes('429')) {
                // Aggressive exponential backoff for 429 Too Many Requests
                backoffTime = Math.min(3000 * Math.pow(2, i), 30000);
                // Add random jitter between 0 and 1000ms
                backoffTime += Math.floor(Math.random() * 1000);
            }
            await new Promise(resolve => setTimeout(resolve, backoffTime)); // Exponential backoff
        }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

admin.initializeApp();

const ai = genkit({
    plugins: [vertexAI({ location: 'us-central1' })],
});

const parsePdfToProfile = ai.defineFlow(
    {
        name: 'parsePdfToProfile',
        inputSchema: z.object({
            storagePaths: z.array(z.string()).describe("Caminhos no Storage para os arquivos PDF"),
        }),
        outputSchema: ngoProfileSchema,
    },
    async (input) => {
        const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social, Cartão CNPJ e/ou ATA de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Você DEVE extrair o CNPJ, Nome (Legal Name), Missão/Foco de atuação (do Estatuto) e a Validade da Diretoria (da ATA).
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).
CRÍTICO: Do NOT invent or generate example data. Se o texto fornecido for insuficiente, vazio ou não contiver dados reais de OSC, NÃO crie dados fictícios.`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [{ text: prompt }];
        let totalExtractedLength = 0;

        const bucket = getStorage().bucket();

        for (let i = 0; i < input.storagePaths.length; i++) {
            try {
                const path = input.storagePaths[i];
                if (!path) continue;

                const file = bucket.file(path);
                const [exists] = await file.exists();
                if (!exists) {
                    console.warn(`Arquivo não encontrado no Storage: ${path}`);
                    continue;
                }

                const [buffer] = await file.download();
                const uint8Array = new Uint8Array(buffer);
                const parser = new (PDFParse as any)(uint8Array, { max: 10 });
            const pdfData = await parser.getText();

                const extractedText = pdfData.text.substring(0, 15000);
                totalExtractedLength += extractedText.length;
                console.log(`Extracted ${extractedText.length} characters from PDF ${i + 1}`);
                content.push({ text: `Conteúdo do Documento ${i + 1}:\n\n${extractedText}` });
            } catch (error) {
                console.warn(`Falha ao analisar o PDF no índice ${i}:`, error);
                // Allow process to continue even if one PDF fails.
            }
        }

        if (totalExtractedLength < 50) {
            throw new Error("Falha ao extrair texto do(s) PDF(s) (texto insuficiente ou vazio).");
        }

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: content }
            ],
            output: { schema: ngoProfileSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao extrair dados do PDF");
        }

        const output = response.output;

        // Strict Fallback Validation
        const fakeCnpjs = ['12.345.678/0001-90', '00.000.000/0001-00', '11.111.111/1111-11'];
        const fakeNameTokens = ['exemplo', 'nome da ong', 'associação de cultura e arte sem fronteiras'];

        const lowerName = (output.name || '').toLowerCase();

        if (output.cnpj && fakeCnpjs.includes(output.cnpj)) {
             throw new Error("Fake data hallucinated by LLM: Invalid CNPJ detected.");
        }

        if (fakeNameTokens.some(token => lowerName.includes(token))) {
             throw new Error("Fake data hallucinated by LLM: Fake name detected.");
        }

        return output;
    }
);



export const bureaucracyAgentFlow = ai.defineFlow(
    {
        name: 'bureaucracyAgentFlow',
        inputSchema: z.object({
            osc: ngoProfileSchema,
            edital: editalSchema,
        }),
        outputSchema: bureaucracySchema,
    },
    async (input) => {
        const currentDate = new Date().toISOString().split('T')[0];
        const prompt = `Você é um Agente de Burocracia estrito avaliando a elegibilidade de uma ONG para um Edital.
Seu trabalho é APENAS olhar para restrições e regras rígidas. Você não avalia alinhamento de projeto, missão ou tema.

Data atual do sistema: ${currentDate}.

Regras de Ouro:
1. Prazos: Se a data limite do edital (${input.edital.deadline}) for anterior à data atual, a ONG é INELEGÍVEL. Lembre-se que o ano atual é 2026. Rejeite qualquer edital com prazo no passado.
2. Localização: Se o edital exige localizações específicas (${input.edital.eligibilityCriteria.requiredLocations.join(', ')}) e a ONG (${input.osc.location}) não está nelas (ou se a abrangência não for nacional/ampla o suficiente para incluí-la), a ONG é INELEGÍVEL.
3. Idade da ONG: Calcule os anos desde a data de fundação (${input.osc.foundationDate}) até hoje. Se for menor que o mínimo exigido pelo edital (${input.edital.eligibilityCriteria.minYearsActive}), a ONG é INELEGÍVEL.

Se faltarem informações no perfil da ONG (ex: fundação ou localização desconhecidas) ou houver incerteza, NÃO REJEITE. Presuma que é elegível para posterior verificação.
Retorne { passesBureaucracy: false, rejectionReason: '...' } APENAS se houver violação EXPLÍCITA e DEFINITIVA de prazo, local ou idade.
Retorne { passesBureaucracy: true, rejectionReason: null } se passar por TODAS as regras ou se houver incerteza/dados pendentes.
Responda APENAS com o JSON. NÃO explique o seu pensamento.`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            prompt: prompt,
            config: { temperature: 0.0 }, // Hard constraints require deterministic output
            output: { schema: bureaucracySchema }
        });

        if (!response.output) {
            throw new Error("Falha na avaliação burocrática");
        }
        return response.output;
    }
);

export const thematicAgentFlow = ai.defineFlow(
    {
        name: 'thematicAgentFlow',
        inputSchema: z.object({
            osc: ngoProfileSchema,
            edital: editalSchema,
            oscId: z.string(),
            editalId: z.string()
        }),
        outputSchema: matchSchema,
    },
    async (input) => {
        const prompt = `Você é um Analista de Alinhamento Temático e Semântico, atuando pela Tríade Assessoria.
Esta ONG já passou pela triagem burocrática e é elegível em termos de localização, tempo e prazo.
Sua tarefa agora é cruzar o perfil da ONG com as regras temáticas e o objetivo do Edital para determinar o grau de alinhamento (Match Score).

Perfil da ONG:
Nome: ${input.osc.name}
Missão: ${input.osc.mission || 'Não especificada'}
Projetos Anteriores: ${input.osc.previousProjectsApproved ? 'Sim' : 'Não'}
Atividades Principais: ${(input.osc.coreActivities || []).join(', ')}

Objetivo/Tema do Edital:
Título: ${input.edital.title}
Emissor: ${input.edital.issuer}
Atividades Permitidas/Foco: ${input.edital.eligibilityCriteria.allowedActivities.join(', ')}

Instruções:
- Gere um 'matchScore' de 0 a 100 indicando o grau de compatibilidade (Alinhamento Temático).
- Forneça um 'reasoning' detalhado justificando o score com base no alinhamento da missão e atividades da ONG com o foco do edital.
- Forneça um 'aiSummary' (um resumo de 1-2 frases destacando os pontos fortes).
- Forneça 'badges' (2 a 3 tags curtas, ex: 'Alinhamento Perfeito', 'Missão Similar').
- Forneça um 'actionPlan' focado em como a ONG deve abordar a proposta baseada nas suas atividades.

Responda estritamente em português do Brasil (pt-BR).`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            prompt: prompt,
            output: { schema: matchSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar avaliação temática");
        }

        return {
            ...response.output,
            editalId: input.editalId,
            oscId: input.oscId
        };
    }
);


export const verificationAgentFlow = ai.defineFlow(
    {
        name: 'verificationAgentFlow',
        inputSchema: z.object({
            osc: ngoProfileSchema,
            editalText: z.string().describe("Texto bruto completo do edital"),
        }),
        outputSchema: verificationResultSchema,
    },
    async (input) => {
        const currentDate = new Date().toISOString().split('T')[0];
        const prompt = `Você é um auditor estrito atuando como "Advogado do Diabo". Sua tarefa é encontrar motivos para DESCLASSIFICAR esta ONG deste edital.
Você deve analisar as regras presentes no texto completo do edital e compará-las com o perfil da ONG.

Perfil da ONG:
Nome: ${input.osc.name || 'Não especificada'}
Localização: ${input.osc.location || 'Não especificada'}
Atividades Principais: ${(input.osc.coreActivities || []).join(', ')}
Data de Fundação: ${input.osc.foundationDate || 'Não especificada'}
Status da Documentação: ${input.osc.documentationStatus || 'Pendente'}
Data atual: ${currentDate}

Regras estritas (GUARDRAILS):
1. AVALIE EXATAMENTE OS 4 CRITÉRIOS A SEGUIR. O array DEVE ter tamanho 4.
- Localização (A ONG está na região permitida?)
- Prazo (O edital ainda está aberto considerando a data atual?)
- Fundação (A ONG tem a idade mínima exigida?)
- Documentação (A ONG possui os documentos/certificações exigidos?)

2. STATUS DISPONÍVEIS: 'Aprovado', 'Reprovado', 'Pendente de Informação'.
NUNCA USE 'Não Encontrado'. NUNCA USE QUALQUER OUTRA STRING.

3. REGRAS DE STATUS:
- Se a ONG cumprir um critério explicitamente, o status é "Aprovado".
- Se a ONG não cumprir um critério explícito (ex: edital exige SP, ONG está no RJ), o status é "Reprovado".
- Se uma restrição (ex: "Apenas SP") NÃO estiver escrita no texto do edital, marque "Aprovado" ou "Pendente de Informação" dependendo do contexto, mas NUNCA "Não Encontrado". Para "Prazo", se não houver data, avalie como "Aprovado" (fluxo contínuo).
- Se o perfil da ONG não fornecer informações suficientes (ex: não diz se tem os certificados, ou data de fundação desconhecida), você DEVE marcar "Pendente de Informação". NUNCA use "Reprovado" por falta de informação. Em caso de incerteza, use "Pendente de Informação".

4. CITAÇÕES: NUNCA invente citações. Use cópia exata ou resumo fiel. Se faltar info da ONG, escreva "Pendente de dados no perfil da ONG para cruzar com a exigência: [regra do edital]".

ATENÇÃO: AVALIE CADA UM DOS 4 CRITÉRIOS SEPARADAMENTE. NUNCA agrupe (ex: "Elegibilidade"). Retorne os exatos 4 objetos no array.
Responda APENAS com o JSON. Nenhuma explicação adicional.`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'system', content: [{ text: prompt }] },
                { role: 'user', content: [{ text: `Texto completo do edital:\n\n${input.editalText}` }] }
            ],
            config: { temperature: 0.1 }, // Low temperature for deterministic behavior
            output: { schema: verificationResultSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar o resultado da verificação.");
        }
        return response.output;
    }
);


/**
 * Cloud Function to verify match constraints using an AI agent.
 * Explicitly exported for Firebase deployment.
 */
export const verifyMatchConstraints = onCall({
    cors: true,
    timeoutSeconds: 300,
    memory: '2GiB', // Needs higher memory to process potentially large raw texts
    invoker: 'public',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { matchId } = request.data as { matchId?: string };

    if (!matchId) {
        throw new HttpsError('invalid-argument', 'O parâmetro matchId é obrigatório.');
    }

    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);

    try {
        const matchDoc = await matchRef.get();
        if (!matchDoc.exists) {
            throw new HttpsError('not-found', 'Match não encontrado.');
        }

        const matchData = matchDoc.data()!;
        const oscId = matchData.oscId;
        const editalId = matchData.editalId;

        if (!oscId || !editalId) {
             throw new HttpsError('failed-precondition', 'O match não possui oscId ou editalId válidos.');
        }

        const oscDoc = await db.collection('oscs').doc(oscId).get();
        const editalDoc = await db.collection('editais').doc(editalId).get();

        if (!oscDoc.exists || !editalDoc.exists) {
            throw new HttpsError('failed-precondition', 'OSC ou Edital não encontrados no banco de dados.');
        }

        const oscData = oscDoc.data()!;
        const editalData = editalDoc.data()!;

        const rawText = editalData.rawText || '';

        if (!rawText) {
             throw new HttpsError('failed-precondition', 'O texto bruto (rawText) do edital não está disponível para verificação.');
        }

        // Map and validate OSC data (same as match evaluator)
        const enrichedOscData = {
            name: oscData.name || 'ONG Desconhecida',
            foundationDate: oscData.foundationDate || 'Data Desconhecida',
            location: oscData.location || 'Localização Desconhecida',
            documentationStatus: oscData.documentationStatus || 'Pendente',
            previousProjectsApproved: oscData.previousProjectsApproved || false,
            coreActivities: oscData.coreActivities || [],
            ...oscData
        };

        const oscParseResult = ngoProfileSchema.safeParse(enrichedOscData);
        if (!oscParseResult.success) {
            throw new HttpsError('internal', 'Dados da OSC inválidos para verificação.');
        }

        // Run the agent flow
        const verificationResult = await verificationAgentFlow({
             osc: oscParseResult.data,
             editalText: rawText
        });

        // Check if there are any explicit rejections
        const hasRejections = verificationResult.some(r => r.status === 'Reprovado');

        // Update the match document with the result
        const updatePayload: any = {
             verificationResult: verificationResult,
             eligibility: !hasRejections,
             updatedAt: FieldValue.serverTimestamp()
        };
        if (hasRejections) {
            updatePayload.status = 'Inelegível';
        }
        await matchRef.withConverter(matchConverter).update(updatePayload);

        return { success: true, verificationResult };

    } catch (error: unknown) {
        console.error(`Erro em verifyMatchConstraints para o match ${matchId}:`, error);
        throw formatGenkitError(error, 'Falha ao executar a verificação do Advogado do Diabo.');
    }
});


export const verifyMatchConstraintWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5, maxDispatchesPerSecond: 2 },
    timeoutSeconds: 300,
    memory: '2GiB'
}, async (request) => {
    const { matchId, jobId } = request.data as { matchId: string, jobId: string };
    const db = getFirestore();
    const matchRef = db.collection('matches').doc(matchId);
    const jobRef = db.collection('system_jobs').doc(jobId);

    try {
        try {
            const matchDoc = await matchRef.get();
            if (!matchDoc.exists) {
                console.log(`Match ${matchId} não encontrado. Abortando.`);
                await jobRef.update({ failedTasks: FieldValue.increment(1) });
                return;
            }

            const matchData = matchDoc.data()!;
            if (matchData.verificationResult || matchData.actionState === 'Aprovado' || matchData.actionState === 'Rejeitado') {
                console.log(`Match ${matchId} já verificado ou resolvido. Pulando.`);
                await jobRef.update({ completedTasks: FieldValue.increment(1) });
                return;
            }

            const oscId = matchData.oscId;
            const editalId = matchData.editalId;

            const oscDoc = await db.collection('oscs').doc(oscId).get();
            const editalDoc = await db.collection('editais').doc(editalId).get();

            if (!oscDoc.exists || !editalDoc.exists) {
                console.log(`OSC ou Edital não encontrado para match ${matchId}.`);
                await jobRef.update({ failedTasks: FieldValue.increment(1) });
                return;
            }

            const oscData = oscDoc.data()!;
            const editalData = editalDoc.data()!;
            const rawText = editalData.rawText || '';

            if (!rawText) {
                console.log(`Texto bruto do edital ausente para match ${matchId}.`);
                await matchRef.withConverter(matchConverter).update({ verificationStatus: 'Error', errorReason: 'O texto bruto (rawText) do edital não está disponível para verificação.' });
                await jobRef.update({ failedTasks: FieldValue.increment(1) });
                return;
            }

            const enrichedOscData = {
                name: oscData.name || 'ONG Desconhecida',
                foundationDate: oscData.foundationDate || 'Data Desconhecida',
                location: oscData.location || 'Localização Desconhecida',
                documentationStatus: oscData.documentationStatus || 'Pendente',
                previousProjectsApproved: oscData.previousProjectsApproved || false,
                coreActivities: oscData.coreActivities || [],
                ...oscData
            };

            const oscParseResult = ngoProfileSchema.safeParse(enrichedOscData);
            if (!oscParseResult.success) {
                console.log(`Dados da OSC inválidos para match ${matchId}.`);
                await matchRef.withConverter(matchConverter).update({ verificationStatus: 'Error', errorReason: 'Dados da OSC inválidos para verificação.' });
                await jobRef.update({ failedTasks: FieldValue.increment(1) });
                return;
            }

            const verificationResult = await verificationAgentFlow({
                 osc: oscParseResult.data,
                 editalText: rawText
            });

            const hasRejections = verificationResult.some(r => r.status === 'Reprovado');

            const updatePayload: any = {
                 verificationResult: verificationResult,
                 eligibility: !hasRejections,
                 updatedAt: FieldValue.serverTimestamp()
            };
            if (hasRejections) {
                updatePayload.status = 'Inelegível';
            }
            await matchRef.withConverter(matchConverter).update(updatePayload);

            await jobRef.update({ completedTasks: FieldValue.increment(1) });
        } catch (error: any) {
            console.error(`Erro em verifyMatchConstraintWorker para o match ${matchId}:`, error);
            await matchRef.withConverter(matchConverter).update({ verificationStatus: 'Error', errorReason: error?.message || 'AI Execution Failed' });
            await jobRef.update({ failedTasks: FieldValue.increment(1) });
        }
    } finally {
        try {
            await db.runTransaction(async (transaction) => {
                const jobSnap = await transaction.get(jobRef);
                if (jobSnap.exists) {
                    const jobData = jobSnap.data()!;
                    if (jobData.completedTasks + jobData.failedTasks >= jobData.totalTasks && jobData.status !== 'completed') {
                        transaction.update(jobRef, { status: 'completed', updatedAt: FieldValue.serverTimestamp() });
                    }
                }
            });
        } catch (txError) {
            console.error(`Erro ao atualizar status do job ${jobId}:`, txError);
        }
    }
});


export const triggerBatchVerification = onCall({
    cors: true,
    invoker: 'public',
    memory: '1GiB',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { targetId, targetType } = request.data as { targetId?: string, targetType?: 'osc' | 'edital' };

    if (!targetId || !targetType) {
        throw new HttpsError('invalid-argument', 'targetId e targetType são obrigatórios.');
    }

    const db = getFirestore();
    let q;
    if (targetType === 'osc') {
        q = db.collection('matches').where('oscId', '==', targetId);
    } else {
        q = db.collection('matches').where('editalId', '==', targetId);
    }

    const matchesSnap = await q.get();

    const pendingMatches = matchesSnap.docs.filter(doc => {
        const data = doc.data();
        return data.actionState !== 'Aprovado' && data.actionState !== 'Rejeitado' && data.eligibility !== false && !data.verificationResult;
    });

    if (pendingMatches.length === 0) {
        return { success: true, message: 'Nenhum match pendente para verificação.', jobId: null };
    }

    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    await jobRef.set({
        targetId,
        targetType,
        type: 'batch_verification',
        totalTasks: pendingMatches.length,
        completedTasks: 0,
        failedTasks: 0,
        status: 'running',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    const queue = getFunctions().taskQueue('locations/us-central1/functions/verifyMatchConstraintWorker');


    for (const matchDoc of pendingMatches) {
        try {
            await queue.enqueue({ matchId: matchDoc.id, jobId });
            logger.info(`[verifyMatchConstraintWorker] Successfully enqueued matchId: ${matchDoc.id}`);
        } catch (enqueueErr: any) {
            logger.error(`[verifyMatchConstraintWorker] Failed to enqueue matchId ${matchDoc.id}: ${enqueueErr.message}`, enqueueErr);
        }
    }


    return { success: true, jobId, message: `${pendingMatches.length} tarefas enfileiradas.` };
});


export const parsePdfProfileWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    const { storagePaths, trackingId } = request.data as { storagePaths: string[], trackingId: string };
    const db = getFirestore();
    const trackingRef = db.collection('pdf_extractions').doc(trackingId);

    try {
        const result = await parsePdfToProfile({ storagePaths });
        await trackingRef.set({
            status: 'completed',
            result: result,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error(`Error in parsePdfProfileWorker for ${trackingId}:`, error);
        await trackingRef.set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        throw error;
    }
});

export const parsePdfProfileFunction = onCall({
    cors: true,
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { storagePaths } = request.data as { storagePaths?: string[] };
    if (!storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
        throw new HttpsError('invalid-argument', 'Pelo menos um caminho de Storage é necessário.');
    }

    const db = getFirestore();
    const trackingRef = db.collection('pdf_extractions').doc();
    await trackingRef.set({
        status: 'pending',
        type: 'profile_extraction',
        createdAt: FieldValue.serverTimestamp()
    });

    const queue = getFunctions().taskQueue('locations/us-central1/functions/parsePdfProfileWorker');
    await queue.enqueue({
        storagePaths: storagePaths,
        trackingId: trackingRef.id
    });

    return { trackingId: trackingRef.id, status: 'pending' };
});

const selectEditalLinksFlow = ai.defineFlow(
    {
        name: 'selectEditalLinksFlow',
        inputSchema: z.object({
            links: z.array(z.string()).max(40).describe("Lista de URLs pré-filtradas"),
        }),
        outputSchema: z.object({
            selectedLinks: z.array(z.string()).describe("Apenas os links que parecem apontar para detalhes de editais ou chamadas.")
        }),
    },
    async (input) => {
        const prompt = `Analise a seguinte lista de URLs.
Identifique e retorne APENAS os links que são altamente prováveis de apontar para a página de detalhes de um edital (grant, chamada pública, financiamento, edital).
Ignore links genéricos de navegação.
Retorne um array com as URLs selecionadas.`;
        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [{ role: 'user', content: [{ text: prompt }, { text: JSON.stringify(input.links) }] }],
            output: { schema: z.object({ selectedLinks: z.array(z.string()) }) }
        });
        if (!response.output) {
            throw new Error("Falha na seleção de links via Genkit");
        }
        return response.output;
    }
);

export const extractEditalRules = ai.defineFlow(
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

Preste MUITA ATENÇÃO à "Abrangência" (Geographic Reach) do edital. Se um edital tiver abrangência Nacional ou cobrir a região Nordeste, você DEVE sinalizá-lo como válido para OSCs locais (ex: incluindo 'PB', 'Nordeste' ou 'Nacional' em requiredLocations), IGNORANDO COMPLETAMENTE o endereço físico ou sede da instituição financiadora. O que importa é onde o projeto pode ser executado.

Se alguma informação não estiver explícita, você deve tentar deduzir com base no contexto geral ou, se impossível, preencher de forma condizente. Não invente informações.
The deadline MUST BE the final date for submitting proposals/applications (Envio de propostas/Inscrições), NOT the date for results, homologation, or appeals.
Sempre retorne os dados no formato estruturado solicitado em português do Brasil (pt-BR).`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const content: any[] = [{ text: prompt }];

        if (input.pdfBase64) {
            try {
                const pdfBuffer = Buffer.from(input.pdfBase64, 'base64');
                const uint8Array = new Uint8Array(pdfBuffer);
                const parser = new (PDFParse as any)(uint8Array, { max: 10 });
                const pdfData = await parser.getText();
                const extractedText = pdfData.text.substring(0, 15000);
                content.push({ text: `Texto extraído do PDF:\n\n${extractedText}` });
            } catch (error) {
                console.error("Falha ao analisar o PDF base64:", error);
                throw new Error("Falha ao analisar o PDF fornecido.");
            }
        } else if (input.text) {
             const truncatedText = input.text.substring(0, 15000);
             content.push({ text: `Texto do edital:\n\n${truncatedText}` });
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


const triageEditalWebpage = ai.defineFlow(
    {
        name: 'triageEditalWebpage',
        inputSchema: z.object({
            text: z.string().describe("Texto bruto da página web"),
            searchQuery: z.string().optional().describe("Consulta de busca opcional do operador (filtro estrito)"),
        }),
        outputSchema: triageSchema,
    },
    async (input) => {
        let prompt = `Você é um assistente que filtra páginas web para encontrar editais reais de financiamento, grants ou chamadas públicas para ONGs no Brasil.
Vou te passar o texto extraído de uma página web.
Determine se o texto representa uma oportunidade real e ativa de financiamento.
VOCÊ DEVE ACEITAR: "Landing Pages de Editais", "Anúncios Oficiais de Editais Abertos" e páginas de resumo que funcionem como ponto de entrada para a inscrição (ex: contendo links/botões como "Inscreva-se", "Baixar Edital", "Acessar Plataforma", ou que direcionem para formulários ou PDFs).
NÃO EXIJA que o texto contenha todas as regras ou o regulamento jurídico completo na própria página; se for a página oficial de divulgação de uma oportunidade ativa e legítima, ela deve ser aprovada.
Rejeite apenas artigos genéricos de opinião, notícias exclusivas sobre resultados de editais passados ou páginas que não tenham relação com oportunidades de captação de recursos.`;

        if (input.searchQuery) {
            prompt += `\nIMPORTANTE (FILTRO ESTRITO): O operador especificou uma consulta de busca: "${input.searchQuery}". O edital DEVE ser estritamente relacionado a este tema. Se não for, marque isValidEdital = false.`;
        }

        prompt += `\nResponda com isValidEdital = true se for um edital, landing page ou anúncio oficial de grant E (se houver consulta) se alinhar perfeitamente com a consulta.
Provide NO reasoning, NO explanations, and NO thinking steps. Output ONLY the raw JSON.`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: [
                    { text: prompt },
                    { text: `Texto:\n\n${input.text.substring(0, 3000)}` }
                ]}
            ],
            output: { schema: triageSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao processar a triagem do edital");
        }
        return response.output;
    }
);


export async function fetchAndExtractText(url: string): Promise<string> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8',
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
             throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';

        // Handle PDF responses directly
        if (contentType.toLowerCase().includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
            logger.info(`[fetchAndExtractText] Detected PDF at ${url}. Inspecting memory limits.`);
            const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
            const contentLengthHeader = response.headers.get('content-length');
            if (contentLengthHeader) {
                const size = parseInt(contentLengthHeader, 10);
                if (size > MAX_PDF_SIZE) {
                    logger.warn(`[fetchAndExtractText] PDF at ${url} is too large (${size} bytes). Rejecting to prevent OOM.`);
                    throw new Error(`PDF exceeds 10MB size limit (${size} bytes)`);
                }
            }

            // Read stream in chunks as a fallback
            const chunks: Uint8Array[] = [];
            let loadedBytes = 0;
            const reader = response.body?.getReader();
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(value);
                        loadedBytes += value.length;
                        if (loadedBytes > MAX_PDF_SIZE) {
                            logger.warn(`[fetchAndExtractText] PDF stream at ${url} exceeded 10MB. Aborting stream to prevent OOM.`);
                            throw new Error(`PDF stream exceeds 10MB size limit`);
                        }
                    }
                }
            } else {
                // Node native fetch response body might not be a Web Stream in all CommonJS compat layers, fallback to arrayBuffer if no reader
                const ab = await response.arrayBuffer();
                if (ab.byteLength > MAX_PDF_SIZE) {
                     logger.warn(`[fetchAndExtractText] PDF ArrayBuffer at ${url} exceeded 10MB. Rejecting to prevent OOM.`);
                     throw new Error(`PDF ArrayBuffer exceeds 10MB size limit`);
                }
                chunks.push(new Uint8Array(Buffer.from(ab)));
            }

            const uint8Array = new Uint8Array(Buffer.concat(chunks.map(c => Buffer.from(c))));
            const parser = new (PDFParse as any)(uint8Array, { max: 10 });
            const pdfData = await parser.getText();
            return pdfData.text.replace(/\s+/g, ' ').trim();
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove script, style, nav, footer, etc to get main content
        $('script, style, nav, footer, header, aside, noscript, iframe, svg').remove();

        const text = $('body').text();
        // Clean up whitespace
        const cleanText = text.replace(/\s+/g, ' ').trim();

        if (cleanText.length < 150) {
            logger.warn(`[fetchAndExtractText] Suspiciously short text extracted from HTML (len: ${cleanText.length}). Possible SPA/JS-rendered page: ${url}`);
        }

        return cleanText;
    } catch (e: any) {
        logger.error(`Error fetching text from URL ${url}: ${e.message}`);
        return "";
    }
}


export const extractEditalRulesWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    const { data, trackingId } = request.data as { data: any, trackingId: string };
    const db = getFirestore();
    const trackingRef = db.collection('pdf_extractions').doc(trackingId);

    try {
        const result = await extractEditalRules(data);
        await trackingRef.set({
            status: 'completed',
            result: result,
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error(`Error in extractEditalRulesWorker for ${trackingId}:`, error);
        await trackingRef.set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        throw error;
    }
});

export const extractEditalRulesFunction = onCall({
    cors: true,
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    if (request.data.pdfBase64 && request.data.pdfBase64.length > 7000000) {
        throw new HttpsError('invalid-argument', 'O arquivo PDF excede o limite máximo permitido (aproximadamente 5MB).');
    }

    const db = getFirestore();
    const trackingRef = db.collection('pdf_extractions').doc();
    await trackingRef.set({
        status: 'pending',
        type: 'rules_extraction',
        createdAt: FieldValue.serverTimestamp()
    });

    const queue = getFunctions().taskQueue('locations/us-central1/functions/extractEditalRulesWorker');
    await queue.enqueue({
        data: request.data,
        trackingId: trackingRef.id
    });

    return { trackingId: trackingRef.id, status: 'pending' };
});



import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

export const runVectorMigration = onRequest({
    timeoutSeconds: 3600, // Long timeout for migration
    memory: '1GiB'
}, async (request, response) => {
    try {
        const db = getFirestore();
        const collections = ['editais', 'oscs'];
        const results: any = {};

        for (const collectionName of collections) {
            console.log(`Starting migration for ${collectionName}...`);
            let count = 0;
            let lastDoc = null;
            let keepGoing = true;

            while (keepGoing) {
                let query = db.collection(collectionName).orderBy('__name__').limit(50);
                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                const snapshot = await query.get();
                if (snapshot.empty) {
                    keepGoing = false;
                    break;
                }

                const batch = db.batch();
                let batchCount = 0;

                for (const doc of snapshot.docs) {
                    const data = doc.data();

                    if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
                        batch.update(doc.ref, {
                            embedding: FieldValue.vector(data.embedding)
                        });
                        batchCount++;
                        count++;
                    }
                }

                if (batchCount > 0) {
                    await batch.commit();
                    console.log(`Migrated ${batchCount} documents in ${collectionName}. Total: ${count}`);
                }

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
            }
            results[collectionName] = count;
            console.log(`Finished migrating ${collectionName}. Total updated: ${count}`);
        }

        response.status(200).json({ success: true, migrated: results });
    } catch (error) {
        console.error('Migration failed:', error);
        response.status(500).json({ success: false, error: String(error) });
    }
});



const generateSearchQueries = ai.defineFlow(
    {
        name: 'generateSearchQueries',
        inputSchema: z.object({
            osc: ngoProfileSchema,
        }),
        outputSchema: z.object({
            queries: z.array(z.string()).describe("Lista de queries de busca"),
        }),
    },
    async (input) => {
        const currentYear = new Date().getFullYear();
        const nextYear = currentYear + 1;
        const prompt = `Você é um agente especialista em captação de recursos para ONGs no Brasil.
Baseado no perfil da ONG abaixo, gere EXATAMENTE 7 queries (termos de busca) simples e diretas para motores de busca.
Seu objetivo é descobrir editais abertos, financiamentos ou chamadas públicas compatíveis com a ONG.

Siga RIGOROSAMENTE estas regras para a formatação das queries:
- Mantenha simples e plano: É ESTRITAMENTE PROIBIDO usar parênteses aninhados ou complexos (ex: evite (A OR B) AND (C OR D)).
- Foco em palavras-chave: Gere sequências simples e diretas de palavras-chave (ex: edital financiamento quilombola nordeste).
- Comprimento máximo: Limite cada query a um MÁXIMO de 5 a 7 termos essenciais.
- Operadores mínimos: Evite lógica booleana pesada (AND, OR). Use termos simples que a API JSON do Google possa analisar facilmente.
- Inclua o ano de forma simples: Adicione o ano atual ou próximo (${currentYear} ou ${nextYear}) como apenas mais um termo.

Estratégia OBRIGATÓRIA para as 7 queries:
- Você DEVE adotar uma Estratégia Geográfica Diversificada, gerando uma mistura de:
  1. Buscas hiper-locais focadas na cidade e/ou estado da ONG.
  2. Buscas regionais (ex: "Nordeste", "Sul", "Centro-Oeste").
  3. Buscas amplas ou nacionais (ex: "abrangência nacional", "fundações empresariais", ou omitindo a geografia inteiramente).
- Gere 7 queries diversas explorando a área de atuação, recortes demográficos/temáticos e a Estratégia Geográfica Diversificada acima.
- OBRIGATORIAMENTE, em pelo menos 2 das 7 queries, use explicitamente o operador "site:" para focar em domínios governamentais ou institucionais. (ex: site:gov.br edital cultura ${currentYear}).

INSTRUÇÃO DE OPERADORES NEGATIVOS:
Você DEVE OBRIGATORIAMENTE anexar a seguinte string de operadores negativos no final de TODAS as 7 queries geradas: "-resultado -homologação -notícia -prorrogação -convocação (filetype:pdf OR inurl:edital OR \"chamada pública\")". Isso é essencial para filtrar ruídos do motor de busca.

INSTRUÇÃO DE SANITIZAÇÃO DE QUERIES (O ARMADILHA DO NOME):
Se o nome da ONG contiver o nome explícito de um Estado ou Cidade (ex: "Associação Cultural EITA Paraíba"), você DEVE REMOVER E IGNORAR esse termo geográfico específico ao gerar as queries de tier 3 ("Buscas amplas ou nacionais"). Isso evita forçar o motor de busca para uma bolha local quando o objetivo é buscar editais de abrangência nacional.

INSTRUÇÃO CRÍTICA DE ENRIQUECIMENTO (PARA ONGs DE IMPORTAÇÃO EM MASSA):
Se a Missão da ONG for 'Não especificada' ou muito curta/genérica, você NÃO DEVE gerar queries vazias ou puramente baseadas no nome da ONG. Você DEVE inferir e expandir o contexto da busca deduzindo os temas relevantes com base nas "Atividades Principais" (que geralmente derivam de códigos CNAE ou Macro-áreas do IPEA, como 'Assistência Social', 'Educação', etc.). Exemplo: Se a atividade for 'Educação', expanda queries com termos como 'educação infantil', 'jovens', 'escola', etc.

Perfil da ONG:
Nome: ${input.osc.name || 'Não especificada'}
Localização: ${input.osc.location || 'Não especificada'}
Atividades Principais: ${(input.osc.coreActivities || []).join(', ')}
Missão: ${input.osc.mission || 'Não especificada'}

Retorne apenas as queries geradas no array.`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: [{ text: prompt }] }
            ],
            output: { schema: z.object({ queries: z.array(z.string()) }) }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar queries de busca");
        }
        return response.output;
    }
);

async function generateTextEmbedding(text: string): Promise<number[]> {
    try {
        const response = await ai.embed({
            embedder: 'vertexai/text-embedding-004',
            content: text.substring(0, 5000)
        });
        if (Array.isArray(response)) {
            // Genkit 1.0 ai.embed returns an array of objects { embedding: number[] }
            const typedResponse = response as { embedding: number[] }[];
            if (typedResponse.length > 0 && typedResponse[0] && typedResponse[0].embedding) {
                return typedResponse[0].embedding;
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (response && (response as any).embedding) return (response as any).embedding as number[];

        throw new Error('Formato de retorno de embedding desconhecido.');
    } catch(err) {
        console.error("Error generating embedding:", err);
        throw err;
    }
}

async function processMatchEvaluation(oscId: string, editalId: string, forceRecalculate: boolean = false) {
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
    // Map sparse mass-imported data with valid defaults before parsing
    const enrichedOscData = {
        name: rawOscData?.name || 'ONG Desconhecida',
        foundationDate: rawOscData?.foundationDate || 'Data Desconhecida',
        location: rawOscData?.location || 'Localização Desconhecida',
        documentationStatus: rawOscData?.documentationStatus || 'Pendente',
        previousProjectsApproved: rawOscData?.previousProjectsApproved || false,
        coreActivities: rawOscData?.coreActivities || [],
        ...rawOscData
    };

    const oscParseResult = ngoProfileSchema.safeParse(enrichedOscData);
    const editalParseResult = editalSchema.safeParse(rawEditalData);

    // Helper for safe timestamp extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Upsert strategy: fixed ID to prevent duplicates
    const matchId = `${oscId}_${editalId}`;
    const matchRef = db.collection('matches').doc(matchId);

    const existingMatchDoc = await matchRef.get();
    let existingMatchData: Record<string, unknown> | null = existingMatchDoc.exists ? existingMatchDoc.data() || null : null;

    if (!oscParseResult.success) {
        console.warn(`Invalid OSC data for ${oscId} (Writing Incomplete Profile match safely):`, oscParseResult.error);
        const incompleteMatchDoc = {
            id: matchRef.id,
            oscId: oscId,
            editalId: editalId,
            oscName: enrichedOscData.name || 'ONG Desconhecida',
            editalTitle: rawEditalData?.title || 'Edital Desconhecido',
            sourceUrl: rawEditalData?.sourceUrl || null,
            createdAt: FieldValue.serverTimestamp(),
            matchScore: 0,
            eligibility: true,
            status: 'Pendente (Dados Incompletos)',
            badges: ['Pendente de Informação', 'Perfil Incompleto'],
            aiSummary: 'A avaliação está pendente porque os dados da OSC estão incompletos.',
            reasoning: null,
            actionPlan: ['Atualize os dados do perfil da OSC para permitir a avaliação de match.']
        };
        await matchRef.withConverter(matchConverter).set(incompleteMatchDoc, { merge: true });
        return incompleteMatchDoc;
    }
    if (!editalParseResult.success) {
        console.warn(`Invalid Edital data for ${editalId} (Skipping match safely):`, editalParseResult.error);
        return null;
    }

    const oscData = oscParseResult.data;
    const editalData = editalParseResult.data;


    // Fix 6: Robust timestamp validation for caching
    let shouldRecalculate = forceRecalculate;

    if (!shouldRecalculate && existingMatchData) {
        if (existingMatchData.createdAt) {
            const matchTime = getMillis(existingMatchData.createdAt);
            const oscUpdateTime = getMillis(rawOscData?.updatedAt) || getMillis(rawOscData?.createdAt) || 0;
            const editalUpdateTime = getMillis(rawEditalData?.updatedAt) || getMillis(rawEditalData?.createdAt) || 0;

            // If we can't reliably determine any timestamp, force recalculation
            if (matchTime === null) {
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

        // Even if stale, do not recalculate firmly rejected items unless explicitly forced
        if (!forceRecalculate && shouldRecalculate && (
            (typeof existingMatchData.status === 'string' && existingMatchData.status.includes('Inelegível')) ||
            existingMatchData.actionState === 'Rejeitado' ||
            existingMatchData.status === 'Fora do Escopo'
        )) {
             console.log(`Skipping recalculation for firmly rejected match OSC ${oscId} and Edital ${editalId}`);
             shouldRecalculate = false;
        }
    } else if (!existingMatchData) {
        shouldRecalculate = true;
    }

    if (!shouldRecalculate) {
        return existingMatchData;
    }

    console.log(`Evaluating match for OSC ${oscId} and Edital ${editalId}`);

    // Vector Pre-filtering
    let oscEmbedding = rawOscData?.embedding || null;
    let editalEmbedding = rawEditalData?.embedding || null;

    if (!oscEmbedding) {
        console.log(`Generating missing embedding for OSC ${oscId}`);
        const oscText = `Missão: ${oscData.mission || ''}. Foco: ${(oscData.coreActivities || []).join(', ')}. Nome: ${oscData.name || ''}`;
        oscEmbedding = await generateTextEmbedding(oscText);
        await db.collection('oscs').doc(oscId).withConverter(oscConverter).update({ embedding: oscEmbedding });
        oscData.embedding = oscEmbedding;
    }

    if (!editalEmbedding) {
        console.log(`Generating missing embedding for Edital ${editalId}`);
        const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${(editalData.eligibilityCriteria?.allowedActivities || []).join(', ')}.`;
        editalEmbedding = await generateTextEmbedding(editalText);
        await db.collection('editais').doc(editalId).withConverter(editalConverter).update({ embedding: editalEmbedding });
        editalData.embedding = editalEmbedding;
    }

    const similarityScore = cosineSimilarity(oscEmbedding, editalEmbedding);
    console.log(`Vector similarity score for OSC ${oscId} and Edital ${editalId}: ${similarityScore}`);

    let matchResult: unknown;

    // Dynamically adjust pre-filter threshold based on profile density to avoid false negatives for sparse data
    const isSparseProfile = (!oscData.mission || oscData.mission.length < 20) && (oscData.coreActivities.length <= 2);
    const dynamicThreshold = isSparseProfile ? 0.25 : 0.30;

    if (similarityScore < dynamicThreshold) {
        console.log(`Silently rejecting match for OSC ${oscId} and Edital ${editalId} due to low similarity score (${similarityScore} < ${dynamicThreshold})`);
        matchResult = {
            matchScore: 0,
            eligibility: false,
            status: 'Fora do Escopo',
            badges: ['Baixa Relevância (Filtro)'],
            aiSummary: 'A avaliação foi interrompida devido à baixa similaridade semântica entre a ONG e o Edital.',
            reasoning: null
        };
    } else {
        // Deterministic Date Guardrail
        const currentDate = new Date().toISOString().split('T')[0]!;

        let isExpired = false;
        if (!editalData.isContinuous) {
            if (editalData.deadline) {
                isExpired = editalData.deadline < currentDate || editalData.deadline === '1970-01-01';
            } else {
                // If there's no deadline and it's not continuous, we might treat it as expired or skip this check.
                // It's safer to not forcefully expire it here without a date, but let the LLM evaluate if needed.
                // However, matching the previous logic: if deadline is null/undefined and not continuous, it could fail.
                // Since the previous schema enforced a string, it was never null before our change.
                isExpired = false;
            }
        }

        if (isExpired) {
            console.log(`Silently rejecting match for OSC ${oscId} and Edital ${editalId} due to expired deadline (${editalData.deadline})`);
            matchResult = {
                matchScore: 0,
                eligibility: false,
                status: 'Inelegível',
                badges: ['Restrição Burocrática'],
                aiSummary: 'A ONG não atende aos requisitos burocráticos do edital (prazos, localização ou idade).',
                reasoning: 'Edital expirado. O prazo já foi encerrado.',
                actionPlan: null
            };
        } else {
            // Multi-Agent Pipeline
            console.log(`Similarity passed (${similarityScore}). Invoking Bureaucracy Agent...`);
            try {
                const bureaucracyResult = await bureaucracyAgentFlow({
                    osc: oscData,
                    edital: editalData
                });

                if (!bureaucracyResult.passesBureaucracy && !bureaucracyResult.rejectionReason?.toLowerCase().includes('pendente')) {
                    console.log(`Bureaucracy Agent rejected match: ${bureaucracyResult.rejectionReason}`);
                    matchResult = {
                        matchScore: 0,
                        eligibility: false,
                        status: 'Inelegível',
                        badges: ['Restrição Burocrática'],
                        aiSummary: 'A ONG não atende aos requisitos burocráticos do edital (prazos, localização ou idade).',
                        reasoning: bureaucracyResult.rejectionReason,
                        actionPlan: null
                    };
                } else {
                    console.log(`Bureaucracy Agent passed. Invoking Thematic Agent...`);
                    matchResult = await thematicAgentFlow({
                        osc: oscData,
                        edital: editalData,
                        oscId: oscId,
                        editalId: editalId
                    });

                    const typedMatchResult = matchResult as any;

                    // State Preservation for "Pendente" from Bureaucracy
                    if (!bureaucracyResult.passesBureaucracy || bureaucracyResult.rejectionReason?.toLowerCase().includes('pendente')) {
                        typedMatchResult.status = 'Pendente de Informação';
                        if (!typedMatchResult.badges) typedMatchResult.badges = [];
                        if (!typedMatchResult.badges.includes('Pendente de Informação')) {
                            typedMatchResult.badges.push('Pendente de Informação');
                        }
                        if (bureaucracyResult.rejectionReason) {
                            typedMatchResult.reasoning = typedMatchResult.reasoning
                                ? `${bureaucracyResult.rejectionReason}\n\nAlém disso: ${typedMatchResult.reasoning}`
                                : bureaucracyResult.rejectionReason;
                        }
                    }

                    // Strict Score Thresholding
                    if (typedMatchResult.matchScore < 20) {
                        typedMatchResult.eligibility = false;
                        typedMatchResult.status = 'Incompatibilidade Temática';
                        typedMatchResult.badges = ['Fora do Escopo'];
                    } else if (typedMatchResult.status !== 'Pendente de Informação') {
                        typedMatchResult.status = 'Elegível';
                    }
                }
            } catch (error) {
                console.error(`AI Evaluation failed for OSC ${oscId} and Edital ${editalId}:`, error);
                matchResult = {
                    matchScore: 0,
                    eligibility: false,
                    status: 'Inelegível (Erro no Servidor)',
                    badges: ['Erro'],
                    aiSummary: 'Falha de comunicação com a IA durante a avaliação. O limite de requisições pode ter sido atingido.',
                    reasoning: 'Erro interno ao processar a avaliação. Tente novamente mais tarde.',
                    actionPlan: null
                };
            }
        }
    }

    const matchDocData = {
        ...(matchResult as object),
        id: matchRef.id,
        oscId: oscId,
        editalId: editalId,
        oscName: oscData.name,
        editalTitle: editalData.title,
        sourceUrl: rawEditalData?.sourceUrl || null,
        createdAt: FieldValue.serverTimestamp()
    };

    await matchRef.withConverter(matchConverter).set(matchDocData, { merge: true });
    return matchDocData;
}

export const agenticSearchWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 60,
    },
    rateLimits: {
        maxConcurrentDispatches: 2,
    },
    timeoutSeconds: 1800,
    memory: '1GiB'
}, async (request) => {
    const { oscId, jobId } = request.data as { oscId: string, jobId?: string };

    if (!oscId) {
        console.error("Invalid task payload: missing oscId.");
        return;
    }

    const db = getFirestore();
    const jobRef = jobId ? db.collection('agentic_search_jobs').doc(jobId) : null;

    try {
        if (jobRef) {
            await jobRef.update({
                status: 'generating_queries',
                logs: FieldValue.arrayUnion('Iniciando geração de queries de busca...'),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        const oscDoc = await db.collection('oscs').doc(oscId).get();
        if (!oscDoc.exists) {
            console.error(`OSC ${oscId} not found.`);
            if (jobRef) await jobRef.update({ status: 'failed', error: 'OSC não encontrada.', updatedAt: FieldValue.serverTimestamp() });
            return;
        }

        const rawOscData = oscDoc.data() || {};

        const hasDescriptiveText = Boolean(
            rawOscData.mission ||
            rawOscData.description ||
            rawOscData.about ||
            rawOscData.focus ||
            (Array.isArray(rawOscData.coreActivities) && rawOscData.coreActivities.length > 0)
        );

        if (!hasDescriptiveText) {
            console.warn(`Invalid OSC data for ${oscId}: No descriptive text or activities found.`);
            if (jobRef) await jobRef.update({ status: 'failed', error: 'Dados da OSC inválidos.', updatedAt: FieldValue.serverTimestamp() });
            return;
        }

        const validDocumentationStatuses = ['Em dia', 'Pendente', 'Irregular'];
        const docStatus = validDocumentationStatuses.includes(rawOscData.documentationStatus)
            ? rawOscData.documentationStatus
            : 'Pendente';

        const enrichedOscData = {
            ...rawOscData,
            name: typeof rawOscData.name === 'string' ? rawOscData.name : 'ONG Desconhecida',
            foundationDate: typeof rawOscData.foundationDate === 'string' ? rawOscData.foundationDate : 'Data Desconhecida',
            location: typeof rawOscData.location === 'string' ? rawOscData.location : 'Localização Desconhecida',
            documentationStatus: docStatus,
            previousProjectsApproved: typeof rawOscData.previousProjectsApproved === 'boolean' ? rawOscData.previousProjectsApproved : false,
            coreActivities: Array.isArray(rawOscData.coreActivities) ? rawOscData.coreActivities : [],
            mission: rawOscData.mission || [rawOscData.description, rawOscData.about, rawOscData.focus].filter(Boolean).join(' ') || undefined
        };

        const parseResult = ngoProfileSchema.safeParse(enrichedOscData);
        if (!parseResult.success) {
            console.warn(`Invalid OSC data for ${oscId} after enrichment`, parseResult.error);
            if (jobRef) await jobRef.update({ status: 'failed', error: 'Dados da OSC inválidos.', updatedAt: FieldValue.serverTimestamp() });
            return;
        }

        const oscData = parseResult.data;
        let oscEmbedding = rawOscData?.embedding || null;
        if (!oscEmbedding) {
            const alternativeDesc = [rawOscData.description, rawOscData.about, rawOscData.focus].filter(Boolean).join(' ');
            const missionText = oscData.mission || alternativeDesc || 'Não especificada';
            const activitiesText = oscData.coreActivities.length > 0 ? oscData.coreActivities.join(', ') : 'Não especificadas';

            const oscText = `Missão/Descrição: ${missionText}. Foco: ${activitiesText}. Nome: ${oscData.name || ''}`;
            oscEmbedding = await generateTextEmbedding(oscText);
            await db.collection('oscs').doc(oscId).withConverter(oscConverter).update({ embedding: FieldValue.vector(oscEmbedding) });
        }

        // Tier 1: Internal Database First
        if (jobRef) {
            await jobRef.update({
                logs: FieldValue.arrayUnion('Executando Tier 1: Busca em base interna...'),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        let instantMatches = 0;

        // Use Firestore Vector Search for tier 1 search
        // Check if oscEmbedding is already a VectorValue (from db) or an array (just generated)
        const vectorQuery = Array.isArray(oscEmbedding) ? FieldValue.vector(oscEmbedding) : oscEmbedding;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalEditaisSnapshot = await (db.collection('editais') as any)
            .where('ativo', '==', true)
            .findNearest('embedding', vectorQuery, { limit: 30, distanceMeasure: 'COSINE', distanceResultField: 'vectorDistance' })
            .get();

        console.log('Top internal vector matches (raw):', internalEditaisSnapshot.docs.map((m: any) => ({ id: m.id, distance: m.get('vectorDistance') ?? m.data()?.vectorDistance })));

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
                    doc: editalDoc,
                    distance: vectorDistance,
                    similarity: similarity
                };
            })
            .filter((m: any) => m.similarity >= 0.25)
            .sort((a: any, b: any) => a.distance - b.distance)
            .slice(0, 15);

        console.log('Filtered internal vector matches (threshold 0.25, max 15):', validInternalMatches.map((m: any) => ({ id: m.doc.id, distance: m.distance, similarity: m.similarity })));

        const internalMatchTasks = validInternalMatches.map((match: any) => ({
            oscId: oscId,
            editalId: match.doc.id
        }));

        await safeEnqueueTasks(
            'locations/us-central1/functions/matchEvaluatorWorker',
            internalMatchTasks,
            (data) => `eval_internal_${data.oscId}_${data.editalId}`
        );
        instantMatches += internalMatchTasks.length;

        console.log(`Found ${instantMatches} instant internal matches for OSC ${oscId}.`);

        if (jobRef) {
            await jobRef.update({
                logs: FieldValue.arrayUnion(`Tier 1 Concluído: Encontrados ${instantMatches} editais promissores internos.`),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        const { queries } = await generateSearchQueries({ osc: oscData });
        console.log(`Generated queries for OSC ${oscId}:`, queries);

        if (jobRef) {
            await jobRef.update({
                'progress.queriesGenerated': queries.length,
                'progress.validEditaisEnqueued': instantMatches,
                status: 'scraping_web',
                logs: FieldValue.arrayUnion(`Geradas ${queries.length} queries. Iniciando busca na web...`),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        let totalLinksFound = 0;
        let totalLinksEvaluated = 0;
        let totalValidEditaisEnqueued = instantMatches;

        const methodBreakdown = { internal: instantMatches, web: 0 };
        const queryPerformance: Record<string, number> = {};
        const topDomains: Record<string, number> = {};
        const rejections: { [key: string]: number; expired: number; out_of_scope: number; fetch_error: number; snippet_rejected: number; } = { expired: 0, out_of_scope: 0, fetch_error: 0, snippet_rejected: 0 };

        const allSearchResults: { link: string, title: string, snippet: string, query: string }[] = [];

        const QUERY_CHUNK_SIZE = 3;
        for (let q = 0; q < queries.length; q += QUERY_CHUNK_SIZE) {
            const queryChunk = queries.slice(q, q + QUERY_CHUNK_SIZE);

            await Promise.all(queryChunk.map(async (baseQuery) => {
                const query = baseQuery;
                try {
                    if (jobRef) {
                        await jobRef.update({
                            logs: FieldValue.arrayUnion(`Buscando: "${query}"...`),
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }

                    const searchPromises = [];

                    // Tier 2: Google Vertex AI Search
                    let vertexProjectId = process.env.VERTEX_AI_SEARCH_PROJECT_ID;
                    if (!vertexProjectId) {
                        try { vertexProjectId = vertexAiSearchProjectIdString.value(); } catch (e) { /* ignore */ }
                    }
                    vertexProjectId = vertexProjectId || "566889139686";

                    let vertexLocation = process.env.VERTEX_AI_SEARCH_LOCATION;
                    if (!vertexLocation) {
                        try { vertexLocation = vertexAiSearchLocationString.value(); } catch (e) { /* ignore */ }
                    }
                    vertexLocation = vertexLocation || "global";

                    let vertexEngineId = process.env.VERTEX_AI_SEARCH_ENGINE_ID;
                    if (!vertexEngineId) {
                        try { vertexEngineId = vertexAiSearchEngineIdString.value(); } catch (e) { /* ignore */ }
                    }
                    vertexEngineId = vertexEngineId || "triade-sniper-search_1787960465651";

                    if (vertexEngineId && vertexLocation && vertexProjectId) {
                        const vertexSearchPromise = (async () => {
                            try {
                                console.log(`[Agentic Search] Executing Vertex AI Search for query: "${query}"`);

                                const auth = new GoogleAuth({
                                    scopes: 'https://www.googleapis.com/auth/cloud-platform'
                                });
                                const client = await auth.getClient();
                                const accessToken = await client.getAccessToken();

                                const vertexUrl = `https://discoveryengine.googleapis.com/v1/projects/${vertexProjectId}/locations/${vertexLocation}/collections/default_collection/engines/${vertexEngineId}/servingConfigs/default_search:search`;

                                let vertexResponse;
                                let attempt = 0;
                                const maxAttempts = 3;

                                while (attempt < maxAttempts) {
                                    vertexResponse = await fetch(vertexUrl, {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${accessToken.token}`,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            query: query,
                                            pageSize: 40
                                        })
                                    });

                                    if (vertexResponse.ok) break;

                                    if (vertexResponse.status === 429 || vertexResponse.status >= 500) {
                                        attempt++;
                                        console.warn(`Vertex AI Search API failed with status ${vertexResponse.status}. Retrying ${attempt}/${maxAttempts}...`);
                                        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
                                    } else {
                                        break; // Non-retryable error
                                    }
                                }

                                if (!vertexResponse || !vertexResponse.ok) {
                                    const status = vertexResponse ? vertexResponse.status : 'unknown';
                                    console.error(`Vertex AI Search API failed permanently with status: ${status}`);
                                    if (jobRef) {
                                         await jobRef.update({
                                             logs: FieldValue.arrayUnion(`Falha permanente no Vertex AI para query: "${query}" (Status: ${status})`),
                                         });
                                    }
                                } else {
                                    const vertexData = await vertexResponse.json() as any;
                                    const results = vertexData.results || [];
                                    for (const result of results) {
                                        const derivedStructData = result.document?.derivedStructData;
                                        if (derivedStructData && derivedStructData.link) {
                                            let snippet = '';
                                            if (derivedStructData.snippets && derivedStructData.snippets.length > 0) {
                                                snippet = derivedStructData.snippets[0].snippet || '';
                                                // Clean HTML tags from snippet
                                                snippet = snippet.replace(/<\/?[^>]+(>|$)/g, "");
                                            }

                                            try {
                                                const domain = new URL(derivedStructData.link).hostname;
                                                topDomains[domain] = (topDomains[domain] || 0) + 1;
                                            } catch (e) {}

                                            allSearchResults.push({
                                                link: derivedStructData.link,
                                                title: derivedStructData.title || '',
                                                snippet: snippet,
                                                query: query
                                            });
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error(`[Agentic Search] Exception during Vertex AI Search:`, e);
                            }
                        })();
                        searchPromises.push(vertexSearchPromise);
                    }

                    // Tier 3: Brave Search API
                    let braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
                    if (!braveApiKey) {
                        try { braveApiKey = braveApiKeyString.value(); } catch (e) { /* ignore */ }
                    }

                    if (braveApiKey) {
                        const braveSearchPromise = (async () => {
                            const maskedKey = braveApiKey.length > 8 ? `${braveApiKey.substring(0, 4)}***${braveApiKey.substring(braveApiKey.length - 4)}` : '***';
                            console.log(`[Agentic Search] Executing Brave Search API Key (length: ${braveApiKey.length}): ${maskedKey}`);

                            // Pagination loop for 2 pages (offset 0 and 1) running concurrently
                            await Promise.all([0, 1].map(async (offset) => {
                                const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&offset=${offset}`;
                                try {
                                    const searchResponse = await fetch(url, {
                                        headers: {
                                            'Accept': 'application/json',
                                            'Accept-Encoding': 'gzip',
                                            'X-Subscription-Token': braveApiKey
                                        }
                                    });

                                    if (!searchResponse.ok) {
                                        console.warn(`Brave Search API request failed for page ${offset} with status: ${searchResponse.status}`);
                                        return;
                                    }

                                    const braveData = await searchResponse.json() as any;
                                    const results = braveData.web?.results || [];
                                    for (const r of results) {
                                        if (r.url) {
                                            try {
                                                const domain = new URL(r.url).hostname;
                                                topDomains[domain] = (topDomains[domain] || 0) + 1;
                                            } catch (e) {}

                                            allSearchResults.push({
                                                link: r.url,
                                                title: r.title || '',
                                                snippet: r.description || '',
                                                query: query
                                            });
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`Brave Search API request threw error for page ${offset}`, e);
                                }
                            }));
                        })();
                        searchPromises.push(braveSearchPromise);
                    } else {
                         console.warn(`[Agentic Search] BRAVE_SEARCH_API_KEY not found. Skipping Brave search.`);
                    }

                    await Promise.all(searchPromises);

                } catch (err) {
                    console.error(`Error searching for query ${query}:`, err);
                }
            }));
        }

        // Intra-job deduplication
        const uniqueSearchResults = [];
        const seenLinks = new Set<string>();
        for (const res of allSearchResults) {
             if (!seenLinks.has(res.link)) {
                 seenLinks.add(res.link);
                 uniqueSearchResults.push(res);
             }
        }

        console.log(`Aggregated ${uniqueSearchResults.length} unique links across all queries.`);

        if (jobRef) {
             await jobRef.update({
                 logs: FieldValue.arrayUnion(`Agregados ${uniqueSearchResults.length} links únicos de todas as fontes.`),
                 updatedAt: FieldValue.serverTimestamp()
             });
        }

        // Database & Queue Deduplication Shield
        const shieldedResults = [];
        const BATCH_SIZE = 30; // Firestore "in" queries support max 30 items
        for (let i = 0; i < uniqueSearchResults.length; i += BATCH_SIZE) {
            const batch = uniqueSearchResults.slice(i, i + BATCH_SIZE);
            const urls = batch.map(r => r.link);

            // Check if already in 'editais'
            const editaisSnapshot = await db.collection('editais').where('sourceUrl', 'in', urls).get();
            const existingEditaisUrls = new Set(editaisSnapshot.docs.map(doc => doc.data().sourceUrl));

            // Check if already pending in 'scraping_contents' queue
            const queueSnapshot = await db.collection('scraping_contents').where('url', 'in', urls).get();
            const pendingQueueUrls = new Set(queueSnapshot.docs.map(doc => doc.data().url));

            for (const res of batch) {
                if (!existingEditaisUrls.has(res.link) && !pendingQueueUrls.has(res.link)) {
                    shieldedResults.push(res);
                }
            }
        }

        console.log(`Deduplication shield complete. ${shieldedResults.length} links remain out of ${uniqueSearchResults.length}.`);

        if (jobRef) {
            await jobRef.update({
                 logs: FieldValue.arrayUnion(`Filtro de duplicatas concluído: ${shieldedResults.length} novos links identificados.`),
                 updatedAt: FieldValue.serverTimestamp()
            });
        }

        let hasUpdatedStatus = false;

        // Process in chunks of 3 to control concurrency and adhere to Vertex AI rate limits
        const chunkSize = 3;
        const essentialKeywords = ['edital', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'fomento', 'chamada pública', 'financiamento'];

        // Phase 1: Pre-filtering and Scoring (Steps A & B)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evaluatedLinks: { r: any, score: number }[] = [];

        for (let i = 0; i < shieldedResults.length; i += chunkSize) {
            const chunk = shieldedResults.slice(i, i + chunkSize);

            await Promise.all(chunk.map(async (r) => {
                totalLinksFound++;
                const link = r.link;
                const titleAndSnippet = (r.title + " " + r.snippet).toLowerCase();

                // 4-Step Filtering Funnel

                // Step A: Keyword Heuristic Pre-filter on Snippet (Zero Cost)
                const hasKeywordInSnippet = essentialKeywords.some(kw => titleAndSnippet.includes(kw));
                if (!hasKeywordInSnippet) {
                    rejections.snippet_rejected++;
                    return; // Skip if snippet completely lacks essential keywords
                }

                const cleanJsonSnippet = JSON.stringify({
                    title: r.title,
                    url: r.link,
                    snippet: r.snippet
                });

                // Step B: Text Embedding Similarity Filter (Low Cost)
                totalLinksEvaluated++;
                let similarityScore = 0;
                try {
                    const textEmbedding = await generateTextEmbedding(cleanJsonSnippet);
                    similarityScore = cosineSimilarity(oscEmbedding, textEmbedding);
                    console.log(`Vector similarity for ${link} (Snippet) is ${similarityScore}`);
                    if (similarityScore === 0) {
                        console.warn(`cosineSimilarity returned 0 for snippet of ${link}, forcing to 1 to bypass filter.`);
                        similarityScore = 1;
                    }
                } catch (embedErr) {
                    console.warn(`Failed to generate embedding for snippet of ${link}, bypassing snippet filter:`, embedErr);
                    similarityScore = 1; // Bypass filter on failure to prevent silent rejections
                }

                if (similarityScore > 0.30) {
                    evaluatedLinks.push({ r, score: similarityScore });
                } else {
                    rejections.snippet_rejected++;
                }
            }));

            // Debounce progress updates after each chunk
            if (jobRef) {
                await jobRef.update({
                    'progress.linksFound': totalLinksFound,
                    'progress.linksEvaluated': totalLinksEvaluated,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

        // Sort by score descending and take the top 30 most promising links
        evaluatedLinks.sort((a, b) => b.score - a.score);
        const topLinks = evaluatedLinks.slice(0, 30);
        console.log(`Phase 1 complete. Proceeding with top ${topLinks.length} links out of ${evaluatedLinks.length} evaluated.`);

        if (jobRef) {
             await jobRef.update({
                 logs: FieldValue.arrayUnion(`Fase 1 concluída. Avaliando os top ${topLinks.length} links promissores de ${evaluatedLinks.length}.`),
                 updatedAt: FieldValue.serverTimestamp()
             });
        }

        // Phase 2: Full Fetch and LLM Triage (Steps C & D)
        for (let i = 0; i < topLinks.length; i += chunkSize) {
            const chunk = topLinks.slice(i, i + chunkSize);

            await Promise.all(chunk.map(async ({ r }) => {
                const link = r.link;
                console.log(`Fetching full content for promising link: ${link}`);

                const cleanJsonSnippet = JSON.stringify({
                    title: r.title,
                    url: r.link,
                    snippet: r.snippet
                });

                let fullTextToAnalyze = cleanJsonSnippet;

                // Step C: Fetch Full HTML and Re-apply Heuristic (Medium Cost)
                try {
                    const fetchedText = await fetchAndExtractText(link);
                    if (fetchedText && fetchedText.length >= 150) {
                        const fetchedTextLower = fetchedText.toLowerCase();
                        const hasKeywordInFullText = essentialKeywords.some(kw => fetchedTextLower.includes(kw));

                        if (!hasKeywordInFullText) {
                            console.log(`Rejecting ${link} post-fetch: missing essential keywords in full text.`);
                            rejections.out_of_scope++;
                            return; // Reject before LLM evaluation
                        }
                        fullTextToAnalyze = fetchedText;
                    } else {
                        console.warn(`Rejecting ${link}: full text fetch returned insufficient content.`);
                        rejections.fetch_error++;
                        return; // Drop URL if fetch didn't yield enough content
                    }
                } catch (fetchErr) {
                    console.warn(`Failed to fetch full text for ${link}, dropping URL to prevent hallucinations`, fetchErr);
                    rejections.fetch_error++;
                    return; // Explicitly drop URL on failure
                }

                if (jobRef && !hasUpdatedStatus) { // Update status to scoring on the first valid link of the batch
                     hasUpdatedStatus = true;
                     await jobRef.update({ status: 'scoring_triage', updatedAt: FieldValue.serverTimestamp() });
                }

                // Step D: LLM Triage (High Cost)
                fullTextToAnalyze = fullTextToAnalyze.substring(0, 3000); // Truncate to reduce token cost
                const triageResult = await triageEditalWebpage({ text: fullTextToAnalyze, searchQuery: r.query });
                if (triageResult.isValidEdital) {
                    await enqueueEditalExtraction(link, fullTextToAnalyze, "Edital válido", `AGENTIC_${oscId}`, "VERTEX_SEARCH");
                    console.info(`[Handoff Trace] Successfully enqueued agentic extraction for ${link} (OSC: ${oscId})`);
                    totalValidEditaisEnqueued++;
                    methodBreakdown.web++;
                    if (r.query) {
                        queryPerformance[r.query] = (queryPerformance[r.query] || 0) + 1;
                    }
                } else {
                    rejections.out_of_scope++;
                }
            }));

            // Debounce progress updates after each chunk
            if (jobRef) {
                await jobRef.update({
                    'progress.validEditaisEnqueued': totalValidEditaisEnqueued,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

        console.log(`Successfully finished agentic search for OSC ${oscId}`);
        if (jobRef) {
            await jobRef.update({
                status: 'completed',
                logs: FieldValue.arrayUnion('Busca finalizada com sucesso.'),
                analytics: { methodBreakdown, queryPerformance, topDomains, rejections },
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error(`Agentic search failed for OSC ${oscId}`, error);
        if (jobRef) {
            await jobRef.update({
                status: 'failed',
                error: formatGenkitError(error, 'Erro interno desconhecido.').message,
                updatedAt: FieldValue.serverTimestamp()
            });
        }
        throw error;
    }
});


export const matchEvaluatorWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 30,
    },
    rateLimits: {
        maxConcurrentDispatches: 5, // Prevent Vertex AI rate limits (HTTP 429)
    },
    timeoutSeconds: 540, // Allow enough time for Genkit execution
    memory: '2GiB'
}, async (request) => {
    const { oscId, editalId, jobId } = request.data as { oscId: string, editalId: string, jobId?: string };

    if (!oscId || !editalId) {
        console.error("Invalid task payload: missing oscId or editalId.");
        return;
    }

    try {
        const db = getFirestore();
        const oscDoc = await db.collection('oscs').doc(oscId).get();
        const editalDoc = await db.collection('editais').doc(editalId).get();
        if (!oscDoc.exists || !editalDoc.exists) {
            throw new Error(`OSC (${oscId}) or Edital (${editalId}) not found`);
        }

        const oscData = oscDoc.data() || {};
        const editalData = editalDoc.data() || {};

        // Strip heavy/unnecessary fields to save tokens
        const oscDataClean = { ...oscData };
        delete oscDataClean.embedding;
        delete oscDataClean.rawText;

        const editalDataClean = { ...editalData };
        delete editalDataClean.embedding;
        delete editalDataClean.rawText;
        delete editalDataClean.sourceUrl;

        const prompt = `Act as a strict grant-matching analyst. Evaluate the OSC's profile against the Edital's strict requirements (location, years of existence, thematic alignment).
        OSC Profile: ${JSON.stringify(oscDataClean)}
        Edital: ${JSON.stringify(editalDataClean)}`;

        const result = await ai.generate({
            prompt,
            output: { schema: reverseMatchResultSchema },
            model: 'vertexai/gemini-2.5-flash'
        });
        const matchResult = result.output;

        if (matchResult) {
            const fullMatchDocument: any = {
                ...matchResult,
                jobId,
                oscId,
                editalId,
                eligibility: matchResult.matchScore >= 20, // Example threshold
                status: matchResult.matchScore >= 20 ? 'Elegível' : 'Inelegível',
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            };

            // Clean undefined values before saving to Firestore to avoid errors (e.g. if jobId is missing)
            const cleanFullMatchDocument = Object.fromEntries(Object.entries(fullMatchDocument).filter(([_, v]) => v !== undefined));

            await db.collection('matches').doc(`${oscId}_${editalId}`).set(cleanFullMatchDocument, { merge: true });

            // Mark job progress ONLY when task truly succeeds
            if (jobId) {
                try {
                    const db = getFirestore();
                    const jobRef = db.collection('system_jobs').doc(jobId);
                    await jobRef.update({
                        matchesEvaluated: FieldValue.increment(1),
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    const jobDoc = await jobRef.get();
                    const data = jobDoc.data();
                    // Update job to completed if all evaluated
                    if (data && data.matchesEvaluated >= data.matchesTriggered) {
                        await jobRef.update({
                            status: 'completed',
                            evaluationsCompleted: true,
                            updatedAt: FieldValue.serverTimestamp()
                        });
                    }
                } catch (jobError) {
                     console.error(`Failed to update job progress for ${jobId}:`, jobError);
                }
            }
        }

    } catch (error) {
        console.error(`Task execution failed for OSC ${oscId} and Edital ${editalId}`, error);
        // Throw error here to ensure Cloud Tasks retries transient errors like 429
        throw error;
    }
});


const STATE_ABBREVIATIONS: Record<string, string> = {
    'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapa', 'AM': 'Amazonas', 'BA': 'Bahia',
    'CE': 'Ceara', 'DF': 'Distrito Federal', 'ES': 'Espirito Santo', 'GO': 'Goias',
    'MA': 'Maranhao', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul', 'MG': 'Minas Gerais',
    'PA': 'Para', 'PB': 'Paraiba', 'PR': 'Parana', 'PE': 'Pernambuco', 'PI': 'Piaui',
    'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte', 'RS': 'Rio Grande do Sul',
    'RO': 'Rondonia', 'RR': 'Roraima', 'SC': 'Santa Catarina', 'SP': 'Sao Paulo',
    'SE': 'Sergipe', 'TO': 'Tocantins'
};

export const processOscChunkWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 30,
    },
    rateLimits: {
        maxConcurrentDispatches: 2,
        maxDispatchesPerSecond: 1,
    },
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    const { oscIds, activityArea, aiPrompt, onlyActive, jobId } = request.data as {
        oscIds: number[];
        activityArea?: string;
        aiPrompt?: string;
        onlyActive?: boolean;
        jobId?: string;
    };

    if (!oscIds || !Array.isArray(oscIds)) {
        console.error("Invalid task payload: missing oscIds.");
        return;
    }

    const db = getFirestore();
    let processed = 0;
    let imported = 0;

    const collectedOscs: any[] = [];

    // Process API requests in chunks of 3 to throttle BrasilAPI requests
    const API_CHUNK_SIZE = 3;
    for (let i = 0; i < oscIds.length; i += API_CHUNK_SIZE) {
        const chunk = oscIds.slice(i, i + API_CHUNK_SIZE);

        await Promise.allSettled(chunk.map(async (id_osc) => {
            try {
                // 1. Get CNPJ from IPEA
                const oscDetailsRes = await fetchWithRetry(`https://mapaosc.ipea.gov.br/api/api/osc/cabecalho/${id_osc}`);
                const oscDetails = await oscDetailsRes.json();
                const rawCnpj = oscDetails.cd_identificador_osc;

                if (!rawCnpj) return;

                const cleanCnpj = String(rawCnpj).replace(/\D/g, '');
                if (cleanCnpj.length !== 14) return;

                // 2. Enrich Profile Data using BrasilAPI (pass 5 retries to handle 429s better)
                const brasilApiResponse = await fetchWithRetry(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, {}, 5);
                const rawData = await brasilApiResponse.json();

                // 3. Apply Filters
                if (onlyActive) {
                    if (rawData.descricao_situacao_cadastral !== 'ATIVA') {
                        return;
                    }
                }

                if (activityArea) {
                    const searchArea = activityArea.toLowerCase();
                    const mainActivity = (rawData.cnae_fiscal_descricao || '').toLowerCase();
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const secActivities = (rawData.cnaes_secundarios || []).map((c: any) => (c.descricao || '').toLowerCase());

                    const matchesArea = mainActivity.includes(searchArea) || secActivities.some((a: string) => a.includes(searchArea));

                    if (!matchesArea) {
                        return;
                    }
                }

                collectedOscs.push({ cleanCnpj, rawData, id_osc });
            } catch (error: unknown) {
                console.error(`Error processing OSC ${id_osc}:`, error);
            } finally {
                processed++;
            }
        }));
        // Deliberate delay to prevent rate-limiting from BrasilAPI / IPEA
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    let filteredOscs = collectedOscs;

    if (aiPrompt && aiPrompt.trim() !== '' && filteredOscs.length > 0) {
        try {
            // Process AI filtering in chunks of 50 to avoid prompt size limits and rate limits
            const AI_CHUNK_SIZE = 50;
            const aiChunks = [];
            for (let i = 0; i < filteredOscs.length; i += AI_CHUNK_SIZE) {
                aiChunks.push(filteredOscs.slice(i, i + AI_CHUNK_SIZE));
            }

            let allMatchedCnpjs: string[] = [];

            // Limit concurrency for AI requests to 3
            const MAX_AI_CONCURRENCY = 3;
            for (let i = 0; i < aiChunks.length; i += MAX_AI_CONCURRENCY) {
                const batch = aiChunks.slice(i, i + MAX_AI_CONCURRENCY);

                const batchResults = await Promise.all(batch.map(async (chunk) => {
                    const promptData = chunk.map(osc => {
                        const textFields = [
                            (osc.rawData.razao_social || ''),
                            (osc.rawData.nome_fantasia || ''),
                            (osc.rawData.cnae_fiscal_descricao || '')
                        ];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (osc.rawData.cnaes_secundarios || []).forEach((c: any) => {
                            textFields.push(c.descricao || '');
                        });
                        return `CNPJ: ${osc.cleanCnpj}, Name: ${textFields[0]}, Descriptions: ${textFields.join(' ')}`;
                    }).join('\n');

                    const llmPrompt = `You are a strict, ruthless data filter. Evaluate NGOs strictly based on explicit textual evidence in their Name or CNAE. Do NOT assume generic religious organizations (igrejas, congregações) or generic neighborhood associations (moradores) run niche programs unless their name explicitly states it. If the user asks for a specific niche and the NGO is generic, EXCLUDE IT. When in doubt, EXCLUDE. User's request: ${aiPrompt}. Here are ${chunk.length} NGOs (Name + CNAE descriptions):\n${promptData}\nAnalyze their semantic alignment with the request. Return a raw JSON array containing ONLY the string CNPJs of the NGOs that genuinely match the profile.`;

                    const response = await ai.generate({
                        model: 'vertexai/gemini-2.5-flash',
                        prompt: llmPrompt,
                        config: { temperature: 0.0 },
                        output: { schema: z.array(z.string()) }
                    });

                    return response.output || [];
                }));

                allMatchedCnpjs = allMatchedCnpjs.concat(batchResults.flat());
            }

            filteredOscs = filteredOscs.filter(osc => allMatchedCnpjs.includes(osc.cleanCnpj));
        } catch (error) {
            console.error("AI Filtering error:", error);
            filteredOscs = [];
        }
    }

    for (const osc of filteredOscs) {
        try {
            const { cleanCnpj, rawData } = osc;
            // 4. Transform and Upsert
            const name = rawData.razao_social || 'Nome Desconhecido';
            const foundationDate = rawData.data_inicio_atividade || new Date().toISOString().split('T')[0];
            const city = rawData.municipio || 'Cidade Desconhecida';
            const state = rawData.uf || 'UF';
            const location = `${city}/${state}`;

            const transformedData = {
                name,
                foundationDate,
                location,
                documentationStatus: 'Pendente',
                previousProjectsApproved: false,
                coreActivities: [activityArea || 'Assistência Social', 'Educação'], // Default dummy activities if none selected
            };

            const parseResult = ngoProfileSchema.safeParse(transformedData);
            if (!parseResult.success) {
                console.warn(`Validation failed for CNPJ ${cleanCnpj}:`, parseResult.error);
                continue;
            }

            const oscRef = db.collection('oscs').doc(cleanCnpj);
            const oscDoc = await oscRef.get();
            const now = FieldValue.serverTimestamp();

            let embedding: number[] | null = null;
            try {
                 const oscText = `Missão: ${parseResult.data.mission || ''}. Foco: ${(parseResult.data.coreActivities || []).join(', ')}. Nome: ${parseResult.data.name || ''}`;
                 embedding = await generateTextEmbedding(oscText);
            } catch (embedError) {
                 console.warn(`Failed to generate embedding for newly ingested OSC ${cleanCnpj}:`, embedError);
            }

            const upsertData = {
                ...parseResult.data,
                cnpj: cleanCnpj,
                embedding: embedding ? FieldValue.vector(embedding) : null,
                updatedAt: now,
                ...(jobId ? { importBatchId: jobId } : {})
            };

            if (!oscDoc.exists) {
                Object.assign(upsertData, { createdAt: now, lastSearchAt: new Date(0) });
            }

            // Clean undefined values from object before Firestore save to avoid errors
            const finalUpsertData = Object.fromEntries(Object.entries(upsertData).filter(([_, v]) => v !== undefined));

            await oscRef.withConverter(oscConverter).set(finalUpsertData, { merge: true });
            imported++;
        } catch (error: unknown) {
            console.error(`Error transforming and upserting OSC ${osc.cleanCnpj}:`, error);
        }
    }

    if (jobId) {
        try {
            const jobRef = db.collection('system_jobs').doc(jobId);
            await db.runTransaction(async (transaction) => {
                const jobDoc = await transaction.get(jobRef);
                if (jobDoc.exists) {
                    const data = jobDoc.data();
                    const newChunksProcessed = (data?.chunksProcessed || 0) + 1;
                    const newValidOscsSaved = (data?.validOscsSaved || 0) + imported;

                    const updateData: any = {
                        chunksProcessed: newChunksProcessed,
                        validOscsSaved: newValidOscsSaved,
                        updatedAt: FieldValue.serverTimestamp()
                    };

                    if (newChunksProcessed >= (data?.totalChunks || 0)) {
                        updateData.status = 'completed';
                    }

                    transaction.update(jobRef, updateData);
                }
            });
        } catch (error) {
            console.error(`Error updating job ${jobId}:`, error);
        }
    }

    logger.info(`Chunk processing complete. Processed: ${processed}, Imported: ${imported}`);
});

export const ingestOscDataFunction = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { uf, municipio, activityArea, aiPrompt, onlyActive } = request.data as {
        uf?: string;
        municipio?: string;
        activityArea?: string;
        aiPrompt?: string;
        onlyActive?: boolean
    };

    if (!uf && !municipio) {
        throw new HttpsError('invalid-argument', 'Either uf or municipio filter is required.');
    }

    // 1. IPEA Discovery (Geographical Search)
    let oscList: { id_osc: number }[] = [];

    try {
        if (municipio) {
            const normalizedMunicipio = removeAccents(municipio);
            const searchUrl = `https://mapaosc.ipea.gov.br/api/api/busca/municipio/${encodeURIComponent(normalizedMunicipio)}`;
            logger.info(`IPEA Municipio Search URL: ${searchUrl}`);
            const searchRes = await fetchWithRetry(searchUrl);
            const searchData = await searchRes.json();

            if (!Array.isArray(searchData) || searchData.length === 0) {
                 logger.error(`IPEA Municipio Search returned empty for ${normalizedMunicipio}`);
                 return { success: false, message: 'No municipio found or IPEA search failed.' };
            }

            const edmu_cd_municipio = searchData[0].edmu_cd_municipio;

            const oscsRes = await fetchWithRetry(`https://mapaosc.ipea.gov.br/api/api/geo/oscs/municipio/${edmu_cd_municipio}`);
            oscList = await oscsRes.json();

        } else if (uf) {
            let stateName = uf.trim();
            if (stateName.length === 2) {
                const upperUf = stateName.toUpperCase();
                stateName = STATE_ABBREVIATIONS[upperUf] || stateName;
            }
            const normalizedUf = removeAccents(stateName);
            const searchUrl = `https://mapaosc.ipea.gov.br/api/api/busca/estado/${encodeURIComponent(normalizedUf)}`;
            logger.info(`IPEA Estado Search URL: ${searchUrl}`);
            const searchRes = await fetchWithRetry(searchUrl);
            const searchData = await searchRes.json();

            if (!Array.isArray(searchData) || searchData.length === 0) {
                logger.error(`IPEA Estado Search returned empty for ${normalizedUf}`);
                return { success: false, message: 'No UF found or IPEA search failed.' };
            }

            const eduf_cd_uf = searchData[0].eduf_cd_uf;

            const oscsRes = await fetchWithRetry(`https://mapaosc.ipea.gov.br/api/api/geo/oscs/estado/${eduf_cd_uf}`);
            oscList = await oscsRes.json();
        }

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during IPEA discovery';
        console.error('IPEA Discovery Error:', errorMessage);
        throw new HttpsError('internal', errorMessage);
    }

    if (!Array.isArray(oscList)) {
        oscList = [];
    }

    logger.info(`Total OSCs discovered: ${oscList.length}.`);

    if (oscList.length === 0) {
        return { success: true, message: 'No OSCs found for the given criteria.' };
    }

    // 2. Chunk the results and enqueue to Cloud Tasks
    const CHUNK_SIZE = 250;
    const queue = getFunctions().taskQueue('locations/us-central1/functions/processOscChunkWorker');

    const db = getFirestore();
    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;
    const totalChunks = Math.ceil(oscList.length / CHUNK_SIZE);

    await jobRef.set({
        type: 'osc_ingestion',
        status: 'running',
        totalOscsFetched: oscList.length,
        totalChunks: totalChunks,
        chunksProcessed: 0,
        validOscsSaved: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });

    let enqueuedTasks = 0;

    for (let i = 0; i < oscList.length; i += CHUNK_SIZE) {
        const chunk = oscList.slice(i, i + CHUNK_SIZE).map(osc => osc.id_osc);

        await queue.enqueue({
            oscIds: chunk,
            activityArea,
            aiPrompt,
            onlyActive,
            jobId
        });
        enqueuedTasks++;
    }

    return {
        success: true,
        message: `Importação iniciada em segundo plano. ${oscList.length} OSCs encontradas, divididas em ${enqueuedTasks} lotes.`,
        totalDiscovered: oscList.length,
        enqueuedTasks: enqueuedTasks
    };
});




async function routeEditalUrl(url: string, sourceContext: string, searchId?: string, options?: { searchQuery?: string | undefined }, discoverySource?: string): Promise<{ success: boolean, message: string, outcome: 'PROSAS' | 'HEURISTIC_REJECT' | 'AI_REJECT' | 'AI_APPROVE' | 'ERROR' }> {
    if (url.toLowerCase().includes('prosas.com.br')) {
        logger.info(`[Smart Router] Routing Prosas link to authenticated worker: ${url}`);
        await getFunctions().taskQueue('locations/us-central1/functions/prosasAuthenticatedWorker').enqueue({ url, searchId: searchId || sourceContext });
        return { success: true, message: "Edital encaminhado para o raspador autenticado (Prosas).", outcome: 'PROSAS' };
    }

    try {
        const text = await fetchAndExtractText(url);

        if (!text) {
            return { success: false, message: "Falha ao extrair texto (vazio ou erro de requisição/PDF inválido).", outcome: 'ERROR' };
        }

        if (text.length < 150) {
            const isSpaLikely = text.length < 150;
            const spaMsg = isSpaLikely ? " (Possível SPA renderizado via JS)" : "";
            return { success: false, message: `Texto muito curto para análise (${text.length} caracteres)${spaMsg}.`, outcome: 'HEURISTIC_REJECT' };
        }

        // Heuristic Pre-filter (Stricter AND gate)
        const textLower = text.toLowerCase();
        const primaryKeywords = ['edital', 'chamada pública', 'processo seletivo', 'fomento', 'regulamento'];
        const secondaryKeywords = ['inscrições abertas', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'financiamento', 'submissão'];

        const hasPrimary = primaryKeywords.some(kw => textLower.includes(kw));
        const hasSecondary = secondaryKeywords.some(kw => textLower.includes(kw));

        if (!(hasPrimary && hasSecondary)) {
             return { success: false, message: "Rejeitado pelo filtro heurístico pré-LLM (ausência de combinação primária+secundária de palavras-chave).", outcome: 'HEURISTIC_REJECT' };
        }

        const triageResult = await triageEditalWebpage({ text, searchQuery: options?.searchQuery });

        if (triageResult.isValidEdital) {
            // Only fall back to sourceContext if searchId is strictly undefined
            await enqueueEditalExtraction(url, text, "Edital válido", searchId !== undefined ? searchId : sourceContext, discoverySource);
            return { success: true, message: "Edital válido", outcome: 'AI_APPROVE' };
        } else {
            return { success: false, message: "Edital inválido", outcome: 'AI_REJECT' };
        }
    } catch (error) {
        logger.error(`[Smart Router] Error processing link ${url}:`, error);
        return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido", outcome: 'ERROR' };
    }
}

export async function enqueueEditalExtraction(link: string, text: string, reason: string, searchId?: string, discoverySource?: string) {
    const db = getFirestore();
    // Guardrail: Truncate text to 3000 characters to prevent LLM token exhaustion
    if (text && text.length > 3000) {
        logger.info(`[Guardrail] Truncating text for ${link} from ${text.length} to 3000 characters.`);
        text = text.substring(0, 3000);
    }
    const tempContentRef = db.collection('scraping_contents').doc();

    // Set TTL for 24 hours from now
    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + 24);

    await tempContentRef.set({
        url: link,
        text: text,
        discoverySource: discoverySource || null,
        createdAt: FieldValue.serverTimestamp(),
        expireAt: expireAt
    });

    const queue = getFunctions().taskQueue('locations/us-central1/functions/extractionWorker');
    await queue.enqueue({
        searchId: searchId || null,
        link: link,
        contentId: tempContentRef.id,
        reason: reason,
        discoverySource: discoverySource || null
    });
    return tempContentRef.id;
}


export const triggerManualEditalMatches = onCall({
    cors: true,
    timeoutSeconds: 60,
    memory: '512MiB',
    invoker: 'public',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userRole = userDoc.data()?.role;
    if (userRole !== 'admin' && userRole !== 'client') {
        throw new HttpsError('permission-denied', 'User must be an admin or client.');
    }

    const { editalIds } = request.data as { editalIds: string[] };
    if (!editalIds || !Array.isArray(editalIds) || editalIds.length === 0) {
        throw new HttpsError('invalid-argument', 'O parâmetro editalIds é obrigatório e deve ser um array.');
    }

    console.log(`[triggerManualEditalMatches] Found ${editalIds.length} editais to process from request.`);

    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    try {
        await jobRef.set({
            type: 'manual_edital_matches',
            status: 'running',
            totalEditais: editalIds.length,
            editaisProcessed: 0,
            matchesTriggered: 0,
            matchesEvaluated: 0,
            evaluationsCompleted: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        const vectorSearchQueue = getFunctions().taskQueue('locations/us-central1/functions/editalVectorSearchWorker');
        await vectorSearchQueue.enqueue({
            jobId: jobId,
            editalIds: editalIds,
        });

        console.log(`[triggerManualEditalMatches] Successfully enqueued job ${jobId} to editalVectorSearchWorker for ${editalIds.length} editais.`);

        return { success: true, jobId, message: 'Processamento iniciado em segundo plano.' };
    } catch (error: unknown) {
        console.error('Error in triggerManualEditalMatches:', error);
        await jobRef.update({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: FieldValue.serverTimestamp()
        }).catch(e => console.error('Failed to update job status on error:', e));
        throw new HttpsError('internal', 'Erro interno ao processar matches manuais.');
    }
});

export const triggerBulkInternalMatch = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userRole = userDoc.data()?.role;
    if (userRole !== 'admin' && userRole !== 'client') {
        throw new HttpsError('permission-denied', 'User must be an admin or client.');
    }

    const { importBatchId, limit = 100 } = request.data as { importBatchId: string, limit?: number };
    if (!importBatchId) {
        throw new HttpsError('invalid-argument', 'O parâmetro importBatchId é obrigatório.');
    }

    const jobRef = db.collection('system_jobs').doc();
    const jobId = jobRef.id;

    try {
        const oscsSnapshot = await db.collection('oscs').where('importBatchId', '==', importBatchId).get();
        let oscs = oscsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

        oscs = oscs.slice(0, limit);

        await jobRef.set({
            type: 'bulk_match',
            status: 'running',
            importBatchId: importBatchId,
            totalOscs: oscs.length,
            oscsProcessed: 0,
            matchesTriggered: 0,
            matchesEvaluated: 0,
            evaluationsCompleted: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        let matchesTriggered = 0;
        let oscsProcessed = 0;

        for (const osc of oscs) {
            let oscEmbedding = osc.embedding;

            if (!oscEmbedding) {
                const parseResult = ngoProfileSchema.safeParse(osc);
                const mission = parseResult.success ? parseResult.data.mission : osc.mission;
                const activities = parseResult.success ? parseResult.data.coreActivities : osc.coreActivities;
                const name = parseResult.success ? parseResult.data.name : osc.name;

                const missionText = mission || 'Não especificada';
                const activitiesText = (Array.isArray(activities) && activities.length > 0) ? activities.join(', ') : 'Não especificadas';

                const oscText = `Missão/Descrição: ${missionText}. Foco: ${activitiesText}. Nome: ${name || ''}`;
                const embedding = await generateTextEmbedding(oscText);
                oscEmbedding = FieldValue.vector(embedding);
                await db.collection('oscs').doc(osc.id).withConverter(oscConverter).update({ embedding: oscEmbedding });
            }

            const vectorQuery = Array.isArray(oscEmbedding) ? FieldValue.vector(oscEmbedding) : oscEmbedding;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const internalEditaisSnapshot = await (db.collection('editais') as any)
                .where('ativo', '==', true)
                .findNearest('embedding', vectorQuery, { limit: 100, distanceMeasure: 'COSINE', distanceResultField: 'vectorDistance' })
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

            const internalMatchTasks = validInternalMatches.map((match: any) => ({
                oscId: osc.id,
                editalId: match.id,
                jobId: jobId
            }));

            await safeEnqueueTasks(
                'locations/us-central1/functions/matchEvaluatorWorker',
                internalMatchTasks,
                (data) => `eval_chunk_${data.jobId}_${data.oscId}_${data.editalId}`
            );
            matchesTriggered += internalMatchTasks.length;

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
        });

        // Resolve race condition where evaluations finish before job dispatch is complete
        const finalJobDoc = await jobRef.get();
        const finalJobData = finalJobDoc.data();
        if (finalJobData && finalJobData.matchesEvaluated >= matchesTriggered) {
            await jobRef.update({
                evaluationsCompleted: true,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        return { success: true, message: `Disparados ${matchesTriggered} matches internos para o lote ${importBatchId}.` };
    } catch (error: unknown) {
        console.error('Error in triggerBulkInternalMatch:', error);
        await jobRef.update({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: FieldValue.serverTimestamp()
        }).catch(e => console.error('Failed to update job status on error:', e));
        throw new HttpsError('internal', 'Erro interno ao processar matches em massa.');
    }
});

export const triggerMatchOrchestrator = onCall({
    cors: true
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { editalId, oscId, forceRecalculate } = request.data;

    if (!editalId || !oscId) {
        throw new HttpsError('invalid-argument', 'Missing editalId or oscId.');
    }

    try {
        const matchResult = await processMatchEvaluation(oscId, editalId, forceRecalculate);
        if (matchResult === null) {
            return {
                id: `error_${oscId}_${editalId}`,
                oscId: oscId,
                editalId: editalId,
                matchScore: 0,
                eligibility: false,
                status: 'Inelegível (Falha no Processamento)',
                badges: ['Erro'],
                aiSummary: 'A avaliação falhou inesperadamente.',
                reasoning: null
            };
        }
        return matchResult;
    } catch (error: unknown) {
        console.error('Error generating match:', error);
        return {
             id: `error_${oscId}_${editalId}`,
             oscId: oscId,
             editalId: editalId,
             matchScore: 0,
             eligibility: false,
             status: 'Inelegível (Erro no Servidor)',
             badges: ['Erro'],
             aiSummary: 'Erro interno ao processar avaliação.',
             reasoning: null
        };
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

    // The automated fan-out to matchEvaluatorWorker and agenticSearchWorker has been removed
    // to prevent the "Thundering Herd" effect during mass ingestion of OSCs.
    // Agentic Search and matching should now be triggered manually via VIP requests
    // or via a decoupled slow-burn cron queue.
    console.log(`OSC ${oscId} updated successfully. Automated match cascades are disabled.`);
});



export async function checkAndUpdateGlobalRunStatus(runId: string) {
    if (!runId) return;
    const db = getFirestore();

    const runRef = db.collection('ingestion_runs').doc(runId);

    try {
        await db.runTransaction(async (transaction) => {
            const runDoc = await transaction.get(runRef);
            if (!runDoc.exists) return;

            const data = runDoc.data();
            if (!data || data.status !== 'RUNNING') return; // Already finished or something

            const phases = data.phases || {};
            const unifiedStatus = phases.unified?.status || 'COMPLETED';
            const prosasStatus = phases.prosas?.status || 'COMPLETED'; // Treat missing as completed for safety
            const internalStatus = phases.internalFontes?.status || 'COMPLETED';
            const rssStatus = phases.rssAndQueries?.status || 'COMPLETED';

            const isTerminal = (status: string) => ['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status);

            if (isTerminal(unifiedStatus) && isTerminal(prosasStatus) && isTerminal(internalStatus) && isTerminal(rssStatus)) {
                // All child phases are in a terminal state

                // Aggregate errors to determine final state
                const anyFailures =
                    unifiedStatus === 'FAILED' ||
                    prosasStatus === 'FAILED' ||
                    internalStatus === 'FAILED' ||
                    rssStatus === 'FAILED';

                transaction.update(runRef, {
                    status: anyFailures ? 'FAILED' : 'COMPLETED',
                    endTime: FieldValue.serverTimestamp()
                });

                console.log(`[Global Run Aggregator] Run ${runId} finalized as ${anyFailures ? 'FAILED' : 'COMPLETED'}`);
            }
        });
    } catch (e) {
        console.error(`[Global Run Aggregator] Failed to check status for run ${runId}:`, e);
    }
}
async function processRssFeeds(runId?: string) {
    const RSS_URLS = [
        // Mock Google Alerts RSS URLs
        "https://news.google.com/rss/search?q=edital+ONG+OR+OSC+brasil",
        "https://news.google.com/rss/search?q=financiamento+projetos+culturais+edital",
        // Prosas RSS with regional filters for Nordeste and Paraiba
        "https://blog.prosas.com.br/categoria/editais/feed/?tag=nordeste,paraiba"
    ];

    const parser = new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    });
    const db = getFirestore();
    let processedCount = 0;
    let savedCount = 0;

    // Telemetry Counters
    let heuristicRejects = 0;
    let aiRejects = 0;
    let cacheHits = 0;
    let aiApprovals = 0;
    let prosasLinks = 0;
    let errorCount = 0;

    for (const feedUrl of RSS_URLS) {
        try {
            console.log(`Fetching RSS feed: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);

            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.rssAndQueries.feedsProcessed': FieldValue.increment(1)
                });
            }

            // Limit to top 40 items per feed to prevent token leaks
            const topItems = feed.items.slice(0, 40);

            for (const item of topItems) {
                if (!item.link) continue;

                // Check if already ingested
                const existingEdital = await db.collection('editais').where('sourceUrl', '==', item.link).limit(1).get();
                if (!existingEdital.empty) {
                    console.log(`Skipping already ingested link: ${item.link}`);
                    continue;
                }

                // Add an extra check against the scraping queue to prevent race conditions with data lake
                const existingQueue = await db.collection('scraping_contents').where('url', '==', item.link).limit(1).get();
                if (!existingQueue.empty) {
                    console.log(`Skipping link already in scraping queue: ${item.link}`);
                    continue;
                }

                const rejectionRef = await db.collection('scraping_cache').where('url', '==', item.link).limit(1).get();
                if (!rejectionRef.empty) {
                    console.log(`Skipping link in rejection cache: ${item.link}`);
                    cacheHits++;
                    continue;
                }

                processedCount++;
                console.log(`Processing link: ${item.link}`);

                const routeResult = await routeEditalUrl(item.link, "RSS", undefined, undefined, "PROSAS_RSS");
                console.log(`Router result for ${item.link}: success=${routeResult.success}, message=${routeResult.message}`);

                if (routeResult.outcome === 'HEURISTIC_REJECT') heuristicRejects++;
                else if (routeResult.outcome === 'AI_REJECT') aiRejects++;
                else if (routeResult.outcome === 'AI_APPROVE') aiApprovals++;
                else if (routeResult.outcome === 'PROSAS') prosasLinks++;
                else if (routeResult.outcome === 'ERROR') errorCount++;

                if (routeResult.success) {
                     savedCount++;
                } else {
                    const safeReason = routeResult.message ? routeResult.message.substring(0, 200) : '';
                    const expireAt = new Date();
                    expireAt.setDate(expireAt.getDate() + 30);
                    await db.collection('scraping_cache').add({
                        url: item.link,
                        reason: safeReason,
                        createdAt: FieldValue.serverTimestamp(),
                        expireAt: expireAt
                    });
                }


            }
        } catch (error: any) {
            console.error(`Error fetching or parsing RSS feed ${feedUrl}:`, error);
            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.rssAndQueries.errors': FieldValue.arrayUnion(`Error on feed ${feedUrl}: ${error.message}`)
                });
            }
            throw error; // Re-throw to allow rssWorker to fail the phase
        }
    }



    console.log(`Ingestion complete. Processed ${processedCount} items, saved ${savedCount} valid editais.`);
    return {
        processedCount,
        savedCount,
        metrics: {
            heuristicRejects,
            aiRejects,
            cacheHits,
            aiApprovals,
            prosasLinks,
            errorCount
        }
    };
}

export const ingestSingleOscByCnpj = onCall({
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userRole = userDoc.data()?.role;
    if (userRole !== 'admin' && userRole !== 'client') {
        throw new HttpsError('permission-denied', 'User must be an admin or client.');
    }

    const { cnpj } = request.data as { cnpj?: string };
    if (!cnpj) {
        throw new HttpsError('invalid-argument', 'CNPJ é obrigatório.');
    }

    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
        throw new HttpsError('invalid-argument', 'CNPJ inválido.');
    }

    try {
        let brasilApiResponse: Response;
        try {
            brasilApiResponse = await fetchWithRetry(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (!brasilApiResponse.ok) {
                throw new Error(`BrasilAPI returned status: ${brasilApiResponse.status}`);
            }
        } catch (fetchError: any) {
            console.error("BrasilAPI fetch failed:", fetchError);
            throw new HttpsError('not-found', 'CNPJ não encontrado na base de dados (Receita Federal) ou serviço indisponível.');
        }

        const brasilApiData = await brasilApiResponse.json();

        const name = brasilApiData.razao_social || brasilApiData.nome_fantasia || 'ONG Desconhecida';
        const location = `${brasilApiData.municipio || 'Desconhecido'} / ${brasilApiData.uf || 'Desconhecido'}`;
        const foundationDate = brasilApiData.data_inicio_atividade || 'Data Desconhecida';

        const coreActivities: string[] = [];
        if (brasilApiData.cnae_fiscal_descricao) coreActivities.push(brasilApiData.cnae_fiscal_descricao);
        if (Array.isArray(brasilApiData.cnaes_secundarios)) {
            brasilApiData.cnaes_secundarios.forEach((cnae: any) => {
                if (cnae.descricao) coreActivities.push(cnae.descricao);
            });
        }

        const profileData = {
            name,
            cnpj: cleanCnpj,
            mission: coreActivities.join(', ') || 'Não especificada', // Fallback to CNAE description
            boardValidity: 'Não especificada',
            foundationDate,
            location,
            documentationStatus: 'Pendente',
            previousProjectsApproved: false,
            coreActivities,
        };

        const parseResult = ngoProfileSchema.safeParse(profileData);
        if (!parseResult.success) {
            console.error("Schema validation failed for BrasilAPI data:", parseResult.error);
            throw new HttpsError('internal', 'Falha ao mapear dados da Receita Federal.');
        }

        let embedding: number[] | null = null;
        try {
            const oscText = `Missão: ${parseResult.data.mission || ''}. Foco: ${(parseResult.data.coreActivities || []).join(', ')}. Nome: ${parseResult.data.name || ''}`;
            embedding = await generateTextEmbedding(oscText);
        } catch (embedError) {
            console.warn("Failed to generate embedding for manually ingested OSC:", embedError);
        }

        const dataToSave = {
            ...parseResult.data,
            embedding: embedding ? FieldValue.vector(embedding) : null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: 'manual_cnpj_ingest'
        };

        await db.collection('oscs').doc(cleanCnpj).withConverter(oscConverter).set(dataToSave);

        if (userRole === 'client') {
            await db.collection('users').doc(request.auth.uid).update({
                oscId: cleanCnpj,
                oscIds: FieldValue.arrayUnion(cleanCnpj),
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`[ingestSingleOscByCnpj] Mapped OSC ID ${cleanCnpj} to client user ${request.auth.uid}`);
        }

        return {
            success: true,
            oscId: cleanCnpj,
            profile: {
                name: dataToSave.name,
                cnpj: dataToSave.cnpj,
                mission: dataToSave.mission,
                boardValidity: dataToSave.boardValidity
            },
            message: 'OSC processada com sucesso via Receita Federal!'
        };

    } catch (error: any) {
        console.error("Error in ingestSingleOscByCnpj:", error);
        throw new HttpsError('internal', error.message || 'Erro ao processar o CNPJ.');
    }
});

export const ingestManualOscFunction = onCall({
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const userRole = userDoc.data()?.role;
    if (userRole !== 'admin' && userRole !== 'client') {
        throw new HttpsError('permission-denied', 'User must be an admin or client.');
    }

    const { storagePaths } = request.data as { storagePaths?: string[] };
    if (!storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
        throw new HttpsError('invalid-argument', 'Pelo menos um caminho de Storage é necessário.');
    }

    const bucket = getStorage().bucket();

    try {
        const profileData = await parsePdfToProfile({ storagePaths });

        if (!profileData.name || profileData.name.trim().length < 3 || !profileData.cnpj) {
            throw new HttpsError('invalid-argument', 'Não foi possível extrair Nome e CNPJ válidos dos documentos.');
        }

        const cleanCnpj = profileData.cnpj.replace(/\D/g, '');
        if (cleanCnpj.length !== 14) {
            throw new HttpsError('invalid-argument', 'CNPJ extraído é inválido.');
        }

        let embedding: number[] | null = null;
        try {
            const oscText = `Missão: ${profileData.mission || ''}. Foco: ${(profileData.coreActivities || []).join(', ')}. Nome: ${profileData.name || ''}`;
            embedding = await generateTextEmbedding(oscText);
        } catch (embedError) {
            console.warn("Failed to generate embedding for manually ingested OSC:", embedError);
        }

        const dataToSave = {
            ...profileData,
            embedding: embedding ? FieldValue.vector(embedding) : null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: 'manual_ingest'
        };

        const finalDataToSave = Object.fromEntries(Object.entries(dataToSave).filter(([_, v]) => v !== undefined));

        // Save to Firestore
        await getFirestore().collection('oscs').doc(cleanCnpj).withConverter(oscConverter).set(finalDataToSave as z.infer<typeof ngoProfileSchema>);

        if (userRole === 'client') {
            await db.collection('users').doc(request.auth.uid).update({
                oscId: cleanCnpj,
                oscIds: FieldValue.arrayUnion(cleanCnpj),
                updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`[ingestManualOscFunction] Mapped OSC ID ${cleanCnpj} to client user ${request.auth.uid}`);
        }

        // Cleanup: Delete temporary files
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            } catch (cleanupError) {
                console.error(`Failed to clean up temp file ${path}:`, cleanupError);
            }
        }

        return {
            success: true,
            oscId: cleanCnpj,
            profile: {
                ...profileData,
                id: cleanCnpj
            }
        };
    } catch (error: unknown) {
        console.error('Error in ingestManualOscFunction:', error);

        // Ensure cleanup happens even on failure
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            } catch (cleanupError) {
                console.error(`Failed to clean up temp file ${path} during error handling:`, cleanupError);
            }
        }
        throw new HttpsError('internal', 'Erro ao extrair dados dos documentos da OSC.');
    }
});


export const ingestManualEditalFunction = onCall({
    cors: true,
    timeoutSeconds: 540,
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const url = request.data.url;
    if (!url || typeof url !== 'string') {
        throw new HttpsError('invalid-argument', 'A valid URL is required.');
    }

    try {
        const routeResult = await routeEditalUrl(url, "MANUAL", undefined, undefined, "MANUAL");

        if (!routeResult.success) {
             return { success: false, message: `O conteúdo não parece ser um edital válido. Motivo: ${routeResult.message}` };
        }

        return { success: true, editalId: "pending", message: routeResult.message };

    } catch (error: unknown) {
        console.error('Error in ingestManualEditalFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during manual edital ingestion.';
        throw new HttpsError('internal', errorMessage);
    }
});

const searchDatabaseTool = ai.defineTool(
    {
        name: 'searchDatabaseTool',
        description: 'Searches the Firestore database for NGOs (OSCs) and Editais (Grants) to find matches.',
        inputSchema: z.object({
            city: z.string().optional().describe("City name to filter NGOs"),
            state: z.string().optional().describe("State abbreviation or name to filter NGOs"),
            activity: z.string().optional().describe("Core activity to filter NGOs (e.g., 'Educação', 'Cultura')"),
            limit: z.number().optional().default(10).describe("Maximum number of NGOs to return"),
        }),
        outputSchema: z.object({
            oscs: z.array(ngoProfileSchema.extend({ oscId: z.string() })),
            editais: z.array(editalSchema.extend({ editalId: z.string() })),
        })
    },
    async (input) => {
        const db = getFirestore();

        // Fetch up to 5 editais for context
        const editaisSnapshot = await db.collection('editais').limit(5).get();
        const editais = editaisSnapshot.docs.map(doc => ({
            title: doc.data().title,
            importantDates: doc.data().importantDates,
            editalId: doc.id
        })) as any; // Cast as any to bypass strict schema for minimal response

        // Fetch NGOs with basic filtering
        const oscsQuery = db.collection('oscs');

        // We will just fetch a chunk and filter in memory if queries get complex,
        // or apply simple filters (Cap limit strictly to 5)
        const safeLimit = Math.min(input.limit || 5, 5);
        const oscsSnapshot = await oscsQuery.limit(safeLimit).get();
        let oscs = oscsSnapshot.docs.map(doc => ({
            name: doc.data().name,
            location: doc.data().location,
            oscId: doc.id
        })) as any; // Cast as any to bypass strict schema for minimal response

        // Apply basic in-memory filters for simplicity given complex NoSQL querying constraints
        if (input.city) {
            const lowerCity = input.city.toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscs = oscs.filter((osc: any) => osc.location.toLowerCase().includes(lowerCity));
        }
        if (input.state) {
            const lowerState = input.state.toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscs = oscs.filter((osc: any) => osc.location.toLowerCase().includes(lowerState));
        }
        if (input.activity) {
            const lowerActivity = input.activity.toLowerCase();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscs = oscs.filter((osc: any) =>
                (osc.coreActivities || []).some((act: string) => act.toLowerCase().includes(lowerActivity))
            );
        }

        // Return up to the requested limit
        oscs = oscs.slice(0, input.limit || 10);

        return {
            oscs,
            editais
        };
    }
);

const copilotFlow = ai.defineFlow(
    {
        name: 'copilotFlow',
        inputSchema: z.object({
            prompt: z.string().max(2000).describe("Natural language prompt from the user"),
        }),
        outputSchema: copilotResponseSchema,
    },
    async (input) => {
        const systemPrompt = `Você é um assistente de IA (Co-pilot) para a plataforma Tríade Assessoria.
Sua tarefa é ajudar operadores a encontrar ONGs (OSCs) adequadas para Editais (Grants) com base no prompt natural do usuário.
Você deve usar a ferramenta 'searchDatabaseTool' para buscar dados reais do banco de dados (ONGs e Editais disponíveis).
Após obter os dados, analise-os e selecione as ONGs que melhor atendem ao pedido do usuário.
Além disso, rascunhe uma mensagem de contato (email ou WhatsApp) engajadora para essas ONGs.
Responda estritamente no formato do schema em português do Brasil (pt-BR).`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            tools: [searchDatabaseTool],
            messages: [
                { role: 'system', content: [{ text: systemPrompt }] },
                { role: 'user', content: [{ text: input.prompt }] }
            ],
            output: { schema: copilotResponseSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar resposta do Copilot");
        }
        return response.output;
    }
);

export const askCopilotFunction = onCall({
    cors: true,
    timeoutSeconds: 300,
}, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const uid = request.auth.uid;
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);

    const { prompt } = request.data as { prompt: string };
    if (!prompt) {
        throw new HttpsError('invalid-argument', 'O prompt é obrigatório.');
    }
    if (prompt.length > 2000) {
        throw new HttpsError('invalid-argument', 'O prompt excede o limite máximo de 2000 caracteres.');
    }

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const now = Date.now();
            if (userDoc.exists) {
                const data = userDoc.data();
                if (data && data.lastCopilotRequest) {
                    const diff = now - data.lastCopilotRequest;
                    if (diff < 10000) {
                        throw new HttpsError('resource-exhausted', 'Por favor, aguarde 10 segundos antes de enviar outra solicitação ao Copilot.');
                    }
                }
            }
            transaction.set(userRef, { lastCopilotRequest: now }, { merge: true });
        });
    } catch (error: any) {
        if (error.code === 'resource-exhausted') {
            throw error;
        }
        console.error('Error checking rate limit:', error);
        throw new HttpsError('internal', 'Erro interno ao verificar o limite de taxa.');
    }

    try {
        return await copilotFlow({ prompt });
    } catch (error: unknown) {
        console.error('Error in askCopilotFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during Copilot execution.';
        throw new HttpsError('internal', errorMessage);
    }
});

export const manualTriggerRssSyncFunction = onCall({
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'User must be an admin.');
    }

    try {
        const rssQueue = getFunctions().taskQueue('locations/us-central1/functions/rssWorker');
        await rssQueue.enqueue({});
        return { success: true, message: 'RSS sync triggered' };
    } catch (error: unknown) {
        console.error('Error in manualTriggerRssSyncFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during manual RSS sync.';
        throw new HttpsError('internal', errorMessage);
    }
});


import { NotificationService, MockNotificationProvider } from './services/notifications.js';

export const recalculateDashboardStats = onCall({
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (req) => {


    const db = getFirestore();
    try {
        const editaisSnapshot = await db.collection('editais').get();
        const editaisMap: Record<string, any> = {};
        editaisSnapshot.docs.forEach(d => {
            editaisMap[d.id] = d.data();
        });

        const allMatchesSnapshot = await db.collection('matches').get();
        const matches = allMatchesSnapshot.docs.map(d => d.data()).filter(m => {
            // Exclude globally inactive editais
            return editaisMap[m.editalId]?.ativo !== false;
        });

        const total = matches.length;
        const aiApproved = matches.filter(m => m.eligibility === true).length;
        const manuallyApproved = matches.filter(m => m.actionState === 'Aprovado').length;
        const pendentes = matches.filter(m => (!m.actionState && m.eligibility !== false) || m.actionState === 'Pendente').length;
        const reprovados = matches.filter(m => m.actionState === 'Rejeitado' || (!m.actionState && m.eligibility === false)).length;

        const isNotReprovado = (m: any) => !(m.actionState === 'Rejeitado' || (!m.actionState && m.eligibility === false));

        const hotLeadsMap: Record<string, number> = {};
        matches.filter(m => m.matchScore >= 80 && isNotReprovado(m)).forEach(m => {
            hotLeadsMap[m.oscId] = (hotLeadsMap[m.oscId] || 0) + 1;
        });

        const validEditalMatches = matches.filter(m => isNotReprovado(m));
        const editalCountMap: Record<string, number> = {};
        validEditalMatches.forEach(m => {
            editalCountMap[m.editalId] = (editalCountMap[m.editalId] || 0) + 1;
        });

        const tagCountMap: Record<string, number> = {};
        matches.filter(m => m.eligibility === true).forEach(m => {
            if (m.badges && Array.isArray(m.badges)) {
                m.badges.forEach((badge: string) => {
                    tagCountMap[badge] = (tagCountMap[badge] || 0) + 1;
                });
            }
        });

        const stats = {
            total,
            aiApproved,
            manuallyApproved,
            pendentes,
            reprovados,
            hotLeadsMap,
            editalCountMap,
            tagCountMap,
            updatedAt: FieldValue.serverTimestamp()
        };

        await db.collection('system_metadata').doc('dashboard_stats').set(stats);

        return { success: true, message: 'Dashboard stats recalculated successfully' };
    } catch (error) {
        console.error("Error computing dashboard stats", error);
        throw new HttpsError('internal', 'Failed to compute stats');
    }
});

export const onMatchGenerated = onDocumentWritten('matches/{matchId}', async (event) => {
    const MATCH_THRESHOLD = 85;

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    // If it's a deletion, afterData is undefined. Ignore.
    if (!afterData) {
        return;
    }

    const currentScore = afterData.matchScore || 0;
    const previousScore = beforeData?.matchScore || 0;

    // We only care if the score is now >= THRESHOLD, AND it wasn't previously >= THRESHOLD.
    // This prevents redundant alerts for updates that keep the score high.
    if (currentScore >= MATCH_THRESHOLD && previousScore < MATCH_THRESHOLD) {
        const db = getFirestore();
        const oscId = afterData.oscId;
        const editalId = afterData.editalId;

        if (!oscId || !editalId) {
            console.error("Match document is missing oscId or editalId:", event.params.matchId);
            return;
        }

        try {
            const [oscSnap, editalSnap] = await Promise.all([
                db.collection('oscs').doc(oscId).get(),
                db.collection('editais').doc(editalId).get()
            ]);

            const ngoName = oscSnap.data()?.name || "ONG Desconhecida";
            const editalTitle = editalSnap.data()?.title || "Edital Desconhecido";

            // Format action plan snippet if it exists
            let actionPlanSnippet = undefined;
            if (Array.isArray(afterData.actionPlan) && afterData.actionPlan.length > 0) {
                actionPlanSnippet = afterData.actionPlan[0];
                if (afterData.actionPlan.length > 1) {
                    actionPlanSnippet += " (e mais...)";
                }
            }

            const notificationService = new NotificationService(new MockNotificationProvider());

            await notificationService.notifyHighMatch({
                ngoName,
                editalTitle,
                score: currentScore,
                actionPlanSnippet
            });

            console.log(`Notification sent for match ${event.params.matchId} (Score: ${currentScore})`);
        } catch (error) {
            console.error("Error sending notification for match:", event.params.matchId, error);
        }
    }
});

export const triggerAgenticSearch = onCall({
    cors: true,
    timeoutSeconds: 300,
    invoker: 'public',
    memory: '1GiB',
}, async (request) => {
    logger.info(`[Diagnostics] triggerAgenticSearch invoked.`);
    logger.info(`[Diagnostics] GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);
    logger.info(`[Diagnostics] GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'not set'}`);

    try {
        const oscId = request.data.oscId;
        if (!oscId) {
            throw new HttpsError('invalid-argument', 'oscId is required');
        }

        const db = getFirestore();
        const jobRef = db.collection('agentic_search_jobs').doc();

        await jobRef.set({
            id: jobRef.id,
            oscId: oscId,
            status: 'queued',
            progress: {
                queriesGenerated: 0,
                linksFound: 0,
                linksEvaluated: 0,
                validEditaisEnqueued: 0,
            },
            logs: ['Busca enfileirada.'],
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        const agenticQueue = getFunctions().taskQueue('locations/us-central1/functions/agenticSearchWorker');
        await agenticQueue.enqueue({
            oscId: oscId,
            jobId: jobRef.id
        });

        return { success: true, message: `Busca agêntica enfileirada para OSC ${oscId}`, jobId: jobRef.id };
    } catch (error: unknown) {
        console.error("Error triggering agentic search:", error);
        throw formatGenkitError(error, 'Falha ao iniciar a busca agêntica.');
    }
});

export const autonomousSearchWorker = onCall({
    enforceAppCheck: false
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { targetId, query } = request.data as { targetId?: string, query?: string };

    logger.info(`Triggering background autonomous search. TargetId: ${targetId || 'All'}, Query: ${query}`);

    const db = getFirestore();

    // Fetch targets
    let targetsSnapshot;
    if (targetId) {
        const targetDoc = await db.collection('scraping_targets').doc(targetId).get();
        if (!targetDoc.exists) {
            throw new HttpsError('not-found', 'Scraping target not found.');
        }
        targetsSnapshot = { docs: [targetDoc] };
    } else {
        targetsSnapshot = await db.collection('scraping_targets').get();
    }

    if (!targetsSnapshot || targetsSnapshot.docs.length === 0) {
        throw new HttpsError('failed-precondition', 'No scraping targets configured.');
    }

    const allTargets = targetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = allTargets.filter((t: any) => t.active !== false);

    if (targets.length === 0) {
        throw new HttpsError('failed-precondition', 'No active scraping targets available.');
    }

    const searchRef = db.collection('searches').doc();

    await searchRef.set({
        targets,
        query: query || null,
        logs: [],
        status: 'running',
        message: `Iniciando busca em ${targets.length} fontes...`,
        totalTargets: targets.length,
        completedTargets: 0,
        processedCount: 0,
        savedCount: 0,
        createdAt: FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        searchId: searchRef.id,
        message: 'Busca autônoma iniciada em segundo plano.'
    };
});

export const triggerScrapingWorker = onCall({
    cors: true,
    timeoutSeconds: 300,
}, async (request) => {
    try {
        const targetId = request.data.targetId;
        if (!targetId) {
            throw new HttpsError('invalid-argument', 'targetId is required');
        }

        const db = getFirestore();
        const targetDoc = await db.collection('scraping_targets').doc(targetId).get();
        if (!targetDoc.exists) {
            throw new HttpsError('not-found', 'Scraping target not found');
        }

        const targetData = { id: targetDoc.id, ...targetDoc.data() } as { id: string, name?: string, strategy?: string, url?: string, cssSelector?: string, keywords?: string };

        // Create a tracking document just like autonomousSearchWorker does
        const searchRef = db.collection('searches').doc();
        await searchRef.set({
            query: `Manual Sync: ${targetData.name || targetData.id}`,
            createdAt: FieldValue.serverTimestamp(),
            status: 'running',
            logs: [],
            totalTargets: 1,
            completedTargets: 0,
            processedCount: 0,
            savedCount: 0
        });

        const queue = getFunctions().taskQueue('locations/us-central1/functions/processScrapingTargetWorker');
        await queue.enqueue({
            searchId: searchRef.id,
            target: targetData,
            query: ''
        });

        return { success: true, message: `Sincronização iniciada para a fonte.`, searchId: searchRef.id };
    } catch (error: unknown) {
        console.error("Error triggering manual sync:", error);
        throw new HttpsError('internal', 'Falha ao iniciar a sincronização.');
    }
});

export const seedScrapingTargets = onCall({
    enforceAppCheck: false
// eslint-disable-next-line @typescript-eslint/no-unused-vars
}, async (request) => {
    // TODO: Re-enable auth checks
    const db = getFirestore();

    // Fetch existing documents
    const existingDocs = await db.collection('scraping_targets').get();

    // Batch for deletions
    const deleteBatch = db.batch();
    existingDocs.forEach((doc) => {
        deleteBatch.delete(doc.ref);
    });
    if (!existingDocs.empty) {
        await deleteBatch.commit();
    }

    const batch = db.batch();

    const targets = [
        { name: "Prosas Oportunidades (API)", strategy: "PROSAS" },
        { name: "Query: edital ONG 2024", query: "edital ONG 2024", strategy: "VERTEX" },
        { name: "Query: fomento cultura terceiro setor", query: "fomento cultura terceiro setor", strategy: "VERTEX" },
        { name: "Query: financiamento projetos sociais brasil", query: "financiamento projetos sociais brasil", strategy: "VERTEX" },
        { name: "Query: chamada publica para osc", query: "chamada publica para osc", strategy: "VERTEX" },
        { name: "Query: edital projetos ambientais ong", query: "edital projetos ambientais ong", strategy: "VERTEX" },
        { name: "Query: edital ONG 2024 (Brave)", query: "edital ONG 2024", strategy: "BRAVE" },
        { name: "Query: fomento cultura terceiro setor (Brave)", query: "fomento cultura terceiro setor", strategy: "BRAVE" },
        { name: "Query: financiamento projetos sociais brasil (Brave)", query: "financiamento projetos sociais brasil", strategy: "BRAVE" },
        { name: "Query: chamada publica para osc (Brave)", query: "chamada publica para osc", strategy: "BRAVE" },
        { name: "Query: edital projetos ambientais ong (Brave)", query: "edital projetos ambientais ong", strategy: "BRAVE" },
        { name: "Prosas (RSS Editais)", url: "https://blog.prosas.com.br/categoria/editais/feed/", strategy: "RSS" },
        { name: "Diário Oficial da União (Gov)", url: "https://www.in.gov.br", strategy: "AUTO" },
        { name: "Ministério da Cultura (Editais)", url: "https://www.gov.br/cultura/pt-br/assuntos/editais", strategy: "AUTO" },
        { name: "Prosas", url: "https://prosas.com.br", strategy: "AUTO" },
        { name: "ABCR (Associação Brasileira de Captadores de Recursos)", url: "https://captadores.org.br", strategy: "AUTO" },
        { name: "GIFE", url: "https://gife.org.br", strategy: "AUTO" },
        { name: "Rede Filantropia", url: "https://www.filantropia.ong", strategy: "AUTO" },
        { name: "Nossa Causa", url: "https://nossacausa.com", strategy: "AUTO" },
        { name: "Idealist", url: "https://www.idealist.org", strategy: "AUTO" },
        { name: "Mapa das OSCs (IPEA)", url: "https://mapaosc.ipea.gov.br", strategy: "AUTO" },
        { name: "Captamos", url: "https://captamos.org.br", strategy: "AUTO" },
        { name: "Fundo Brasil de Direitos Humanos", url: "https://www.fundobrasil.org.br", strategy: "AUTO" },
        { name: "Fundo Casa Socioambiental", url: "https://casa.org.br", strategy: "AUTO" },
        { name: "Fundo Elas+ (Fundo de Investimento Social Elas)", url: "https://fundosocialelas.org", strategy: "AUTO" },
        { name: "Fundo Baobá para Equidade Racial", url: "https://baoba.org.br", strategy: "AUTO" },
        { name: "BrazilFoundation", url: "https://brazilfoundation.org", strategy: "AUTO" },
        { name: "Instituto Phi", url: "https://institutophi.org.br", strategy: "AUTO" },
        { name: "Fundação Banco do Brasil", url: "https://fbb.org.br", strategy: "AUTO" },
        { name: "Itaú Social", url: "https://itausocial.org.br", strategy: "AUTO" },
        { name: "Fundação Lemann", url: "https://fundacaolemann.org.br", strategy: "AUTO" },
        { name: "Instituto Votorantim", url: "https://www.institutovotorantim.org.br", strategy: "AUTO" },
        { name: "Instituto EDP", url: "https://institutoedp.org.br", strategy: "AUTO" },
        { name: "Fundação Telefônica Vivo", url: "https://fundacaotelefonica.org.br", strategy: "AUTO" },
        { name: "Fundação Grupo Boticário", url: "https://www.fundacaogrupoboticario.org.br", strategy: "AUTO" },
        { name: "Instituto Alana", url: "https://alana.org.br", strategy: "AUTO" },
        { name: "Instituto C&A", url: "https://www.institutocea.org.br", strategy: "AUTO" },
        { name: "Instituto Sabin", url: "https://institutosabin.org.br", strategy: "AUTO" },
        { name: "Fundação Cargill", url: "https://fundacaocargill.org.br", strategy: "AUTO" },
        { name: "Fundação ArcelorMittal", url: "https://www.fundacaoarcelormittal.org.br", strategy: "AUTO" },
        { name: "Instituto BRF", url: "https://institutobrf.com", strategy: "AUTO" },
        { name: "Instituto Lojas Renner", url: "https://institutolojasrenner.org.br", strategy: "AUTO" },
        { name: "Instituto MRV", url: "https://www.institutomrv.com.br", strategy: "AUTO" },
        { name: "Lei de Incentivo à Cultura (Rouanet - Ministério da Cultura)", url: "https://www.gov.br/cultura/pt-br", strategy: "AUTO" },
        { name: "Lei de Incentivo ao Esporte (Ministério do Esporte)", url: "https://www.gov.br/esporte/pt-br", strategy: "AUTO" },
        { name: "BNDES (Fundo Socioambiental e Fundo Amazônia)", url: "https://www.bndes.gov.br", strategy: "AUTO" },
        { name: "Funcultura / ProAC / FAC", url: "https://www.cultura.sp.gov.br", strategy: "AUTO" },
        { name: "Fundo Nacional do Meio Ambiente (FNMA)", url: "https://www.gov.br/mma/pt-br/assuntos/fundo-nacional-do-meio-ambiente", strategy: "AUTO" },
        { name: "Funarte (Fundação Nacional de Artes)", url: "https://www.gov.br/funarte/pt-br", strategy: "AUTO" },
        { name: "FIA (Fundo da Infância e Adolescência) e Fundo do Idoso", url: "https://www.gov.br/mdh/pt-br", strategy: "AUTO" },
        { name: "Capes e CNPq", url: "https://www.gov.br/capes/pt-br", strategy: "AUTO" },
        { name: "ONU Brasil", url: "https://brasil.un.org/pt-br", strategy: "AUTO" },
        { name: "Banco Interamericano de Desenvolvimento (BID)", url: "https://www.iadb.org/pt", strategy: "AUTO" },
        { name: "USAID", url: "https://www.usaid.gov/pt-br/brazil", strategy: "AUTO" },
        { name: "Fundação Ford", url: "https://www.fordfoundation.org", strategy: "AUTO" },
        { name: "Open Society Foundations", url: "https://www.opensocietyfoundations.org", strategy: "AUTO" },
        { name: "Fundação OAK", url: "https://oakfnd.org", strategy: "AUTO" },
        { name: "WWF-Brasil", url: "https://www.wwf.org.br", strategy: "AUTO" },
        { name: "Embaixadas e Consulados no Brasil (Programa de Pequenos Projetos)", url: "https://br.emb-japan.go.jp/itpr_pt/apc.html", strategy: "AUTO" }
    ];

    for (const target of targets) {
        const ref = db.collection('scraping_targets').doc();
        batch.set(ref, {
            ...target,
            createdAt: FieldValue.serverTimestamp()
        });
    }

    await batch.commit();

    return {
        success: true,
        message: `${targets.length} alvos de scraping oficiais inseridos com sucesso (dados anteriores removidos).`
    };
});


export const extractionWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    const { searchId, link, contentId, reason, discoverySource } = request.data as { searchId?: string, link: string, contentId: string, reason: string, discoverySource?: string };

    if (!link || !contentId) {
        console.error("Invalid task payload: missing link, or contentId.");
        return;
    }

    const db = getFirestore();
    const searchRef = searchId && !['GLOBAL_RUN', 'BULK_DISCOVERY', 'MANUAL', 'RSS'].includes(searchId) && !searchId.startsWith('AGENTIC_') ? db.collection('searches').doc(searchId) : null;
    const contentRef = db.collection('scraping_contents').doc(contentId);

    try {
        const contentDoc = await contentRef.get();
        if (!contentDoc.exists) {
            throw new Error(`Content document ${contentId} not found.`);
        }
        const text = contentDoc.data()?.text;

        if (!text) {
            throw new Error(`Content document ${contentId} has no text.`);
        }

        const editalResult = await extractEditalRules({ text });

        // Deduplication Enhancement: Generate ID from a normalized source URL
        let normalizedUrl = link;
        try {
            const urlObj = new URL(link);
            // Remove irrelevant query parameters
            const paramsToKeep = new URLSearchParams();
            for (const [key, value] of urlObj.searchParams.entries()) {
                if (!['source', 'utm_source', 'utm_medium', 'utm_campaign'].includes(key.toLowerCase())) {
                    paramsToKeep.append(key, value);
                }
            }
            urlObj.search = paramsToKeep.toString();
            normalizedUrl = urlObj.toString();
        } catch (e) {
            // Fallback if not a valid URL
        }
        // Strip protocols, www, and trailing slashes
        normalizedUrl = normalizedUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

        editalResult.externalProviderId = `url_${require('crypto').createHash('md5').update(normalizedUrl).digest('hex')}`;

        // Pre-parsing Date Standardization (pt-BR to ISO)
        if (editalResult.deadline) {
            const brDateMatch = editalResult.deadline.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (brDateMatch) {
                const [, day, month, year] = brDateMatch;
                editalResult.deadline = `${year}-${month}-${day}`;
            }
        }
        if (editalResult.publicationDate) {
            const brDateMatch = editalResult.publicationDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (brDateMatch) {
                const [, day, month, year] = brDateMatch;
                editalResult.publicationDate = `${year}-${month}-${day}`;
            }
        }

        // Trusted Source Normalization Layer
        const isTrustedSource = Boolean(
            (discoverySource && (
                discoverySource === 'Prosas Newsletter' ||
                discoverySource === 'PROSAS_NEWSLETTER' ||
                discoverySource.toLowerCase().includes('prosas')
            )) ||
            (link && link.includes('prosas.com.br'))
        );

        let parseResult = editalSchema.safeParse(editalResult);

        if (!parseResult.success && isTrustedSource) {
            console.warn(`[Extraction Trace] Strict validation failed for trusted source ${discoverySource}. Applying graceful recovery defaults.`);
            // Apply safe defaults for missing required fields to prevent hard-rejection of valid leads
            const recoveredData = {
                ...editalResult,
                title: editalResult.title || 'Oportunidade Prosas',
                issuer: editalResult.issuer || 'Financiador Não Especificado',
                publicationDate: editalResult.publicationDate || new Date().toISOString().split('T')[0],
                totalBudget: typeof editalResult.totalBudget === 'number' ? editalResult.totalBudget : 0,
                eligibilityCriteria: {
                    minYearsActive: typeof editalResult.eligibilityCriteria?.minYearsActive === 'number' ? editalResult.eligibilityCriteria.minYearsActive : 0,
                    requiredLocations: editalResult.eligibilityCriteria?.requiredLocations?.length > 0
                        ? editalResult.eligibilityCriteria.requiredLocations
                        : ['Nacional'],
                    requiredDocumentation: editalResult.eligibilityCriteria?.requiredDocumentation?.length > 0
                        ? editalResult.eligibilityCriteria.requiredDocumentation
                        : ['Estatuto Social'],
                    allowedActivities: editalResult.eligibilityCriteria?.allowedActivities?.length > 0
                        ? editalResult.eligibilityCriteria.allowedActivities
                        : ['Geral']
                }
            };

            // Re-run validation with recovered data
            parseResult = editalSchema.safeParse(recoveredData);
            if (parseResult.success) {
                console.info(`[Extraction Trace] Graceful recovery successful for trusted source ${discoverySource}.`);
            }
        }

        let docRef: FirebaseFirestore.DocumentReference | null = null;

        if (parseResult.success) {
            const editalData = parseResult.data;

            // Hard-reject expired editais
            if (editalData.deadline) {
                const deadlineDate = new Date(editalData.deadline);

                // Strict validation check for invalid dates
                if (isNaN(deadlineDate.getTime())) {
                    if (!editalData.isContinuous) {
                        console.info(`[Extraction Trace] Skipping edital with invalid deadline date: ${editalData.title} (Deadline: ${editalData.deadline})`);
                        if (searchRef) {
                            await searchRef.set({
                                logs: FieldValue.arrayUnion({ link, status: 'Rejeitado (Data Inválida)', reason: `Formato de data de prazo inválido: ${editalData.deadline}` })
                            }, { merge: true });
                        }
                        return;
                    }
                } else {
                    const currentDate = new Date();
                    // Set to start of day for accurate comparison
                    currentDate.setHours(0, 0, 0, 0);
                    if (deadlineDate < currentDate) {
                        console.info(`[Extraction Trace] Skipping expired edital: ${editalData.title} (Deadline: ${editalData.deadline})`);
                        if (searchRef) {
                            await searchRef.set({
                                logs: FieldValue.arrayUnion({ link, status: 'Rejeitado (Expirado)', reason: `Prazo encerrado em ${editalData.deadline}` })
                            }, { merge: true });
                        }
                        return;
                    }
                }
            }

            let embedding: number[] = [];
            try {
                const editalData = parseResult.data;
                const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${editalData.eligibilityCriteria.allowedActivities?.join(', ') || ''}.`;
                embedding = await generateTextEmbedding(editalText);
            } catch (embedError) {
                console.warn("Failed to generate embedding for new edital:", embedError);
            }

            let editalDocData: any = {
                ...parseResult.data,
                rawText: text.substring(0, 5000),
                sourceUrl: link,
                embedding: embedding.length > 0 ? FieldValue.vector(embedding) : null,
                discoverySource: discoverySource || contentDoc.data()?.discoverySource || null,
            };


            const externalProviderId = editalDocData.externalProviderId;
            editalDocData.externalProviderId = externalProviderId;
            docRef = db.collection('editais').doc(externalProviderId);

            // Read-before-write to ensure safe timestamp handling
            const existingDoc = await docRef.get();
            if (existingDoc.exists) {
                editalDocData.updatedAt = FieldValue.serverTimestamp();
            } else {
                editalDocData.createdAt = FieldValue.serverTimestamp();
            }

            await docRef.withConverter(editalConverter).set(editalDocData as Partial<z.infer<typeof editalSchema>>, { merge: true });

            if (searchRef) {
                const safeReason = reason ? reason.substring(0, 200) : '';
                await searchRef.set({
                    logs: FieldValue.arrayUnion({ link, status: 'Importado', reason: safeReason }),
                    savedCount: FieldValue.increment(1)
                }, { merge: true });
            }
        } else {
            console.error(`[Extraction Trace] Validation failed for ${link}. Route to failed_ingestions.`, parseResult.error);

            // Route to failed_ingestions
            await db.collection('failed_ingestions').add({
                sourceUrl: link,
                rawText: text.substring(0, 5000),
                discoverySource: discoverySource || contentDoc.data()?.discoverySource || null,
                createdAt: FieldValue.serverTimestamp(),
                parseError: parseResult.error,
                originalExtractionData: editalResult
            });

            if (searchRef) {
                await searchRef.set({
                    logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: 'Salvo com erro de validação (Falha na Extração).' }),
                    savedCount: FieldValue.increment(1)
                }, { merge: true });
            }
            // Error thrown removed to prevent infinite task retries
        }

        // Handoff: Trigger Match Evaluator for agentic search if searchId contains an oscId pattern
        // Note: In agentic search, we passed oscId in place of searchId in enqueueEditalExtraction
        if (docRef && searchId && searchId.startsWith("AGENTIC_")) {
            const realOscId = searchId.replace("AGENTIC_", "");
            try {
                await safeEnqueueTasks(
                    'locations/us-central1/functions/matchEvaluatorWorker',
                    [{ oscId: realOscId, editalId: docRef.id }],
                    (data) => `eval_handoff_${data.oscId}_${data.editalId}`
                );
                console.info(`[Handoff Trace] Successfully enqueued match evaluation for new edital ${docRef.id} and OSC ${realOscId}`);
            } catch (matchErr) {
                console.error(`[Handoff Trace] Failed to enqueue match evaluator for edital ${docRef.id}:`, matchErr);
            }
        } else if (docRef && searchId && searchId !== "MANUAL" && searchId !== "RSS" && searchId.length > 15 && !searchId.startsWith("GLOBAL_") && !searchId.startsWith("BULK_")) {
            // Fallback for any legacy enqueue that directly passed the oscId
             try {
                await safeEnqueueTasks(
                    'locations/us-central1/functions/matchEvaluatorWorker',
                    [{ oscId: searchId, editalId: docRef.id }],
                    (data) => `eval_legacy_${data.oscId}_${data.editalId}`
                );
                console.info(`[Handoff Trace] Successfully enqueued match evaluation (legacy) for new edital ${docRef.id} and OSC ${searchId}`);
            } catch (matchErr) {
                console.error(`[Handoff Trace] Failed to enqueue match evaluator for edital ${docRef.id} (legacy):`, matchErr);
            }
        }

        // Cleanup the temporary content document only on success (to allow retries on error)
        try {
            await contentRef.delete();
        } catch (cleanupError) {
            console.error(`Failed to delete temporary content document ${contentId}:`, cleanupError);
        }
    } catch (error) {
        console.error(`Error in extractionWorker for link ${link}:`, error);
        if (searchRef) {
            const rawErrorMsg = error instanceof Error ? error.message : 'Erro desconhecido na extração';
            const safeErrorMsg = rawErrorMsg ? rawErrorMsg.substring(0, 200) : '';
            await searchRef.set({
                logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: safeErrorMsg })
            }, { merge: true });
        }
        throw error;
    }
});


async function handleScraperFailure(db: FirebaseFirestore.Firestore, targetId: string, errorMsg: string) {
    if (!targetId) return;
    const targetRef = db.collection('scraping_targets').doc(targetId);

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(targetRef);
        if (!doc.exists) return;

        const currentCount = doc.data()?.failureCount || 0;
        const newCount = currentCount + 1;

        const updateData: Record<string, unknown> = {
            failureCount: newCount,
            lastFailedAt: FieldValue.serverTimestamp(),
            disabledReason: errorMsg
        };

        if (newCount >= 3) {
            updateData.active = false;
            logger.error(`Circuit Breaker triggered for target ${targetId}. Disabled due to ${newCount} consecutive failures: ${errorMsg}`);
        }

        transaction.update(targetRef, updateData);
    });
}

async function handleScraperSuccess(db: FirebaseFirestore.Firestore, targetId: string) {
    if (!targetId) return;
    const targetRef = db.collection('scraping_targets').doc(targetId);
    await targetRef.update({ failureCount: 0 });
}

export const prosasAuthenticatedWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 1, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 1800,
    memory: '4GiB'
}, async (request) => {
    const { url, searchId } = request.data as { url: string, searchId?: string };

    if (!url) {
        logger.error("Invalid task payload: missing url.");
        return;
    }

    logger.info(`[Prosas Auth Worker] Starting processing for URL: ${url}`);

    try {
        // 1. Fetch Session State from GCS
        const storage = getStorage();
        const sessionBucketName = 'triade-prosas-session-state';
        const sessionFileName = 'prosas_session.json';
        const sessionFilePath = `/tmp/${sessionFileName}`;

        logger.info(`[Prosas Auth Worker] Downloading session state from gs://${sessionBucketName}/${sessionFileName}`);
        await storage.bucket(sessionBucketName).file(sessionFileName).download({ destination: sessionFilePath });
        logger.info(`[Prosas Auth Worker] Session state downloaded to ${sessionFilePath}`);

        // 1.5 Session Health Check
        try {
            const sessionDataRaw = fs.readFileSync(sessionFilePath, 'utf8');
            const sessionData = JSON.parse(sessionDataRaw);
            if (!sessionData.cookies || sessionData.cookies.length === 0) {
                logger.warn('[Prosas Auth Worker] Downloaded session appears invalid (no cookies). Triggering inline renewal...');
                await renewProsasSessionInternal();
                await storage.bucket(sessionBucketName).file(sessionFileName).download({ destination: sessionFilePath });
            }
        } catch (e) {
            logger.warn('[Prosas Auth Worker] Failed to read or parse session state. Triggering inline renewal...', e);
            await renewProsasSessionInternal();
            await storage.bucket(sessionBucketName).file(sessionFileName).download({ destination: sessionFilePath });
        }

        // 2. Playwright Scraping
        chromium.use(stealth());
        const browser = await chromium.launch({
            args: chromiumSparticuz.args,
            executablePath: await chromiumSparticuz.executablePath(),
            headless: true,
        });
        let combinedText = '';
        const downloadedPdfPaths: string[] = [];

        try {
            const context = await browser.newContext({ storageState: sessionFilePath });
            const page = await context.newPage();

            logger.info(`[Prosas Auth Worker] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

            // Wait an additional moment for dynamic content
            await page.waitForTimeout(5000);

            // Check for session expiration
            const currentUrl = page.url();
            if (currentUrl.includes('/users/sign_in')) {
                logger.warn(`[Prosas Auth Worker] Session expired in-flight. Redirected to ${currentUrl}. Triggering inline renewal and throwing retryable error.`);
                await renewProsasSessionInternal();
                throw new Error('Prosas session expired. Need to renew session.');
            }

            // Extract the main content text
            const pageText = await page.evaluate(() => {
                return document.body.innerText;
            });
            combinedText = pageText;

            logger.info(`[Prosas Auth Worker] Extracted ${combinedText.length} characters of text from page.`);

            // 3. PDF link discovery and upload
            const pdfLinks = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links
                    .map(a => a.href)
                    .filter(href => href.toLowerCase().endsWith('.pdf'));
            });

            if (pdfLinks.length > 0) {
                logger.info(`[Prosas Auth Worker] Found ${pdfLinks.length} PDF links.`);
                const storage = getStorage();
                const bucket = storage.bucket(); // Default bucket

                for (const pdfUrl of pdfLinks) {
                    try {
                        logger.info(`[Prosas Auth Worker] Processing PDF: ${pdfUrl}`);

                        // Use page to navigate to PDF and save it. Wait for download event.
                        // However, directly downloading via fetch might be easier since we have the URL and the session.
                        // Or we can use page.request for authenticated fetch.
                        const response = await page.request.get(pdfUrl);
                        if (!response.ok()) {
                            logger.error(`[Prosas Auth Worker] Failed to fetch PDF ${pdfUrl}, status: ${response.status()}`);
                            continue;
                        }

                        const buffer = await response.body();
                        const fileName = `prosas_pdfs/${Date.now()}_${path.basename(new URL(pdfUrl).pathname)}`;
                        const file = bucket.file(fileName);

                        await file.save(buffer, {
                            metadata: { contentType: 'application/pdf' }
                        });
                        await file.makePublic();

                        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
                        downloadedPdfPaths.push(publicUrl);
                        logger.info(`[Prosas Auth Worker] Uploaded PDF to ${publicUrl}`);

                        let parsedText = '';
                        try {
                            const uint8Array = new Uint8Array(buffer);
                            const parser = new (PDFParse as any)(uint8Array, { max: 5 });
                            const pdfData = await parser.getText();
                            parsedText = pdfData.text;
                        } catch (parseErr) {
                            logger.error(`[Prosas Auth Worker] Error parsing PDF text for ${pdfUrl}:`, parseErr);
                        }

                        combinedText += `\n[Anexo PDF: ${publicUrl}]\nConteúdo Extraído (Max 5 pags): ${parsedText.substring(0, 10000)}`;

                    } catch (pdfErr) {
                        logger.error(`[Prosas Auth Worker] Error processing PDF ${pdfUrl}:`, pdfErr);
                    }
                }
            } else {
                logger.info(`[Prosas Auth Worker] No PDF links found on page.`);
            }

            // 4. Push to Claim Check (Lake of Editais)
            await enqueueEditalExtraction(url, combinedText, "Authenticated Prosas Scraping", searchId, "PROSAS_AUTH");
            logger.info(`[Prosas Auth Worker] Enqueued extraction for ${url}`);

        } finally {
            await browser.close();
            // Clean up session file
            if (fs.existsSync(sessionFilePath)) {
                fs.unlinkSync(sessionFilePath);
            }
        }

    } catch (error) {
        logger.error(`[Prosas Auth Worker] Fatal error processing ${url}`, error);

        const db = getFirestore();
        // Use a base64 encoded URL or a safe hash as document ID, but querying is simpler.
        // We'll use a hash or just URL string if it's short, but Firestore doc IDs can't contain slashes.
        // Safer to just query for the document to update it.
        const failuresRef = db.collection('failed_ingestions');
        const querySnapshot = await failuresRef.where('url', '==', url).limit(1).get();

        const retryCount = (request as any).retryCount || 0;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage === 'Prosas session expired. Need to renew session.') {
             logger.warn(`[Prosas Auth Worker] Handling session expiry. Skipping permanent circuit breaker.`);
             // Throw error so it can be retried eventually (possibly after cron runs again), but avoid permanent block
             throw error;
        }

        if (retryCount >= 2) {
            logger.error(`[Prosas Auth Worker] Circuit Breaker triggered for ${url} after ${retryCount + 1} attempts.`);
            if (querySnapshot.empty) {
                await failuresRef.add({
                    url: url,
                    reason: errorMessage,
                    failedAt: FieldValue.serverTimestamp(),
                    isPermanent: true
                });
            } else {
                await querySnapshot.docs[0]!.ref.update({
                    failedAt: FieldValue.serverTimestamp(),
                    isPermanent: true,
                    reason: errorMessage
                });
            }
            // Don't throw to stop retrying
        } else {
            if (querySnapshot.empty) {
                await failuresRef.add({
                    url: url,
                    attempts: retryCount + 1,
                    lastFailedAt: FieldValue.serverTimestamp(),
                    isPermanent: false
                });
            } else {
                await querySnapshot.docs[0]!.ref.update({
                    attempts: retryCount + 1,
                    lastFailedAt: FieldValue.serverTimestamp()
                });
            }
            throw error;
        }
    }
});

export const processScrapingTargetWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 1, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query, page = 1, linksQueue = [], runId, consecutiveZeroNewCount = 0 } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[], runId?: string, consecutiveZeroNewCount?: number };

    if (!searchId || !target) {
        console.error("Invalid task payload: missing searchId or target.");
        return;
    }

    const db = getFirestore();
    const searchRef = searchId && !['GLOBAL_RUN', 'BULK_DISCOVERY', 'MANUAL', 'RSS'].includes(searchId) ? db.collection('searches').doc(searchId) : null;

    logger.info(`[Scraper] Starting processing for target: ${target.name} | URL: ${target.url} | Page: ${page} | Strategy: ${target.strategy}`);

    // Local Telemetry Counters
    let heuristicRejects = 0;
    let aiRejects = 0;
    let aiApprovals = 0;
    let cacheHits = 0;
    let prosasLinks = 0;
    let errorCount = 0;
    let urlsDiscovered = 0;

    try {
        let totalProcessed = 0;
        let candidateLinks: string[] = linksQueue;
        let isNewFetch = false;

        if (candidateLinks.length === 0) {
            isNewFetch = true;
            try {
                let fetchUrl = target.url;
                const isProsas = target.name?.toLowerCase().includes('prosas') || fetchUrl.toLowerCase().includes('prosas.com.br');

                if (isProsas) {
                    fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${page}&page%5Bsize%5D=20&&sort=`;
                } else {
                    if (fetchUrl.includes('{{page}}')) {
                        fetchUrl = fetchUrl.replace(/\{\{page\}\}/g, String(page));
                    } else if (page > 1) {
                        if (target.strategy === 'AUTO') {
                            fetchUrl = fetchUrl.includes('?') ? `${fetchUrl}&page=${page}` : `${fetchUrl}?page=${page}`;
                        } else if (target.strategy !== 'RSS') {
                            logger.info(`[Scraper] Stopping pagination for ${target.name}. No {{page}} pattern defined and page is ${page}.`);
                            return;
                        }
                    }
                }

                logger.info(`[Scraper] Fetching URL: ${fetchUrl}`);

                if (isProsas) {
                    chromium.use(stealth());
                    const browser = await chromium.launch({
                        args: chromiumSparticuz.args,
                        executablePath: await chromiumSparticuz.executablePath(),
                        headless: true,
                    });

                    try {
                        const pageContext = await browser.newPage();
                        await pageContext.goto(fetchUrl, { waitUntil: 'networkidle' });
                        const jsonContent = await pageContext.evaluate(() => document.body.innerText);
                        const data = JSON.parse(jsonContent);
                        if (data && data.data && Array.isArray(data.data)) {
                            candidateLinks = data.data.map((item: any) => `https://prosas.com.br/editais/${item.id}`);
                        }

                        if (candidateLinks.length === 0) {
                            logger.info(`[Scraper] No links found for Prosas on page ${page}. Stopping pagination.`);
                        }
                    } catch (e: any) {
                        logger.warn(`Prosas API fetch failed for ${target.name}: ${e.message}`);
                        await handleScraperFailure(db, target.id, `Prosas API fetch failed: ${e.message}`);
                    } finally {
                        await browser.close();
                    }
                } else if (target.strategy === 'RSS') {
                    const parser = new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    });
                    const feed = await parser.parseURL(fetchUrl);
                    candidateLinks = feed.items.map((item: any) => item.link).filter((link: any) => !!link) as string[];
                } else if (target.strategy === 'API') {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    const response = await fetch(fetchUrl, {
                        signal: controller.signal,
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
                    });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const data = await response.json();
                        const jsonString = JSON.stringify(data);
                        const urlRegex = /(https?:\/\/[^\s"',]+)/g;
                        const matches = jsonString.match(urlRegex) || [];
                        candidateLinks = [...new Set(matches)];
                    } else {
                        logger.warn(`API fetch failed for ${target.name}: ${response.statusText}`);
                        await handleScraperFailure(db, target.id, `API fetch failed: ${response.statusText}`);
                    }
                } else if (target.strategy === 'HTML') {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);

                        let html = '';
                        let isOk = false;
                        let statusText = '';

                        logger.info(`[Scraper] Using native fetch for HTML: ${fetchUrl}`);
                        const response = await fetch(fetchUrl, {
                            signal: controller.signal,
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                            }
                        });
                        clearTimeout(timeoutId);
                        isOk = response.ok;
                        statusText = response.statusText;
                        if (isOk) {
                            html = await response.text();
                        }

                        if (isOk) {
                        const $ = cheerio.load(html);
                        const selector = target.cssSelector || 'a';

                        $(selector).each((_, el) => {
                            let href = $(el).attr('href');
                            if (href) {
                                try {
                                    href = new URL(href, fetchUrl).href;
                                    candidateLinks.push(href);
                                } catch {
                                    // Ignore
                                }
                            }
                        });
                        candidateLinks = [...new Set(candidateLinks)];
                    } else {
                            logger.warn(`HTML fetch failed for ${target.name}: ${statusText}`);
                            await handleScraperFailure(db, target.id, `HTML fetch failed: ${statusText}`);
                    }
                } else if (target.strategy === 'AUTO') {
                    const isRss = fetchUrl.toLowerCase().endsWith('.xml') || fetchUrl.toLowerCase().includes('feed');
                    if (isRss) {
                        try {
                            const parser = new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    });
                            const feed = await parser.parseURL(fetchUrl);
                            candidateLinks = feed.items.map((item: any) => item.link).filter((link: any) => !!link) as string[];
                        } catch {
                            logger.warn(`Direct RSS parsing failed for ${fetchUrl}`);
                        }
                    }

                    if (candidateLinks.length === 0) {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);

                        let html = '';
                        let contentType = '';
                        let isOk = false;
                        let statusText = '';

                        logger.info(`[Scraper] Using native fetch for AUTO: ${fetchUrl}`);
                        const response = await fetch(fetchUrl, {
                            signal: controller.signal,
                            headers: {
                                'User-Agent': 'Mozilla/5.0',
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                            }
                        });
                        clearTimeout(timeoutId);
                        isOk = response.ok;
                        statusText = response.statusText;
                        contentType = response.headers.get('content-type') || '';
                        if (isOk) {
                            html = await response.text();
                        }

                        if (isOk) {
                            if (contentType.includes('xml') || contentType.includes('rss')) {
                                try {
                                    const parser = new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    });
                                    const feed = await parser.parseString(html);
                                    candidateLinks = feed.items.map((item: any) => item.link).filter((link: any) => !!link) as string[];
                                } catch {
                                    logger.warn(`Failed to parse XML response as RSS for ${fetchUrl}`);
                                }
                            } else {
                                const $ = cheerio.load(html);
                                const rssLink = $('link[type="application/rss+xml"]').attr('href');
                                if (rssLink) {
                                    try {
                                        const absoluteRssUrl = new URL(rssLink, fetchUrl).href;
                                        const parser = new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    });
                                        const feed = await parser.parseURL(absoluteRssUrl);
                                        candidateLinks = feed.items.map((item: any) => item.link).filter((link: any) => !!link) as string[];
                                    } catch {
                                        logger.warn(`Failed to parse discovered RSS feed`);
                                    }
                                }

                                if (candidateLinks.length === 0) {
                                    let rawLinks: string[] = [];
                                    $('a').each((_, el) => {
                                        let href = $(el).attr('href');
                                        if (href) {
                                            try {
                                                href = new URL(href, fetchUrl).href;
                                                rawLinks.push(href);
                                            } catch {
                                                // Ignore
                                            }
                                        }
                                    });
                                    rawLinks = [...new Set(rawLinks)];
                                    const excludePatterns = [/sobre/i, /contato/i, /\.jpg$/i, /\.png$/i, /facebook\.com/i, /instagram\.com/i, /twitter\.com/i, /mailto:/i, /login/i, /entrar/i];
                                    const includePatterns = [/\/edital\//i, /\/chamada\//i, /edital/i, /inscricoes/i, /inscrições/i, /processo-seletivo/i, /\.pdf$/i];
                                    const preFiltered = rawLinks.filter(link => !excludePatterns.some(pattern => pattern.test(link)));
                                    candidateLinks = preFiltered.filter(link => includePatterns.some(pattern => pattern.test(link)));
                                }
                            }
                        } else {
                            logger.warn(`AUTO fetch failed for ${target.name}: ${statusText}`);
                            await handleScraperFailure(db, target.id, `AUTO fetch failed: ${statusText}`);
                        }
                    }
                }
            } catch (error) {
                logger.error(`[Scraper Error] Error extracting links for target ${target.name} (Page ${page}):`, error);
                await handleScraperFailure(db, target.id, error instanceof Error ? error.message : 'Unknown extraction error');
            }

            logger.info(`[Scraper] Discovered ${candidateLinks.length} total edital links for target ${target.name} on Page ${page}`);

            if (candidateLinks.length > 0) {
                await handleScraperSuccess(db, target.id);
            }
        } // end if isNewFetch

        const linksToProcess = candidateLinks.slice(0, 10);
        const remainingLinks = candidateLinks.slice(10);
        logger.info(`[Scraper] Processing batch of ${linksToProcess.length} links. Remaining in queue for this page: ${remainingLinks.length}`);

        const limit = pLimit(3);
        const processPromises = linksToProcess.map((link) => limit(async () => {
            if (!link) return;

            const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                return;
            }

            // Rejection Cache Deduplication
            const rejectionRef = await db.collection('scraping_cache').where('url', '==', link).limit(1).get();
            if (!rejectionRef.empty) {
                cacheHits++;
                totalProcessed++;
                return;
            }

            try {
                const routeResult = await routeEditalUrl(link, searchId, searchId, { searchQuery: query }, "VERTEX_SEARCH");
                const safeReason = routeResult.message ? routeResult.message.substring(0, 200) : '';

                urlsDiscovered++;

                if (routeResult.outcome === 'HEURISTIC_REJECT') heuristicRejects++;
                else if (routeResult.outcome === 'AI_REJECT') aiRejects++;
                else if (routeResult.outcome === 'AI_APPROVE') aiApprovals++;
                else if (routeResult.outcome === 'PROSAS') prosasLinks++;
                else if (routeResult.outcome === 'ERROR') errorCount++;

                if (routeResult.success) {
                    if (searchRef) {
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Em Processamento (Extração)', reason: safeReason })
                        });
                    }
                } else {
                    if (searchRef) {
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Ignorado/Rejeitado', reason: safeReason })
                        });
                    }
                    // Save to rejection cache with 30-day TTL
                    const expireAt = new Date();
                    expireAt.setDate(expireAt.getDate() + 30);
                    await db.collection('scraping_cache').add({
                        url: link,
                        reason: safeReason,
                        createdAt: FieldValue.serverTimestamp(),
                        expireAt: expireAt
                    });
                }

            } catch (error) {
                console.error(`Error processing link ${link} from ${target.name}:`, error);
                errorCount++;
                const rawErrorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
                const safeErrorMsg = rawErrorMsg ? rawErrorMsg.substring(0, 200) : '';
                if (searchRef) {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: safeErrorMsg })
                    });
                }
            }
            totalProcessed++;
        }));

        await Promise.all(processPromises);

        if (runId) {
            try {
                const telemetryUpdate: any = {
                    'phases.internalFontes.urlsDiscovered': FieldValue.increment(urlsDiscovered),
                    'totalUrlsScanned': FieldValue.increment(urlsDiscovered),
                    'phases.internalFontes.newEditaisEnqueued': FieldValue.increment(aiApprovals + prosasLinks),
                    'phases.internalFontes.metrics.heuristicRejects': FieldValue.increment(heuristicRejects),
                    'phases.internalFontes.metrics.aiRejects': FieldValue.increment(aiRejects),
                    'phases.internalFontes.metrics.cacheHits': FieldValue.increment(cacheHits),
                    'phases.internalFontes.metrics.aiApprovals': FieldValue.increment(aiApprovals),
                    'phases.internalFontes.metrics.prosasLinks': FieldValue.increment(prosasLinks),
                    'phases.internalFontes.metrics.errors': FieldValue.increment(errorCount)
                };
                await db.collection('ingestion_runs').doc(runId).update(telemetryUpdate);
            } catch (e: any) {
                logger.warn(`Failed to update batched telemetry for runId ${runId}: ${e.message}`);
            }
        }

        const queue = getFunctions().taskQueue('locations/us-central1/functions/processScrapingTargetWorker');

        if (remainingLinks.length > 0) {
            // Still have links from the current page to process
            await queue.enqueue({
                searchId,
                target,
                query,
                page,
                linksQueue: remainingLinks,
                runId
            });
        } else if (target.strategy !== 'RSS' && page <= 20) {
            let nextConsecutiveZeroNewCount = consecutiveZeroNewCount;
            // If we processed links but none were successful, increment. Otherwise, reset if we had successes.
            // But wait, candidateLinks might be empty, which means no new links found on the page.
            if (candidateLinks.length === 0 || totalProcessed === 0) {
                 nextConsecutiveZeroNewCount++;
            } else {
                 nextConsecutiveZeroNewCount = 0;
            }

            if (nextConsecutiveZeroNewCount < 2) {
                await queue.enqueue({
                    searchId,
                    target,
                    query,
                    page: page + 1,
                    linksQueue: [],
                    runId,
                    consecutiveZeroNewCount: nextConsecutiveZeroNewCount
                });
            } else {
                logger.info(`[Scraper] Stopping pagination for ${target.name}. Found 2 consecutive pages with 0 new links.`);
                if (searchRef) {
                    await searchRef.update({
                        completedTargets: FieldValue.increment(1)
                    });
                }
                if (runId) {
                    await db.collection('ingestion_runs').doc(runId).update({
                        'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
                    });

                    const runDoc = await db.collection('ingestion_runs').doc(runId).get();
                    const runData = runDoc.data();
                    if (runData && runData.phases && runData.phases.internalFontes) {
                        if (runData.phases.internalFontes.targetsProcessed >= runData.phases.internalFontes.totalTargets) {
                            await db.collection('ingestion_runs').doc(runId).update({
                                'phases.internalFontes.status': 'COMPLETED'
                            });
                            await checkAndUpdateGlobalRunStatus(runId);
                        }
                    }
                }
            }
        } else if (remainingLinks.length === 0) {
            // No more links to process, and no next page to fetch (either RSS, reached end, or max pages)
            if (searchRef) {
                await searchRef.update({
                    completedTargets: FieldValue.increment(1)
                });
            }
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
                        await checkAndUpdateGlobalRunStatus(runId);
                    }
                }
            }
        }

        if (totalProcessed > 0) {
            if (searchRef) {
                await searchRef.update({
                    processedCount: FieldValue.increment(totalProcessed)
                });
            }
        }

    } catch (error: any) {
        console.error('Error during autonomous search target worker:', error);
        if (runId) {
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.internalFontes.errors': FieldValue.arrayUnion(`Target ${target.name} failed: ${error.message}`),
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
                    await checkAndUpdateGlobalRunStatus(runId);
                }
            }
        }
    }
});

export const onSearchCreated = onDocumentCreated({ document: 'searches/{searchId}' }, async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();
    const searchId = event.params.searchId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = data.targets as any[] || [];

    const db = getFirestore();
    const searchRef = db.collection('searches').doc(searchId);
    const queue = getFunctions().taskQueue('locations/us-central1/functions/processScrapingTargetWorker');

    try {

        for (const target of targets) {
            try {
                await queue.enqueue({
                    searchId,
                    target,
                    query: data.query
                });
                logger.info(`[startScrapingJobs] Successfully enqueued searchId ${searchId} for target strategy ${target.strategy}`);
            } catch (enqueueErr: any) {
                logger.error(`[startScrapingJobs] Failed to enqueue searchId ${searchId} for target strategy ${target.strategy}: ${enqueueErr.message}`, enqueueErr);
            }
        }


        await searchRef.update({
            status: 'running',
            message: 'Agente Autônomo enviado para execução em segundo plano.',
        });

    } catch (error) {
        console.error('Error enqueuing search tasks:', error);
        await searchRef.update({
            status: 'error',
            message: error instanceof Error ? error.message : 'Erro interno ao enfileirar tarefas de busca.',
        });
    }
});


async function renewProsasSessionInternal() {
    logger.info('[Prosas Session Internal] Starting session renewal...');
    const username = process.env.PROSAS_USERNAME;
    const password = process.env.PROSAS_PASSWORD;

    if (!username || !password) {
        logger.error('[Prosas Session Internal] Missing PROSAS_USERNAME or PROSAS_PASSWORD.');
        throw new Error('Missing PROSAS_USERNAME or PROSAS_PASSWORD.');
    }

    chromium.use(stealth());
    const browser = await chromium.launch({
        args: chromiumSparticuz.args,
        executablePath: await chromiumSparticuz.executablePath(),
        headless: true,
    });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        logger.info('[Prosas Session Internal] Navigating to login page...');
        await page.goto('https://prosas.com.br/users/sign_in', { waitUntil: 'networkidle' });

        logger.info('[Prosas Session Internal] Filling credentials...');
        await page.locator('#user_email').last().waitFor({ state: 'visible', timeout: 30000 });
        await page.locator('#user_email').last().fill(username);
        await page.locator('#user_password').last().fill(password);

        logger.info('[Prosas Session Internal] Submitting form...');
        await page.locator('input[type="submit"][name="commit"]').last().click();

        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);

        const outputFile = '/tmp/prosas_session.json';
        await context.storageState({ path: outputFile });

        logger.info('[Prosas Session Internal] Session extracted. Uploading to GCS...');

        const storage = getStorage();
        const bucket = storage.bucket('triade-prosas-session-state');
        await bucket.upload(outputFile, {
            destination: 'prosas_session.json',
            metadata: { contentType: 'application/json' }
        });

        logger.info('[Prosas Session Internal] Successfully uploaded session state to GCS.');

        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }
    } catch (error) {
        logger.error('[Prosas Session Internal] Failed to renew session:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

export const renewProsasSessionCron = onSchedule({
    schedule: '0 3 * * *',
    timeoutSeconds: 300,
    memory: '2GiB'
}, async (event) => {
    try {
        await renewProsasSessionInternal();
    } catch (error) {
        logger.error('[Prosas Session Cron] Cron execution failed:', error);
    }
});


export const unifiedIngestionWorker = onSchedule({
    schedule: '0 2 * * *',
    memory: '512MiB'
}, async () => {
    const runId = `RUN-CRON-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await executeUnifiedIngestion(runId);
});

export const triggerGlobalIngestion = onCall({
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'User must be an admin.');
    }

    const runId = `RUN-${new Date().toISOString().replace(/[:.]/g, '-')}`;

    // We await this synchronously, as dispatching Cloud Tasks is generally fast enough
    // and we must ensure the background execution context remains active in GCF.
    await executeUnifiedIngestion(runId);

    return { success: true, runId, message: "Ingestion loop completed" };
});

async function executeUnifiedIngestion(runId: string) {
    const db = getFirestore();
    const extractionQueue = getFunctions().taskQueue('locations/us-central1/functions/extractionWorker');
    const processScrapingTargetQueue = getFunctions().taskQueue('locations/us-central1/functions/processScrapingTargetWorker');
    const rssQueue = getFunctions().taskQueue('locations/us-central1/functions/rssWorker');

    await db.collection('ingestion_runs').doc(runId).set({
        id: runId,
        triggerSource: runId.includes('CRON') ? 'CRON' : 'MANUAL',
        startTime: FieldValue.serverTimestamp(),
        endTime: null,
        status: 'RUNNING',
        totalUrlsScanned: 0,
        totalValidEditaisFound: 0,
        totalErrors: 0,
        phases: {
            unified: { status: 'RUNNING', targetsProcessed: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: [] },
            prosas: { status: 'RUNNING', pagesScanned: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: [] },
            internalFontes: { status: 'RUNNING', targetsProcessed: 0, totalTargets: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: [] },
            rssAndQueries: { status: 'RUNNING', feedsProcessed: 0, urlsDiscovered: 0, newEditaisEnqueued: 0, errors: [] }
        }
    });

    const targetsSnap = await db.collection('scraping_targets').get();

    logger.info(`[Orchestrator] Fetched ${targetsSnap.docs.length} total targets from scraping_targets collection.`);

    let enqueuedTotal = 0;
    let urlsDiscovered = 0;
    let hasRssTargets = false;

    // Target counters for logging
    let prosasTargetsCount = 0;
    let autoTargetsCount = 0;
    let rssTargetsCount = 0;
    let vertexTargetsCount = 0;
    let braveTargetsCount = 0;

    for (const doc of targetsSnap.docs) {
        const target = { id: doc.id, ...doc.data() } as any;

        let strategy: IScraperStrategy | null = null;

        logger.info(`[Orchestrator] Evaluating target: ${target.name} (strategy: ${target.strategy})`);

        if (target.strategy === 'PROSAS') {
            prosasTargetsCount++;
            strategy = new ProsasScraper();
            logger.info(`[Orchestrator] Assigned PROSAS strategy for ${target.name}.`);
        } else if (target.strategy === 'VERTEX' && target.query) {
            vertexTargetsCount++;
            strategy = new VertexAIScraper(target.query);
            logger.info(`[Orchestrator] Assigned VERTEX strategy for ${target.name}.`);
        } else if (target.strategy === 'BRAVE' && target.query) {
            braveTargetsCount++;
            strategy = new BraveScraper(target.query);
            logger.info(`[Orchestrator] Assigned BRAVE strategy for ${target.name}.`);
        } else if (target.strategy === 'AUTO') {
             autoTargetsCount++;
             logger.info(`[Orchestrator] Dispatching AUTO target to background worker: ${target.name}.`);
             await safeEnqueueTasks(
                 'locations/us-central1/functions/processScrapingTargetWorker',
                 [{
                     searchId: 'GLOBAL_RUN',
                     target: target,
                     query: '',
                     runId
                 }],
                 (data) => `auto_${data.runId}_${data.target.id}`
             );
             continue;
        } else if (target.strategy === 'RSS') {
             rssTargetsCount++;
             hasRssTargets = true;
             logger.info(`[Orchestrator] Dispatching RSS target to background worker: ${target.name}.`);
             await safeEnqueueTasks(
                 'locations/us-central1/functions/rssWorker',
                 [{ runId }],
                 (data) => `rss_${data.runId}`
             );
             continue;
        }

        if (!strategy) {
            logger.warn(`[Orchestrator] No valid strategy matched for target ${target.name} (strategy field: ${target.strategy}). Skipping.`);
            continue;
        }

        try {
            logger.info(`[Orchestrator] Processing target ${target.name} with strategy ${target.strategy}`);
            const rawItems = await strategy.fetchDelta();

            logger.info(`[Orchestrator] Target ${target.name} fetchDelta() returned ${rawItems.length} items.`);
            if (rawItems.length === 0) {
                logger.warn(`[Orchestrator] Skipping further processing for ${target.name} because fetchDelta returned 0 URLs.`);
            }

            urlsDiscovered += rawItems.length;
            let enqueuedCount = 0;

            for (const item of rawItems) {
                const extracted = await strategy.extractRaw(item);

                // Save raw payload to a temp collection to avoid task payload limits
                const tempContentRef = db.collection('scraping_contents').doc();
                const expireAt = new Date();
                expireAt.setHours(expireAt.getHours() + 24);

                await tempContentRef.set({
                    url: extracted.url,
                    text: extracted.snippet || '',
                    rawPayload: extracted.rawPayload,
                    externalProviderId: extracted.externalProviderId,
                    title: extracted.title,
                    discoverySource: target.strategy,
                    createdAt: FieldValue.serverTimestamp(),
                    expireAt: expireAt
                });

                if (extracted.url.toLowerCase().includes('prosas.com.br')) {
                    logger.info(`[Orchestrator] Routing Prosas link to authenticated worker: ${extracted.url}`);
                    await safeEnqueueTasks(
                        'locations/us-central1/functions/prosasAuthenticatedWorker',
                        [{
                            url: extracted.url,
                            searchId: runId
                        }],
                        (data) => `prosas_${data.searchId}_${data.url.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50)}`
                    );
                } else {
                    await safeEnqueueTasks(
                        'locations/us-central1/functions/extractionWorker',
                        [{
                            searchId: runId,
                            link: extracted.url,
                            contentId: tempContentRef.id,
                            reason: `Found by ${target.strategy}`,
                            discoverySource: target.strategy
                        }],
                        (data) => `extract_${data.searchId}_${data.contentId}`
                    );
                }
                enqueuedCount++;
                enqueuedTotal++;
            }

            if (enqueuedCount > 0) {
                // Update watermark ONLY when tasks are successfully dispatched
                await db.collection('scraper_state').doc((strategy as any).stateDocId).set({
                    lastSuccessfulScrapeTimestamp: new Date().toISOString()
                }, { merge: true });
            }
        } catch (error: any) {
            logger.error(`Error processing target ${doc.id}:`, error);
            await db.collection('ingestion_runs').doc(runId).update({
                'phases.unified.errors': FieldValue.arrayUnion(`Target ${target.name} failed: ${error.message}`)
            });
        }
    }

    const finalUpdate: any = {
        'phases.unified.status': 'COMPLETED',
        'phases.unified.urlsDiscovered': urlsDiscovered,
        'phases.unified.newEditaisEnqueued': enqueuedTotal,
        'phases.prosas.status': 'COMPLETED',
        'phases.internalFontes.status': 'COMPLETED',
    };

    logger.info(`[Orchestrator] Target breakdown summary: PROSAS=${prosasTargetsCount}, AUTO=${autoTargetsCount}, RSS=${rssTargetsCount}, VERTEX=${vertexTargetsCount}, BRAVE=${braveTargetsCount}`);

    if (prosasTargetsCount === 0) {
        logger.warn(`[Orchestrator] Explicit Warning: Skipping Prosas because 0 targets were found in DB.`);
    }

    if (rssTargetsCount === 0) {
        logger.warn(`[Orchestrator] Explicit Warning: Skipping RSS because 0 targets were found in DB.`);
    }

    if (!hasRssTargets) {
        finalUpdate['phases.rssAndQueries.status'] = 'COMPLETED';
    }

    await db.collection('ingestion_runs').doc(runId).update(finalUpdate);

    // We don't mark the whole run as COMPLETED synchronously here because processScrapingTargetQueue and rssQueue are async.
    // The legacy `checkAndUpdateGlobalRunStatus` function expects all phases to be evaluated.
    // However, the unified phase is now complete. We will trigger the checker to see if everything else is done too.
    await checkAndUpdateGlobalRunStatus(runId);
}

export const rssWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 1,
        minBackoffSeconds: 60,
    },
    rateLimits: {
        maxConcurrentDispatches: 1,
    },
    memory: '2GiB',
    timeoutSeconds: 540
}, async (request) => {
    const runId = request.data.runId;
    const db = getFirestore();

    try {
        console.log(`[RSS Worker] Starting Phase for run ${runId}`);

        const rssResult = await processRssFeeds(runId);

        if (runId) {
            const totalDiscovered = (rssResult?.processedCount || 0);
            const totalEnqueued = (rssResult?.savedCount || 0);

            const rssMetrics = rssResult?.metrics || { heuristicRejects: 0, aiRejects: 0, cacheHits: 0, aiApprovals: 0, prosasLinks: 0, errorCount: 0 };

            await db.collection('ingestion_runs').doc(runId).update({
                'phases.rssAndQueries.status': 'COMPLETED',
                'phases.rssAndQueries.urlsDiscovered': FieldValue.increment(totalDiscovered),
                'phases.rssAndQueries.newEditaisEnqueued': FieldValue.increment(totalEnqueued),
                'phases.rssAndQueries.metrics.heuristicRejects': FieldValue.increment(rssMetrics.heuristicRejects),
                'phases.rssAndQueries.metrics.aiRejects': FieldValue.increment(rssMetrics.aiRejects),
                'phases.rssAndQueries.metrics.cacheHits': FieldValue.increment(rssMetrics.cacheHits),
                'phases.rssAndQueries.metrics.aiApprovals': FieldValue.increment(rssMetrics.aiApprovals),
                'phases.rssAndQueries.metrics.prosasLinks': FieldValue.increment(rssMetrics.prosasLinks),
                'phases.rssAndQueries.metrics.errors': FieldValue.increment(rssMetrics.errorCount),
                'totalUrlsScanned': FieldValue.increment(totalDiscovered),
                'totalValidEditaisFound': FieldValue.increment(totalEnqueued)
            });
            await checkAndUpdateGlobalRunStatus(runId);
        }
    } catch (e: any) {
        console.error(`[RSS Worker] Failed for run ${runId}:`, e);
        if (runId) {
             await db.collection('ingestion_runs').doc(runId).update({
                 'phases.rssAndQueries.status': 'FAILED',
                 'phases.rssAndQueries.errors': FieldValue.arrayUnion(`Worker failed: ${e.message}`)
             });
             await checkAndUpdateGlobalRunStatus(runId);
        }
    }
});


export const scheduledIngestionTimeoutSweeper = onSchedule({
    schedule: '*/30 * * * *',
    memory: '1GiB'
}, async () => {
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
            console.log(`Timeout Sweeper: Marking run ${doc.id} as TIMEOUT`);

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
export const cronDeactivateExpiredEditais = onSchedule({
    schedule: 'every day 00:00',
    timeZone: 'America/Sao_Paulo',
    retryCount: 3,
    memory: '512MiB'
}, async (event) => {
    const db = getFirestore();
    const currentDate = new Date().toISOString().split('T')[0]!;

    console.log(`[cronDeactivateExpiredEditais] Running grim reaper job for date: ${currentDate}`);

    try {
        const expiredEditaisSnapshot = await db.collection('editais')
            .where('ativo', '==', true)
            .where('deadline', '<', currentDate)
            .get();

        if (expiredEditaisSnapshot.empty) {
            console.log(`[cronDeactivateExpiredEditais] No expired editais found.`);
            return;
        }

        console.log(`[cronDeactivateExpiredEditais] Found ${expiredEditaisSnapshot.docs.length} expired editais. Deactivating...`);

        let batch = db.batch();
        let operationsCount = 0;

        for (const doc of expiredEditaisSnapshot.docs) {
            batch.update(doc.ref, {
                ativo: false,
                updatedAt: FieldValue.serverTimestamp()
            });
            operationsCount++;

            // Firestore batch limit is 500
            if (operationsCount === 500) {
                await batch.commit();
                batch = db.batch();
                operationsCount = 0;
            }
        }

        if (operationsCount > 0) {
            await batch.commit();
        }

        console.log(`[cronDeactivateExpiredEditais] Successfully deactivated all expired editais.`);
    } catch (error) {
        console.error(`[cronDeactivateExpiredEditais] Error during execution:`, error);
    }
});


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
        const oscText = `Missão/Descrição: ${oscData.mission || 'Não especificada'}. Foco: ${(Array.isArray(oscData.coreActivities) ? oscData.coreActivities.join(', ') : 'Não especificadas')}. Nome: ${oscData.name || ''}`;
        const embedding = await generateTextEmbedding(oscText);
        oscEmbedding = FieldValue.vector(embedding);
        await oscRef.withConverter(oscConverter).update({ embedding: oscEmbedding });
    }

    const vectorQuery = Array.isArray(oscEmbedding) ? FieldValue.vector(oscEmbedding) : oscEmbedding;

    // Fetch top matching editais using centralized vector search fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validInternalMatches = await findTopVectorMatches(
        'editais',
        vectorQuery,
        0.25,
        15,
        db,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (q: any) => q.where('ativo', '==', true)
    );

    const jobRef = db.collection('system_jobs').doc();
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
        status: 'running', // Changed from running so we can update it to completed after dispatch
        matchesTriggered: validInternalMatches.length,
        matchesEvaluated: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });

    // Generate fresh matches decoupled using matchEvaluatorWorker
    const matchTasks = validInternalMatches.map((match: any) => ({
        oscId: targetId,
        editalId: match.id,
        jobId: jobId
    }));

    await safeEnqueueTasks(
        'locations/us-central1/functions/matchEvaluatorWorker',
        matchTasks,
        (data) => `eval_trigger_${data.jobId}_${data.oscId}_${data.editalId}`
    );


    // Resolve race condition where evaluations finish before job dispatch is complete
    const finalJobDoc = await jobRef.get();
    const finalJobData = finalJobDoc.data();
    if (finalJobData && finalJobData.matchesEvaluated >= validInternalMatches.length) {
        await jobRef.update({
            status: 'completed',
            evaluationsCompleted: true,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    return { success: true, jobId, message: `${validInternalMatches.length} novas oportunidades enfileiradas para avaliação.` };
});

export { triggerReverseMatch } from './services/reverseMatchmaker.js';


export const scheduleAgenticSearchCron = onSchedule({
    schedule: "0 * * * *", // Run every hour
    timeZone: "America/Sao_Paulo",
    timeoutSeconds: 300,
    memory: '1GiB'
}, async (event) => {
    logger.info("Executing slow-burn Agentic Search CRON...");
    const db = getFirestore();
    const queue = getFunctions().taskQueue('locations/us-central1/functions/agenticSearchWorker');

    try {
        // Find OSCs that have never been searched, or haven't been searched recently
        // Limit to 5 to prevent Vertex/LLM rate limit spikes
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Note: For this to work on brand new OSCs, the ingestion script MUST set lastSearchAt: admin.firestore.Timestamp.fromMillis(0)
        const oscsSnapshot = await db.collection('oscs')
            .where('lastSearchAt', '<', yesterday)
            .orderBy('lastSearchAt', 'asc')
            .limit(5)
            .get();

        if (oscsSnapshot.empty) {
            logger.info("No OSCs require agentic search at this time.");
            return;
        }

        let enqueued = 0;
        for (const doc of oscsSnapshot.docs) {
             const oscId = doc.id;
             // Update timestamp immediately so we don't fetch it again on the next tick if the task gets delayed
             await doc.ref.update({ lastSearchAt: FieldValue.serverTimestamp() });

             await queue.enqueue({
                 oscId: oscId,
                 jobId: `cron_${oscId}_${Date.now()}`
             });
             enqueued++;
        }

        logger.info(`Successfully enqueued ${enqueued} OSCs for slow-burn Agentic Search.`);
    } catch (e) {
        logger.error("Error during slow-burn Agentic Search CRON:", e);
    }
});


export const migrateOscVectors = onCall({
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    // Require auth
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Admin access required.');
    }

    // We will do a limited batch of 50 per call, caller can invoke this multiple times.
    let migratedCount = 0;
    const { startAfterId } = request.data as { startAfterId?: string };

    try {
        let query = db.collection('oscs').orderBy(FieldPath.documentId());
        if (startAfterId) {
             query = query.startAfter(startAfterId);
        }
        const oscsSnapshot = await query.limit(50).get();
        const lastDoc = oscsSnapshot.docs[oscsSnapshot.docs.length - 1];
        const nextStartAfterId = lastDoc ? lastDoc.id : null;


        const promises = oscsSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            let needsUpdate = false;
            let updatePayload: any = {};

            // Fix: set a default lastSearchAt if it doesn't exist to allow the CRON to pick it up
            if (!data.lastSearchAt) {
                updatePayload.lastSearchAt = new Date(0);
                needsUpdate = true;
            }

            if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
                 // Fast path: Just convert the existing array to a FieldValue.vector to save costs
                 updatePayload.embedding = FieldValue.vector(data.embedding);
                 needsUpdate = true;
                 migratedCount++;
            } else if (!data.embedding) {
                // Only generate if it's truly missing
                try {
                     const oscText = `Missão: ${data.mission || ''}. Foco: ${(data.coreActivities || []).join(', ')}. Nome: ${data.name || ''}`;
                     const embeddingArray = await generateTextEmbedding(oscText);
                     if (embeddingArray) {
                         updatePayload.embedding = FieldValue.vector(embeddingArray);
                         needsUpdate = true;
                         migratedCount++;
                     }
                } catch (e) {
                     logger.error(`Failed to generate vector for OSC ${doc.id}`, e);
                }
            }

            if (needsUpdate) {
                // Mark as migrated only if we successfully updated something or didn't need to generate a new one
                updatePayload.vectorMigrated = true;
                await doc.ref.update(updatePayload);
            }
        });

        await Promise.all(promises);

        return { success: true, migratedCount, nextStartAfterId };
    } catch (e) {
        logger.error("Migration failed:", e);
        throw new HttpsError('internal', 'Vector migration failed.');
    }
});

const prosasSecret = defineSecret('PROSAS_WEBHOOK_SECRET');

export const ingestProsasNewsletterWebhook = onRequest({
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: [prosasSecret]
}, async (request, response) => {
    if (request.method !== 'POST') {
        response.status(405).send('Method Not Allowed');
        return;
    }

    const secret = request.get('x-prosas-webhook-secret');
    const expectedSecret = prosasSecret.value();
    if (!expectedSecret || secret !== expectedSecret) {
        logger.warn('[Prosas Webhook] Unauthorized attempt.');
        response.status(403).send('Forbidden');
        return;
    }

    const html = request.body.html || request.body;
    if (!html || typeof html !== 'string') {
        response.status(400).send('Bad Request: Missing or invalid HTML payload.');
        return;
    }

    try {
        const $ = cheerio.load(html);
        const urls = new Set<string>();

        const linkObjects: {text: string, href: string}[] = [];
        $('a').each((i, el) => {
            const text = $(el).text().toLowerCase();
            const href = $(el).attr('href');
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                linkObjects.push({ text, href });
            }
        });

        logger.info(`[Prosas Webhook] Initially extracted link objects: ${JSON.stringify(linkObjects)}`);

        for (const { text, href } of linkObjects) {
            // Heuristic to find edital links
            if (text.includes('edital') || text.includes('conheça') || text.includes('saiba mais') || text.includes('inscreva-se')) {
                // Dispatch raw tracking links (t.rdsv2.net) or direct prosas links
                if (href.includes('t.rdsv2.net') || href.includes('prosas.com.br')) {
                    urls.add(href);
                } else {
                    logger.info(`[Prosas Webhook] Ignored URL: ${href}`);
                }
            }
        }

        logger.info(`[Prosas Webhook] Found ${urls.size} potential edital URLs.`);
        logger.info(`[Prosas Webhook] Final resolved URLs to dispatch: ${Array.from(urls).join(', ')}`);

        const results = [];
        const queue = getFunctions().taskQueue('locations/us-central1/functions/prosasAuthenticatedWorker');

        for (const url of Array.from(urls)) {
            logger.info(`[Prosas Webhook] Processing URL: ${url}`);
            try {
                // Dispatch directly to prosasAuthenticatedWorker to bypass the login wall and avoid sending raw HTML/URLs to Gemini
                await queue.enqueue({ url, searchId: "PROSAS_NEWSLETTER" });
                results.push({ url, status: 'enqueued_to_prosas_worker' });
            } catch (error) {
                logger.error(`[Prosas Webhook] Error enqueueing ${url}:`, error);
                results.push({ url, status: 'error', error: error instanceof Error ? error.message : String(error) });
            }
        }

        response.status(200).json({ success: true, processed: results.length, results });
    } catch (error) {
        logger.error('[Prosas Webhook] Fatal error:', error);
        response.status(500).send('Internal Server Error');
    }
});

export const editalVectorSearchWorker = onTaskDispatched({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 60,
    },
    rateLimits: {
        maxConcurrentDispatches: 2,
    },
    memory: '1GiB',
    timeoutSeconds: 540,
}, async (request) => {
    const { editalIds, jobId } = request.data as { editalIds: string[], jobId: string };

    if (!jobId || !editalIds || !Array.isArray(editalIds) || editalIds.length === 0) {
        logger.error('Invalid payload. editalIds and jobId are required.');
        return;
    }

    logger.info(`[editalVectorSearchWorker] Starting job ${jobId} with ${editalIds.length} editais.`);

    const db = getFirestore();
    const jobRef = db.collection('system_jobs').doc(jobId);

    try {
        const jobDoc = await jobRef.get();
        if (jobDoc.exists && jobDoc.data()?.status !== 'running') {
            logger.info(`Job ${jobId} is not in running state. Skipping.`);
            return;
        }

        let totalMatchesTriggered = 0;

        for (const editalId of editalIds) {
            logger.info(`[editalVectorSearchWorker] Processing edital ${editalId}`);

            // Idempotency check: prevent duplicate processing if task is retried
            const processedKey = `processed_${editalId}`;
            if (jobDoc.exists && jobDoc.data()?.[processedKey] === true) {
                logger.info(`[editalVectorSearchWorker] Edital ${editalId} already processed for job ${jobId}. Skipping.`);
                continue;
            }

            const editalDoc = await db.collection('editais').doc(editalId).get();
            if (!editalDoc.exists) {
                logger.info(`[editalVectorSearchWorker] Edital ${editalId} does not exist in DB. Skipping.`);
                continue;
            }

            const editalData = editalDoc.data()!;
            let editalEmbedding = editalData.embedding;

            if (!editalEmbedding) {
                const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${(editalData.eligibilityCriteria?.allowedActivities || []).join(', ')}.`;
                try {
                    const { genkit } = await import('genkit');
                    const { vertexAI } = await import('@genkit-ai/google-genai');
                    const ai = genkit({
                        plugins: [vertexAI({ location: 'us-central1' })],
                    });
                    const response = await ai.embed({
                        embedder: 'vertexai/text-embedding-004',
                        content: editalText.substring(0, 5000)
                    });
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const embeddingArray = response.map((e: any) => e.embedding)[0];
                    if (embeddingArray) {
                        editalEmbedding = FieldValue.vector(embeddingArray);
                        await db.collection('editais').doc(editalId).update({ embedding: editalEmbedding });
                    }
                } catch (e) {
                    logger.error(`[editalVectorSearchWorker] Failed to generate embedding for Edital ${editalId}:`, e);

                    continue;
                }
            }

            if (!editalEmbedding) {
                logger.info(`[editalVectorSearchWorker] No embedding available for edital ${editalId}. Skipping.`);
                continue;
            }

            const vectorQuery = Array.isArray(editalEmbedding) ? FieldValue.vector(editalEmbedding) : editalEmbedding;

            logger.info(`[editalVectorSearchWorker] Executing vector search for edital ${editalId}...`);

            const validCandidates = await findTopVectorMatches('oscs', vectorQuery, 0.25, 100, db);

            logger.info(`[editalVectorSearchWorker] Filtered down to ${validCandidates.length} valid OSC candidates (similarity >= 0.25) for edital ${editalId}`);

            const tasksPayload = validCandidates.map(osc => ({
                oscId: osc.id,
                editalId: editalId,
                jobId: jobId
            }));

            await safeEnqueueTasks(
                'locations/us-central1/functions/matchEvaluatorWorker',
                tasksPayload,
                (data) => `eval_${data.jobId}_${data.oscId}_${data.editalId}`
            );

            logger.info(`[editalVectorSearchWorker] Successfully enqueued ${validCandidates.length} matchEvaluatorWorker tasks for edital ${editalId}`);

            totalMatchesTriggered += validCandidates.length;

            await jobRef.update({
                editaisProcessed: FieldValue.increment(1),
                matchesTriggered: FieldValue.increment(validCandidates.length),
                [processedKey]: true,
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        // Only mark as completed here if no matches were found overall.
        // Otherwise, matchEvaluatorWorker will mark it completed.
        if (totalMatchesTriggered === 0) {
            await jobRef.update({
                status: 'completed',
                searchCompleted: true,
                evaluationsCompleted: true,
                updatedAt: FieldValue.serverTimestamp()
            });
        } else {
            await jobRef.update({
                searchCompleted: true,
                updatedAt: FieldValue.serverTimestamp()
            });

            // Resolve race condition where evaluations finish before job dispatch is complete
            const finalJobDoc = await jobRef.get();
            const finalJobData = finalJobDoc.data();
            if (finalJobData && finalJobData.matchesEvaluated >= finalJobData.matchesTriggered) {
                await jobRef.update({
                    status: 'completed',
                    evaluationsCompleted: true,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }
        }

    } catch (error: unknown) {
        logger.error(`Error in editalVectorSearchWorker for job ${jobId}:`, error);
        await jobRef.update({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            updatedAt: FieldValue.serverTimestamp()
        }).catch(e => logger.error('Failed to update job status on error:', e));
    }
});
