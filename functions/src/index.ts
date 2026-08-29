process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright-extra';
const pdfParse = require('pdf-parse');
import stealth from 'puppeteer-extra-plugin-stealth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFunctions } from 'firebase-admin/functions';
import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';
import { genkit } from 'genkit';
import { z } from 'zod';
import { vertexAI } from '@genkit-ai/google-genai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import * as logger from 'firebase-functions/logger';
import { ngoProfileSchema, editalSchema, matchSchema, triageSchema, copilotResponseSchema } from './shared/schemas.js';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';

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
            await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, i))); // Exponential backoff
        }
    }
    throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

admin.initializeApp();

const ai = genkit({
    plugins: [vertexAI({ projectId: process.env.GCLOUD_PROJECT || 'triade-assessoria', location: 'us-central1' })],
});

const parsePdfToProfile = ai.defineFlow(
    {
        name: 'parsePdfToProfile',
        inputSchema: z.object({
            pdfBase64s: z.array(z.string()).describe("Arquivos PDF codificados em Base64"),
        }),
        outputSchema: ngoProfileSchema,
    },
    async (input) => {
        const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social, Cartão CNPJ e/ou ATA de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Você DEVE extrair o CNPJ, Nome (Legal Name), Missão/Foco de atuação (do Estatuto) e a Validade da Diretoria (da ATA).
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: [
                    { text: prompt },
                    ...input.pdfBase64s.map(pdf => ({ media: { url: `data:application/pdf;base64,${pdf}` } }))
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
Forneça um 'aiSummary' (um resumo de 1-2 frases destacando os pontos fortes ou fracos).
Forneça um 'badges' (2 a 3 tags curtas que categorizam o match, ex: 'Alta Aderência', 'Desafio Financeiro', 'Foco Regional').
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
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    return await parsePdfToProfile({ pdfBase64s: request.data.pdfBase64 ? [request.data.pdfBase64] : request.data.pdfBase64s || [] });
});

const selectEditalLinksFlow = ai.defineFlow(
    {
        name: 'selectEditalLinksFlow',
        inputSchema: z.object({
            links: z.array(z.string()).describe("Lista de URLs pré-filtradas"),
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

Preste MUITA ATENÇÃO à "Abrangência" (Geographic Reach) do edital. Se um edital tiver abrangência Nacional ou cobrir a região Nordeste, você DEVE sinalizá-lo como válido para OSCs locais (ex: incluindo 'PB', 'Nordeste' ou 'Nacional' em requiredLocations), IGNORANDO COMPLETAMENTE o endereço físico ou sede da instituição financiadora. O que importa é onde o projeto pode ser executado.

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
            prompt += `\nIMPORTANTE (FILTRO ESTRITO): O operador especificou uma consulta de busca: "${input.searchQuery}". O edital DEVE ser estritamente relacionado a este tema. Se não for, marque isValidEdital = false e justifique.`;
        }

        prompt += `\nResponda com isValidEdital = true se for um edital, landing page ou anúncio oficial de grant E (se houver consulta) se alinhar perfeitamente com a consulta.
Justifique sua resposta na 'reason'.
Sempre retorne os dados em português do Brasil (pt-BR).`;

        const response = await ai.generate({
            model: 'vertexai/gemini-2.5-flash',
            messages: [
                { role: 'user', content: [
                    { text: prompt },
                    { text: `Texto:\n\n${input.text.substring(0, 30000)}` }
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


async function fetchAndExtractText(url: string): Promise<string> {
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
    } catch (e) {
        console.error("Error fetching text from URL", url, e);
        return "";
    }
}


export const extractEditalRulesFunction = onCall({
    cors: true
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    return await extractEditalRules(request.data);
});



import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';



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
- Gere 7 queries diversas explorando o local, estado, região, área de atuação e recortes demográficos/temáticos da ONG.
- OBRIGATORIAMENTE, em pelo menos 2 das 7 queries, use explicitamente o operador "site:" para focar em domínios governamentais ou institucionais. (ex: site:gov.br edital cultura ${currentYear}).

Perfil da ONG:
Nome: ${input.osc.name}
Localização: ${input.osc.location}
Atividades Principais: ${input.osc.coreActivities.join(', ')}
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


function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0; let normA = 0; let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
        normA += (vecA[i] || 0) * (vecA[i] || 0);
        normB += (vecB[i] || 0) * (vecB[i] || 0);
    }
    return (normA === 0 || normB === 0) ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

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

    // Vector Pre-filtering
    let oscEmbedding = rawOscData?.embedding || null;
    let editalEmbedding = rawEditalData?.embedding || null;

    if (!oscEmbedding) {
        console.log(`Generating missing embedding for OSC ${oscId}`);
        const oscText = `Missão: ${oscData.mission || ''}. Foco: ${oscData.coreActivities?.join(', ') || ''}. Nome: ${oscData.name || ''}`;
        oscEmbedding = await generateTextEmbedding(oscText);
        await db.collection('oscs').doc(oscId).update({ embedding: oscEmbedding });
        oscData.embedding = oscEmbedding;
    }

    if (!editalEmbedding) {
        console.log(`Generating missing embedding for Edital ${editalId}`);
        const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${editalData.eligibilityCriteria.allowedActivities?.join(', ') || ''}.`;
        editalEmbedding = await generateTextEmbedding(editalText);
        await db.collection('editais').doc(editalId).update({ embedding: editalEmbedding });
        editalData.embedding = editalEmbedding;
    }

    const similarityScore = cosineSimilarity(oscEmbedding, editalEmbedding);
    console.log(`Vector similarity score for OSC ${oscId} and Edital ${editalId}: ${similarityScore}`);

    let matchResult: unknown;

    if (similarityScore < 0.60) {
        console.log(`Skipping LLM evaluation due to low vector similarity: ${similarityScore}`);
        matchResult = {
            matchScore: Math.round(similarityScore * 100),
            reasoning: 'Match descartado na pré-filtragem por similaridade vetorial (Cosine Similarity < 0.60).',
            eligibility: false
        };
    } else {
        matchResult = await scoreMatch({
            osc: oscData,
            edital: editalData,
            oscId: oscId,
            editalId: editalId
        });
    }


    const matchRef = existingMatchRef || db.collection('matches').doc();
    const matchDocData = {
        ...(matchResult as object),
        id: matchRef.id,
        oscName: oscData.name,
        createdAt: FieldValue.serverTimestamp()
    };

    await matchRef.set(matchDocData, { merge: true });
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
    memory: '4GiB'
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

        const rawOscData = oscDoc.data();
        const parseResult = ngoProfileSchema.safeParse(rawOscData);
        if (!parseResult.success) {
            console.warn(`Invalid OSC data for ${oscId}`);
            if (jobRef) await jobRef.update({ status: 'failed', error: 'Dados da OSC inválidos.', updatedAt: FieldValue.serverTimestamp() });
            return;
        }

        const oscData = parseResult.data;
        let oscEmbedding = rawOscData?.embedding || null;
        if (!oscEmbedding) {
            const oscText = `Missão: ${oscData.mission || ''}. Foco: ${oscData.coreActivities?.join(', ') || ''}. Nome: ${oscData.name || ''}`;
            oscEmbedding = await generateTextEmbedding(oscText);
            await db.collection('oscs').doc(oscId).update({ embedding: oscEmbedding });
        }

        const { queries } = await generateSearchQueries({ osc: oscData });
        console.log(`Generated queries for OSC ${oscId}:`, queries);

        if (jobRef) {
            await jobRef.update({
                'progress.queriesGenerated': queries.length,
                status: 'scraping_web',
                logs: FieldValue.arrayUnion(`Geradas ${queries.length} queries. Iniciando busca na web...`),
                updatedAt: FieldValue.serverTimestamp()
            });
        }

        const searchedLinks = new Set<string>();
        let totalLinksFound = 0;
        let totalLinksEvaluated = 0;
        let totalValidEditaisEnqueued = 0;

        for (const query of queries) {
            try {
                if (jobRef) {
                    await jobRef.update({
                        logs: FieldValue.arrayUnion(`Buscando: "${query}"...`),
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }

                let allSearchResults: { link: string, title: string, snippet: string }[] = [];
                let googleSearchFailed = false;

                // Try Primary Search: Google Vertex AI Search
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
                    try {
                        console.log(`[Agentic Search] Executing Vertex AI Search for query: "${query}"`);

                        const auth = new GoogleAuth({
                            scopes: 'https://www.googleapis.com/auth/cloud-platform'
                        });
                        const client = await auth.getClient();
                        const accessToken = await client.getAccessToken();

                        const vertexUrl = `https://discoveryengine.googleapis.com/v1/projects/${vertexProjectId}/locations/${vertexLocation}/collections/default_collection/engines/${vertexEngineId}/servingConfigs/default_search:search`;

                        const vertexResponse = await fetch(vertexUrl, {
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

                        if (!vertexResponse.ok) {
                            console.warn(`Vertex AI Search API failed with status: ${vertexResponse.status}`);
                            googleSearchFailed = true;
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

                                    allSearchResults.push({
                                        link: derivedStructData.link,
                                        title: derivedStructData.title || '',
                                        snippet: snippet
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`[Agentic Search] Exception during Vertex AI Search:`, e);
                        googleSearchFailed = true;
                    }
                } else {
                    console.warn(`[Agentic Search] Missing Vertex AI Search credentials. Falling back to Brave Search.`);
                    googleSearchFailed = true;
                }

                // Secondary Fallback: Brave Search API
                if (googleSearchFailed || allSearchResults.length === 0) {
                    allSearchResults = []; // Clear any partial results from Google

                    let braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
                    if (!braveApiKey) {
                        try { braveApiKey = braveApiKeyString.value(); } catch (e) { /* ignore */ }
                    }

                    if (!braveApiKey) {
                        throw new Error("BRAVE_SEARCH_API_KEY environment variable is not set.");
                    }

                    const maskedKey = braveApiKey.length > 8 ? `${braveApiKey.substring(0, 4)}***${braveApiKey.substring(braveApiKey.length - 4)}` : '***';
                    console.log(`[Agentic Search] Falling back to Brave API Key (length: ${braveApiKey.length}): ${maskedKey}`);

                    // Pagination loop for 2 pages (offset 0 and 1)
                    for (let offset = 0; offset <= 1; offset++) {
                        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&offset=${offset}`;
                        const searchResponse = await fetch(url, {
                            headers: {
                                'Accept': 'application/json',
                                'Accept-Encoding': 'gzip',
                                'X-Subscription-Token': braveApiKey
                            }
                        });

                        if (!searchResponse.ok) {
                            console.warn(`Brave Search API request failed for page ${offset} with status: ${searchResponse.status}`);
                            continue; // Try next page if one fails
                        }

                        const braveData = await searchResponse.json() as any;
                        const results = braveData.web?.results || [];
                        for (const r of results) {
                            if (r.url) {
                                allSearchResults.push({
                                    link: r.url,
                                    title: r.title || '',
                                    snippet: r.description || ''
                                });
                            }
                        }
                    }
                }

                let processedResults = 0;
                let batchLinksFound = 0;
                let batchLinksEvaluated = 0;
                let batchValidEditaisEnqueued = 0;
                let hasUpdatedStatus = false;

                // Process in chunks of 5 to control concurrency
                const chunkSize = 5;
                for (let i = 0; i < allSearchResults.length; i += chunkSize) {
                    const chunk = allSearchResults.slice(i, i + chunkSize);

                    await Promise.all(chunk.map(async (r) => {
                        // Limit to 40 items total across both pages
                        if (processedResults >= 40) return;
                        processedResults++;

                        const link = r.link;
                        if (!link || searchedLinks.has(link)) return;
                        searchedLinks.add(link);
                        batchLinksFound++;

                        const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
                        if (!existingRef.empty) return;

                        batchLinksEvaluated++;

                        const cleanJsonSnippet = JSON.stringify({
                            title: r.title,
                            url: r.link,
                            snippet: r.snippet
                        });

                        const textEmbedding = await generateTextEmbedding(cleanJsonSnippet);
                        const similarityScore = cosineSimilarity(oscEmbedding, textEmbedding);
                        console.log(`Vector similarity for ${link} (Snippet) is ${similarityScore}`);

                        // Use snippet as a very loose pre-filter (e.g. > 0.30 instead of 0.60)
                        if (similarityScore > 0.30) {
                            console.log(`Fetching full content for promising link: ${link}`);
                            let fullTextToAnalyze = cleanJsonSnippet;

                            try {
                                const fetchedText = await fetchAndExtractText(link);
                                if (fetchedText && fetchedText.length >= 500) {
                                    fullTextToAnalyze = fetchedText;
                                }
                            } catch (fetchErr) {
                                console.warn(`Failed to fetch full text for ${link}, falling back to snippet`, fetchErr);
                            }

                            if (jobRef && !hasUpdatedStatus) { // Update status to scoring on the first valid link of the batch
                                 hasUpdatedStatus = true;
                                 await jobRef.update({ status: 'scoring_triage', updatedAt: FieldValue.serverTimestamp() });
                            }

                            const triageResult = await triageEditalWebpage({ text: fullTextToAnalyze, searchQuery: query });
                            if (triageResult.isValidEdital) {
                                await enqueueEditalExtraction(link, fullTextToAnalyze, triageResult.reason, oscId);
                                console.log(`Successfully enqueued agentic extraction for ${link}`);
                                batchValidEditaisEnqueued++;
                            }
                        }
                    }));
                }

                totalLinksFound += batchLinksFound;
                totalLinksEvaluated += batchLinksEvaluated;
                totalValidEditaisEnqueued += batchValidEditaisEnqueued;

                // Debounce progress updates after each query
                if (jobRef) {
                    await jobRef.update({
                        'progress.linksFound': totalLinksFound,
                        'progress.linksEvaluated': totalLinksEvaluated,
                        'progress.validEditaisEnqueued': totalValidEditaisEnqueued,
                        updatedAt: FieldValue.serverTimestamp()
                    });
                }

            } catch (err) {
                console.error(`Error searching for query ${query}:`, err);
            }
        }

        console.log(`Successfully finished agentic search for OSC ${oscId}`);
        if (jobRef) {
            await jobRef.update({
                status: 'completed',
                logs: FieldValue.arrayUnion('Busca finalizada com sucesso.'),
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error(`Agentic search failed for OSC ${oscId}`, error);
        if (jobRef) {
            await jobRef.update({
                status: 'failed',
                error: error instanceof Error ? error.message : 'Erro interno desconhecido.',
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
    timeoutSeconds: 540
}, async (request) => {
    const { oscIds, activityArea, onlyActive } = request.data as {
        oscIds: number[];
        activityArea?: string;
        onlyActive?: boolean
    };

    if (!oscIds || !Array.isArray(oscIds)) {
        console.error("Invalid task payload: missing oscIds.");
        return;
    }

    const db = getFirestore();
    let processed = 0;
    let imported = 0;

    for (const id_osc of oscIds) {
        try {
            // Deliberate delay to prevent rate-limiting from BrasilAPI / IPEA
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 1. Get CNPJ from IPEA
            const oscDetailsRes = await fetchWithRetry(`https://mapaosc.ipea.gov.br/api/api/osc/cabecalho/${id_osc}`);
            const oscDetails = await oscDetailsRes.json();
            const rawCnpj = oscDetails.cd_identificador_osc;

            if (!rawCnpj) continue;

            const cleanCnpj = String(rawCnpj).replace(/\D/g, '');
            if (cleanCnpj.length !== 14) continue;

            // 2. Enrich Profile Data using BrasilAPI
            const brasilApiResponse = await fetchWithRetry(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            const rawData = await brasilApiResponse.json();

            // 3. Apply Filters
            if (onlyActive) {
                // If the description is not ATIVA (e.g. INAPTA, BAIXADA) we skip
                if (rawData.descricao_situacao_cadastral !== 'ATIVA') {
                    continue;
                }
            }

            if (activityArea) {
                const searchArea = activityArea.toLowerCase();
                const mainActivity = (rawData.cnae_fiscal_descricao || '').toLowerCase();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const secActivities = (rawData.cnaes_secundarios || []).map((c: any) => (c.descricao || '').toLowerCase());

                const matchesArea = mainActivity.includes(searchArea) || secActivities.some((a: string) => a.includes(searchArea));

                if (!matchesArea) {
                    continue;
                }
            }

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

            const upsertData = {
                ...parseResult.data,
                cnpj: cleanCnpj,
                updatedAt: now,
            };

            if (!oscDoc.exists) {
                Object.assign(upsertData, { createdAt: now });
            }

            await oscRef.set(upsertData, { merge: true });
            imported++;

        } catch (error: unknown) {
            console.error(`Error processing OSC ${id_osc}:`, error);
        } finally {
            processed++;
        }
    }

    logger.info(`Chunk processing complete. Processed: ${processed}, Imported: ${imported}`);
});

export const ingestOscDataFunction = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '256MiB', // reduced memory since it's just an orchestrator now
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { uf, municipio, activityArea, onlyActive } = request.data as {
        uf?: string;
        municipio?: string;
        activityArea?: string;
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
    const CHUNK_SIZE = 100;
    const queue = getFunctions().taskQueue('processOscChunkWorker');
    let enqueuedTasks = 0;

    for (let i = 0; i < oscList.length; i += CHUNK_SIZE) {
        const chunk = oscList.slice(i, i + CHUNK_SIZE).map(osc => osc.id_osc);

        await queue.enqueue({
            oscIds: chunk,
            activityArea,
            onlyActive
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




async function enqueueEditalExtraction(link: string, text: string, reason: string, searchId?: string) {
    const db = getFirestore();
    const tempContentRef = db.collection('scraping_contents').doc();

    // Set TTL for 24 hours from now
    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + 24);

    await tempContentRef.set({
        text: text,
        createdAt: FieldValue.serverTimestamp(),
        expireAt: expireAt
    });

    const queue = getFunctions().taskQueue('extractionWorker');
    await queue.enqueue({
        searchId: searchId || null,
        link: link,
        contentId: tempContentRef.id,
        reason: reason
    });
    return tempContentRef.id;
}

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

    // Trigger the agentic search task for proactive edital discovery
    const agenticQueue = getFunctions().taskQueue('agenticSearchWorker');
    enqueuePromises.push(
        agenticQueue.enqueue({
            oscId: oscId
        }) as unknown as Promise<void>
    );

    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${editaisSnapshot.docs.length} match tasks and 1 agentic search task for OSC update ${oscId}.`);
});


async function processRssFeeds() {
    const RSS_URLS = [
        // Mock Google Alerts RSS URLs
        "https://news.google.com/rss/search?q=edital+ONG+OR+OSC+brasil",
        "https://news.google.com/rss/search?q=financiamento+projetos+culturais+edital",
        // Prosas RSS with regional filters for Nordeste and Paraiba
        "https://blog.prosas.com.br/categoria/editais/feed/?tag=nordeste,paraiba"
    ];

    const parser = new Parser();
    const db = getFirestore();
    let processedCount = 0;
    let savedCount = 0;

    for (const feedUrl of RSS_URLS) {
        try {
            console.log(`Fetching RSS feed: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);

            for (const item of feed.items) {
                if (!item.link) continue;

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
                        await enqueueEditalExtraction(item.link, text, triageResult.reason, "RSS");
                        console.log(`Successfully enqueued Edital extraction for ${item.link}`);
                        savedCount++; // Incrementing for now to reflect enqueued count
                    } catch (e) {
                         console.error(`Error enqueuing extraction for ${item.link}:`, e);
                    }
                }
            }
        } catch (error) {
            console.error(`Error fetching or parsing RSS feed ${feedUrl}:`, error);
        }
    }

    console.log(`Ingestion complete. Processed ${processedCount} items, saved ${savedCount} valid editais.`);
    return { processedCount, savedCount };
}

export const ingestGoogleAlertsRss = onSchedule('0 2 * * *', async () => {
    await processRssFeeds();
});


export const ingestManualOscFunction = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { storagePaths } = request.data as { storagePaths?: string[] };
    if (!storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
        throw new HttpsError('invalid-argument', 'Pelo menos um caminho de Storage é necessário.');
    }

    const bucket = getStorage().bucket();
    const pdfBase64s: string[] = [];

    try {
        // Download and convert PDFs to Base64
        for (const path of storagePaths) {
            const file = bucket.file(path);
            const [exists] = await file.exists();
            if (!exists) {
                throw new Error(`Arquivo não encontrado no Storage: ${path}`);
            }
            const [buffer] = await file.download();
            pdfBase64s.push(buffer.toString('base64'));
        }

        const profileData = await parsePdfToProfile({ pdfBase64s });

        // Save to Firestore
        const oscRef = await getFirestore().collection('oscs').add({
            ...profileData,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: 'manual_ingest'
        });

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
            oscId: oscRef.id,
            profile: {
                ...profileData,
                id: oscRef.id
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
        const text = await fetchAndExtractText(url);
        if (!text || text.length < 500) {
             return { success: false, message: "A extração de texto falhou ou a página tem pouco conteúdo." };
        }

        const triageResult = await triageEditalWebpage({ text });
        if (!triageResult.isValidEdital) {
             return { success: false, message: `O conteúdo não parece ser um edital válido. Motivo: ${triageResult.reason}` };
        }

        await enqueueEditalExtraction(url, text, triageResult.reason, "MANUAL");
        return { success: true, editalId: "pending", message: "Edital válido. Adicionado à fila de processamento e extração com IA." };

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

        // Fetch up to 10 editais for context
        const editaisSnapshot = await db.collection('editais').limit(10).get();
        const editais = editaisSnapshot.docs.map(doc => ({
            ...doc.data() as z.infer<typeof editalSchema>,
            editalId: doc.id
        }));

        // Fetch NGOs with basic filtering
        const oscsQuery = db.collection('oscs');

        // We will just fetch a chunk and filter in memory if queries get complex,
        // or apply simple filters
        const oscsSnapshot = await oscsQuery.limit(input.limit || 50).get();
        let oscs = oscsSnapshot.docs.map(doc => ({
            ...doc.data() as z.infer<typeof ngoProfileSchema>,
            oscId: doc.id
        }));

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
                osc.coreActivities.some((act: string) => act.toLowerCase().includes(lowerActivity))
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
            prompt: z.string().describe("Natural language prompt from the user"),
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

    const { prompt } = request.data as { prompt: string };
    if (!prompt) {
        throw new HttpsError('invalid-argument', 'O prompt é obrigatório.');
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
    timeoutSeconds: 540,
}, async () => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    try {
        const result = await processRssFeeds();
        return result;
    } catch (error: unknown) {
        console.error('Error in manualTriggerRssSyncFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during manual RSS sync.';
        throw new HttpsError('internal', errorMessage);
    }
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

import { NotificationService, MockNotificationProvider } from './services/notifications.js';

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
}, async (request) => {
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

        const agenticQueue = getFunctions().taskQueue('agenticSearchWorker');
        await agenticQueue.enqueue({
            oscId: oscId,
            jobId: jobRef.id
        });

        return { success: true, message: `Busca agêntica enfileirada para OSC ${oscId}`, jobId: jobRef.id };
    } catch (error: unknown) {
        console.error("Error triggering agentic search:", error);
        throw new HttpsError('internal', 'Falha ao iniciar a busca agêntica.');
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

        const queue = getFunctions().taskQueue('processScrapingTargetWorker');
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
    timeoutSeconds: 540
}, async (request) => {
    const { searchId, link, contentId, reason } = request.data as { searchId?: string, link: string, contentId: string, reason: string };

    if (!link || !contentId) {
        console.error("Invalid task payload: missing link, or contentId.");
        return;
    }

    const db = getFirestore();
    const searchRef = searchId && searchId !== "MANUAL" && searchId !== "RSS" ? db.collection('searches').doc(searchId) : null;
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
        const parseResult = editalSchema.safeParse(editalResult);

        if (parseResult.success) {
            let embedding: number[] = [];
            try {
                const editalData = parseResult.data;
                const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${editalData.eligibilityCriteria.allowedActivities?.join(', ') || ''}.`;
                embedding = await generateTextEmbedding(editalText);
            } catch (embedError) {
                console.warn("Failed to generate embedding for new edital:", embedError);
            }

            const editalDocData = {
                ...parseResult.data,
                rawText: text.substring(0, 5000),
                sourceUrl: link,
                embedding: embedding.length > 0 ? embedding : null,
                createdAt: FieldValue.serverTimestamp(),
            };

            const docRef = await db.collection('editais').add(editalDocData);

            if (searchRef) {
                await searchRef.update({
                    logs: FieldValue.arrayUnion({ link, status: 'Importado', reason: reason }),
                    savedCount: FieldValue.increment(1)
                });
            }

            // Handoff: Trigger Match Evaluator for agentic search if searchId contains an oscId pattern
            // Note: In agentic search, we passed oscId in place of searchId in enqueueEditalExtraction
            if (searchId && searchId !== "MANUAL" && searchId !== "RSS" && searchId.length > 15) {
                try {
                    const matchQueue = getFunctions().taskQueue('matchEvaluatorWorker');
                    await matchQueue.enqueue({
                        oscId: searchId,
                        editalId: docRef.id
                    });
                    console.log(`Enqueued match evaluation for new edital ${docRef.id} and OSC ${searchId}`);
                } catch (matchErr) {
                    console.error("Failed to enqueue match evaluator:", matchErr);
                }
            }
        } else {
            if (searchRef) {
                await searchRef.update({
                    logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: 'Falha na validação do schema do edital.' })
                });
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
            await searchRef.update({
                logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: error instanceof Error ? error.message : 'Erro desconhecido na extração' })
            });
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
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
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

        // 2. Playwright Scraping
        chromium.use(stealth());
        const browser = await chromium.launch({ headless: true });
        let combinedText = '';
        const downloadedPdfPaths: string[] = [];

        try {
            const context = await browser.newContext({ storageState: sessionFilePath });
            const page = await context.newPage();

            logger.info(`[Prosas Auth Worker] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

            // Wait an additional moment for dynamic content
            await page.waitForTimeout(5000);

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
                            const pdfData = await pdfParse(buffer, { max: 5 });
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
            await enqueueEditalExtraction(url, combinedText, "Authenticated Prosas Scraping", searchId);
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
        throw error;
    }
});

export const processScrapingTargetWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 540
}, async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query, page = 1, linksQueue = [] } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[] };

    if (!searchId || !target) {
        console.error("Invalid task payload: missing searchId or target.");
        return;
    }

    const db = getFirestore();
    const searchRef = db.collection('searches').doc(searchId);

    logger.info(`[Scraper] Starting processing for target: ${target.name} | URL: ${target.url} | Page: ${page} | Strategy: ${target.strategy}`);

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
                        headless: true,
                        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
                    const parser = new Parser();
                    const feed = await parser.parseURL(fetchUrl);
                    candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
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
                            try {
                                const expireAt = new Date();
                                expireAt.setHours(expireAt.getHours() + 24);

                                await db.collection('scraping_contents').add({
                                    url: fetchUrl,
                                    text: html,
                                    source: 'data_lake_html',
                                    targetId: target.id,
                                    createdAt: FieldValue.serverTimestamp(),
                                    expireAt: expireAt
                                });
                                logger.info(`[Data Lake] Raw HTML dumped to scraping_contents for: ${fetchUrl}`);
                            } catch (err) {
                                logger.error(`[Data Lake] Error dumping raw HTML to scraping_contents for: ${fetchUrl}`, err);
                            }

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
                            const parser = new Parser();
                            const feed = await parser.parseURL(fetchUrl);
                            candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
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
                            try {
                                const expireAt = new Date();
                                expireAt.setHours(expireAt.getHours() + 24);

                                await db.collection('scraping_contents').add({
                                    url: fetchUrl,
                                    text: html,
                                    source: 'data_lake_auto',
                                    targetId: target.id,
                                    createdAt: FieldValue.serverTimestamp(),
                                    expireAt: expireAt
                                });
                                logger.info(`[Data Lake] Raw Content dumped to scraping_contents for: ${fetchUrl}`);
                            } catch (err) {
                                logger.error(`[Data Lake] Error dumping raw content to scraping_contents for: ${fetchUrl}`, err);
                            }

                            if (contentType.includes('xml') || contentType.includes('rss')) {
                                try {
                                    const parser = new Parser();
                                    const feed = await parser.parseString(html);
                                    candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                                } catch {
                                    logger.warn(`Failed to parse XML response as RSS for ${fetchUrl}`);
                                }
                            } else {
                                const $ = cheerio.load(html);
                                const rssLink = $('link[type="application/rss+xml"]').attr('href');
                                if (rssLink) {
                                    try {
                                        const absoluteRssUrl = new URL(rssLink, fetchUrl).href;
                                        const parser = new Parser();
                                        const feed = await parser.parseURL(absoluteRssUrl);
                                        candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
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
                                    const preFiltered = rawLinks.filter(link => !excludePatterns.some(pattern => pattern.test(link)));
                                    const selectionResult = await selectEditalLinksFlow({ links: preFiltered });
                                    candidateLinks = selectionResult.selectedLinks;
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

        for (let i = 0; i < linksToProcess.length; i++) {
            const link = linksToProcess[i];
            if (!link) continue;

            if (link.toLowerCase().includes('prosas.com.br')) {
                logger.info(`[Scraper] Routing Prosas link to authenticated worker: ${link}`);
                await getFunctions().taskQueue('prosasAuthenticatedWorker').enqueue({ url: link, searchId });
                totalProcessed++;
                continue;
            }

            const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                continue;
            }

            try {
                const text = await fetchAndExtractText(link);
                if (!text || text.length < 500) {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Ignorado', reason: 'Texto ausente ou muito curto.' })
                    });
                    totalProcessed++;
                    continue;
                }

                // Heuristic Pre-filter: Check for essential keywords before calling the LLM
                const textLower = text.toLowerCase();
                const essentialKeywords = ['edital', 'inscrição', 'inscrições', 'prazo', 'fomento', 'chamada pública', 'financiamento'];
                const hasKeyword = essentialKeywords.some(kw => textLower.includes(kw));

                if (!hasKeyword) {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Ignorado', reason: 'Rejeitado pelo filtro heurístico pré-LLM (palavras-chave ausentes).' })
                    });
                    totalProcessed++;
                    continue;
                }

                const triageResult = await triageEditalWebpage({ text, searchQuery: query });

                if (triageResult.isValidEdital) {
                    await enqueueEditalExtraction(link, text, triageResult.reason, searchId);
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Em Processamento (Extração)', reason: triageResult.reason })
                    });
                } else {
                    await searchRef.update({
                        logs: FieldValue.arrayUnion({ link, status: 'Rejeitado', reason: triageResult.reason })
                    });
                }
            } catch (error) {
                console.error(`Error processing link ${link} from ${target.name}:`, error);
                await searchRef.update({
                    logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: error instanceof Error ? error.message : 'Erro desconhecido' })
                });
            }
            totalProcessed++;
        }

        const queue = getFunctions().taskQueue('processScrapingTargetWorker');

        if (remainingLinks.length > 0) {
            // Still have links from the current page to process
            await queue.enqueue({
                searchId,
                target,
                query,
                page,
                linksQueue: remainingLinks
            });
        } else if (candidateLinks.length > 0 && target.strategy !== 'RSS' && page < 100) {
            // Finished current page's links, fetch next page
            await queue.enqueue({
                searchId,
                target,
                query,
                page: page + 1,
                linksQueue: []
            });
        } else if (remainingLinks.length === 0) {
            // No more links to process, and no next page to fetch (either RSS, reached end, or max pages)
            await searchRef.update({
                completedTargets: FieldValue.increment(1)
            });
        }

        if (totalProcessed > 0) {
            await searchRef.update({
                processedCount: FieldValue.increment(totalProcessed)
            });
        }

    } catch (error) {
        console.error('Error during autonomous search target worker:', error);
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
    const queue = getFunctions().taskQueue('processScrapingTargetWorker');

    try {
        const enqueuePromises = targets.map(target => {
            return queue.enqueue({
                searchId,
                target,
                query: data.query
            });
        });

        await Promise.all(enqueuePromises);

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
