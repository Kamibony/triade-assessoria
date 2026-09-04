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
exports.prosasBulkDiscoveryWorker = exports.renewProsasSessionCron = exports.onSearchCreated = exports.processScrapingTargetWorker = exports.prosasAuthenticatedWorker = exports.extractionWorker = exports.seedScrapingTargets = exports.triggerScrapingWorker = exports.autonomousSearchWorker = exports.triggerAgenticSearch = exports.onMatchGenerated = exports.scheduledMatchSweeper = exports.manualTriggerRssSyncFunction = exports.askCopilotFunction = exports.ingestManualEditalFunction = exports.ingestManualOscFunction = exports.ingestGoogleAlertsRss = exports.onOscUpdated = exports.triggerMatchOrchestrator = exports.ingestOscDataFunction = exports.processOscChunkWorker = exports.matchEvaluatorWorker = exports.agenticSearchWorker = exports.extractEditalRulesFunction = exports.extractEditalRulesWorker = exports.extractEditalRules = exports.parsePdfProfileFunction = exports.parsePdfProfileWorker = exports.scoreMatch = void 0;
exports.formatGenkitError = formatGenkitError;
exports.fetchAndExtractText = fetchAndExtractText;
exports.enqueueEditalExtraction = enqueueEditalExtraction;
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const scheduler_1 = require("firebase-functions/v2/scheduler");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const playwright_extra_1 = require("playwright-extra");
const chromium_1 = __importDefault(require("@sparticuz/chromium"));
const pdfParse = require('pdf-parse');
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const functions_1 = require("firebase-admin/functions");
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const google_auth_library_1 = require("google-auth-library");
const genkit_1 = require("genkit");
function formatGenkitError(error, defaultMessage = "Erro interno desconhecido.") {
    let message = defaultMessage;
    if (error instanceof Error) {
        if (error.message.includes("429") || error.message.includes("Quota")) {
            message = "Cota diária de IA esgotada. Tente novamente amanhã.";
        }
        else if (error.message.includes("403") || error.message.includes("fetch") || error.message.includes("auth") || error.message.includes("Unable to authenticate your request")) {
            message = "Erro de comunicação com o serviço de IA. Verifique as credenciais ou permissões.";
        }
        else if (error.message.includes("Unknown action type returned from plugin vertexai")) {
            message = "Erro interno: Versão do plugin vertexai incompatível ou ação desconhecida.";
        }
        else {
            message = error.message;
        }
    }
    console.error("Original raw error:", error);
    return new https_1.HttpsError("internal", message);
}
const zod_1 = require("zod");
const google_genai_1 = require("@genkit-ai/google-genai");
const https_1 = require("firebase-functions/v2/https");
const tasks_1 = require("firebase-functions/v2/tasks");
const logger = __importStar(require("firebase-functions/logger"));
const schemas_js_1 = require("./shared/schemas.js");
const cheerio = __importStar(require("cheerio"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const braveApiKeyString = (0, params_1.defineString)('BRAVE_SEARCH_API_KEY');
const vertexAiSearchEngineIdString = (0, params_1.defineString)('VERTEX_AI_SEARCH_ENGINE_ID');
const vertexAiSearchLocationString = (0, params_1.defineString)('VERTEX_AI_SEARCH_LOCATION');
const vertexAiSearchProjectIdString = (0, params_1.defineString)('VERTEX_AI_SEARCH_PROJECT_ID');
function removeAccents(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
async function fetchWithRetry(url, options = {}, retries = 3) {
    const defaultHeaders = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TriadeAssessoria/1.0)'
    };
    const opts = { ...options, headers: { ...defaultHeaders, ...options.headers } };
    for (let i = 0; i < retries; i++) {
        try {
            // Use AbortSignal.timeout if available (Node 17.3+), fallback to AbortController otherwise.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const signal = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
            const res = await fetch(url, { ...opts, signal });
            if (!res.ok) {
                throw new Error(`API returned ${res.status} for ${url}`);
            }
            return res;
        }
        catch (error) {
            const err = error;
            logger.warn(`Fetch attempt ${i + 1} failed for ${url}: ${err.message}`);
            if (i === retries - 1)
                throw err;
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
const ai = (0, genkit_1.genkit)({
    plugins: [(0, google_genai_1.vertexAI)({ location: 'us-central1' })],
});
const parsePdfToProfile = ai.defineFlow({
    name: 'parsePdfToProfile',
    inputSchema: zod_1.z.object({
        pdfBase64s: zod_1.z.array(zod_1.z.string()).describe("Arquivos PDF codificados em Base64"),
    }),
    outputSchema: schemas_js_1.ngoProfileSchema,
}, async (input) => {
    const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social, Cartão CNPJ e/ou ATA de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Você DEVE extrair o CNPJ, Nome (Legal Name), Missão/Foco de atuação (do Estatuto) e a Validade da Diretoria (da ATA).
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = [{ text: prompt }];
    for (let i = 0; i < input.pdfBase64s.length; i++) {
        try {
            const base64String = input.pdfBase64s[i] || '';
            if (!base64String)
                continue;
            const pdfBuffer = Buffer.from(base64String, 'base64');
            const pdfData = await pdfParse(pdfBuffer, { max: 10 });
            content.push({ text: `Conteúdo do Documento ${i + 1}:\n\n${pdfData.text.substring(0, 15000)}` });
        }
        catch (error) {
            console.warn(`Falha ao analisar o PDF base64 no índice ${i}:`, error);
        }
    }
    const response = await ai.generate({
        model: 'vertexai/gemini-2.5-flash',
        messages: [
            { role: 'user', content: content }
        ],
        output: { schema: schemas_js_1.ngoProfileSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair dados do PDF");
    }
    return response.output;
});
exports.scoreMatch = ai.defineFlow({
    name: 'scoreMatch',
    inputSchema: zod_1.z.object({
        osc: schemas_js_1.ngoProfileSchema,
        edital: schemas_js_1.editalSchema,
        oscId: zod_1.z.string(),
        editalId: zod_1.z.string()
    }),
    outputSchema: schemas_js_1.matchSchema,
}, async (input) => {
    const currentDate = new Date().toISOString();
    const prompt = `Você é um agente especialista em avaliação de projetos culturais para leis de incentivo no Brasil, atuando pela Tríade Assessoria.

Contexto de Data do Sistema:
A data atual de hoje é ${currentDate}. Tenha isso em mente ao avaliar prazos e datas de encerramento.

A sua tarefa é cruzar os dados de uma ONG com as regras e critérios de elegibilidade de um Edital específico e determinar o Match (compatibilidade) aplicando um Processo Estrito de Avaliação de Duas Fases (Two-Gate Evaluation Process).

Fase 1 (Gate 1): Validação Temporal / Status
Verifique agressivamente se o edital já passou do prazo final (ex: "inscrições encerradas", ou se a data limite de inscrição já passou em relação à data atual do sistema fornecida acima).
Check the current date. If the edital's application deadline has passed, or if the page indicates 'Encerrado', 'Resultados', or 'Prorrogado' (for a past date), you MUST immediately halt evaluation, assign a final score of 0%, and set the status to 'Inelegível'. Do NOT average the score with thematic fit.
SE O EDITAL ESTIVER ENCERRADO OU COM PRAZO EXPIRADO, você DEVE gerar um 'matchScore' de 0, determinar 'eligibility' como false. IMPORTANTE: Nesse caso, retorne 'reasoning: null' e NÃO gere um 'actionPlan' para poupar tokens, pule a Fase 2.

Fase 2 (Gate 2): Alinhamento Temático (Apenas se passar pela Fase 1)
Avalie os critérios de elegibilidade abaixo cruzando a ONG com o Edital e gere um 'matchScore' de 0 a 100 indicando o grau de compatibilidade (Alinhamento Temático), se e somente se o edital for considerado Válido / Aberto na Fase 1. Determine 'eligibility' (true ou false).

Perfil da ONG:
Nome: ${input.osc.name}
Data de Fundação: ${input.osc.foundationDate}
Localização: ${input.osc.location}
Status da Documentação: ${input.osc.documentationStatus}
Projetos Culturais Anteriores: ${input.osc.previousProjectsApproved ? 'Sim' : 'Não'}
Atividades Principais: ${(input.osc.coreActivities || []).join(', ')}

Regras do Edital:
Título: ${input.edital.title}
Emissor: ${input.edital.issuer}
Critérios de Elegibilidade:
- Anos mínimos de atividade: ${input.edital.eligibilityCriteria.minYearsActive}
- Localizações exigidas: ${input.edital.eligibilityCriteria.requiredLocations.join(', ')}
- Documentação exigida: ${input.edital.eligibilityCriteria.requiredDocumentation.join(', ')}
- Atividades permitidas: ${input.edital.eligibilityCriteria.allowedActivities.join(', ')}

Se a ONG for ELEGÍVEL e o score for > 0, forneça um 'reasoning' (justificativa detalhada).
Forneça um 'aiSummary' (um resumo de 1-2 frases destacando os pontos fortes ou fracos).
Forneça um 'badges' (2 a 3 tags curtas que categorizam o match, ex: 'Alta Aderência', 'Desafio Financeiro', 'Foco Regional').
Se a ONG for INELEGÍVEL (0 de score) não gere actionPlan nem reasoning. Se for elegível e com score baixo mas passível de melhora, gere o actionPlan.
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
exports.parsePdfProfileWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    const { pdfBase64s, trackingId } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const trackingRef = db.collection('pdf_extractions').doc(trackingId);
    try {
        const result = await parsePdfToProfile({ pdfBase64s });
        await trackingRef.set({
            status: 'completed',
            result: result,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    catch (error) {
        console.error(`Error in parsePdfProfileWorker for ${trackingId}:`, error);
        await trackingRef.set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        throw error;
    }
});
exports.parsePdfProfileFunction = (0, https_1.onCall)({
    cors: true,
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    const pdfBase64s = request.data.pdfBase64 ? [request.data.pdfBase64] : request.data.pdfBase64s || [];
    for (const b64 of pdfBase64s) {
        if (typeof b64 === 'string' && b64.length > 7000000) {
            throw new https_1.HttpsError('invalid-argument', 'Um dos arquivos PDF excede o limite máximo permitido (aproximadamente 5MB).');
        }
    }
    const db = (0, firestore_1.getFirestore)();
    const trackingRef = db.collection('pdf_extractions').doc();
    await trackingRef.set({
        status: 'pending',
        type: 'profile_extraction',
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
    const queue = (0, functions_1.getFunctions)().taskQueue('parsePdfProfileWorker');
    await queue.enqueue({
        pdfBase64s: pdfBase64s,
        trackingId: trackingRef.id
    });
    return { trackingId: trackingRef.id, status: 'pending' };
});
const selectEditalLinksFlow = ai.defineFlow({
    name: 'selectEditalLinksFlow',
    inputSchema: zod_1.z.object({
        links: zod_1.z.array(zod_1.z.string()).max(40).describe("Lista de URLs pré-filtradas"),
    }),
    outputSchema: zod_1.z.object({
        selectedLinks: zod_1.z.array(zod_1.z.string()).describe("Apenas os links que parecem apontar para detalhes de editais ou chamadas.")
    }),
}, async (input) => {
    const prompt = `Analise a seguinte lista de URLs.
Identifique e retorne APENAS os links que são altamente prováveis de apontar para a página de detalhes de um edital (grant, chamada pública, financiamento, edital).
Ignore links genéricos de navegação.
Retorne um array com as URLs selecionadas.`;
    const response = await ai.generate({
        model: 'vertexai/gemini-2.5-flash',
        messages: [{ role: 'user', content: [{ text: prompt }, { text: JSON.stringify(input.links) }] }],
        output: { schema: zod_1.z.object({ selectedLinks: zod_1.z.array(zod_1.z.string()) }) }
    });
    if (!response.output) {
        throw new Error("Falha na seleção de links via Genkit");
    }
    return response.output;
});
exports.extractEditalRules = ai.defineFlow({
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

Preste MUITA ATENÇÃO à "Abrangência" (Geographic Reach) do edital. Se um edital tiver abrangência Nacional ou cobrir a região Nordeste, você DEVE sinalizá-lo como válido para OSCs locais (ex: incluindo 'PB', 'Nordeste' ou 'Nacional' em requiredLocations), IGNORANDO COMPLETAMENTE o endereço físico ou sede da instituição financiadora. O que importa é onde o projeto pode ser executado.

Se alguma informação não estiver explícita, você deve tentar deduzir com base no contexto geral ou, se impossível, preencher de forma condizente. Não invente informações.
Sempre retorne os dados no formato estruturado solicitado em português do Brasil (pt-BR).`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = [{ text: prompt }];
    if (input.pdfBase64) {
        try {
            const pdfBuffer = Buffer.from(input.pdfBase64, 'base64');
            const pdfData = await pdfParse(pdfBuffer, { max: 10 });
            const extractedText = pdfData.text.substring(0, 15000);
            content.push({ text: `Texto extraído do PDF:\n\n${extractedText}` });
        }
        catch (error) {
            console.error("Falha ao analisar o PDF base64:", error);
            throw new Error("Falha ao analisar o PDF fornecido.");
        }
    }
    else if (input.text) {
        const truncatedText = input.text.substring(0, 15000);
        content.push({ text: `Texto do edital:\n\n${truncatedText}` });
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
        searchQuery: zod_1.z.string().optional().describe("Consulta de busca opcional do operador (filtro estrito)"),
    }),
    outputSchema: schemas_js_1.triageSchema,
}, async (input) => {
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
exports.extractEditalRulesWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '2GiB'
}, async (request) => {
    const { data, trackingId } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const trackingRef = db.collection('pdf_extractions').doc(trackingId);
    try {
        const result = await (0, exports.extractEditalRules)(data);
        await trackingRef.set({
            status: 'completed',
            result: result,
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    catch (error) {
        console.error(`Error in extractEditalRulesWorker for ${trackingId}:`, error);
        await trackingRef.set({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        throw error;
    }
});
exports.extractEditalRulesFunction = (0, https_1.onCall)({
    cors: true,
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    if (request.data.pdfBase64 && request.data.pdfBase64.length > 7000000) {
        throw new https_1.HttpsError('invalid-argument', 'O arquivo PDF excede o limite máximo permitido (aproximadamente 5MB).');
    }
    const db = (0, firestore_1.getFirestore)();
    const trackingRef = db.collection('pdf_extractions').doc();
    await trackingRef.set({
        status: 'pending',
        type: 'rules_extraction',
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
    const queue = (0, functions_1.getFunctions)().taskQueue('extractEditalRulesWorker');
    await queue.enqueue({
        data: request.data,
        trackingId: trackingRef.id
    });
    return { trackingId: trackingRef.id, status: 'pending' };
});
const firestore_2 = require("firebase-functions/v2/firestore");
const generateSearchQueries = ai.defineFlow({
    name: 'generateSearchQueries',
    inputSchema: zod_1.z.object({
        osc: schemas_js_1.ngoProfileSchema,
    }),
    outputSchema: zod_1.z.object({
        queries: zod_1.z.array(zod_1.z.string()).describe("Lista de queries de busca"),
    }),
}, async (input) => {
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
        output: { schema: zod_1.z.object({ queries: zod_1.z.array(zod_1.z.string()) }) }
    });
    if (!response.output) {
        throw new Error("Falha ao gerar queries de busca");
    }
    return response.output;
});
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        console.warn(`cosineSimilarity returning 0 due to missing vectors or dimension mismatch. vecA.length: ${vecA?.length}, vecB.length: ${vecB?.length}`);
        return 0;
    }
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
        normA += (vecA[i] || 0) * (vecA[i] || 0);
        normB += (vecB[i] || 0) * (vecB[i] || 0);
    }
    if (normA === 0 || normB === 0) {
        console.warn(`cosineSimilarity returning 0 due to zero norm. normA: ${normA}, normB: ${normB}`);
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
async function generateTextEmbedding(text) {
    try {
        const response = await ai.embed({
            embedder: 'vertexai/text-embedding-004',
            content: text.substring(0, 5000)
        });
        if (Array.isArray(response)) {
            // Genkit 1.0 ai.embed returns an array of objects { embedding: number[] }
            const typedResponse = response;
            if (typedResponse.length > 0 && typedResponse[0] && typedResponse[0].embedding) {
                return typedResponse[0].embedding;
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (response && response.embedding)
            return response.embedding;
        throw new Error('Formato de retorno de embedding desconhecido.');
    }
    catch (err) {
        console.error("Error generating embedding:", err);
        throw err;
    }
}
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
    const oscParseResult = schemas_js_1.ngoProfileSchema.safeParse(enrichedOscData);
    const editalParseResult = schemas_js_1.editalSchema.safeParse(rawEditalData);
    // Helper for safe timestamp extraction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (!oscParseResult.success) {
        console.warn(`Invalid OSC data for ${oscId} (Writing Incomplete Profile match safely):`, oscParseResult.error);
        const matchRef = existingMatchRef || db.collection('matches').doc();
        const incompleteMatchDoc = {
            id: matchRef.id,
            oscId: oscId,
            editalId: editalId,
            oscName: enrichedOscData.name || 'ONG Desconhecida',
            editalTitle: rawEditalData?.title || 'Edital Desconhecido',
            sourceUrl: rawEditalData?.sourceUrl || null,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            matchScore: 0,
            eligibility: false,
            status: 'Inelegível (Dados Incompletos)',
            badges: ['Perfil Incompleto'],
            aiSummary: 'A avaliação não pôde ser concluída porque os dados da OSC estão incompletos ou inválidos.',
            reasoning: null,
            actionPlan: ['Atualize os dados do perfil da OSC para permitir a avaliação de match.']
        };
        await matchRef.set(incompleteMatchDoc, { merge: true });
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
    // Vector Pre-filtering
    let oscEmbedding = rawOscData?.embedding || null;
    let editalEmbedding = rawEditalData?.embedding || null;
    if (!oscEmbedding) {
        console.log(`Generating missing embedding for OSC ${oscId}`);
        const oscText = `Missão: ${oscData.mission || ''}. Foco: ${(oscData.coreActivities || []).join(', ')}. Nome: ${oscData.name || ''}`;
        oscEmbedding = await generateTextEmbedding(oscText);
        await db.collection('oscs').doc(oscId).update({ embedding: oscEmbedding });
        oscData.embedding = oscEmbedding;
    }
    if (!editalEmbedding) {
        console.log(`Generating missing embedding for Edital ${editalId}`);
        const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${(editalData.eligibilityCriteria?.allowedActivities || []).join(', ')}.`;
        editalEmbedding = await generateTextEmbedding(editalText);
        await db.collection('editais').doc(editalId).update({ embedding: editalEmbedding });
        editalData.embedding = editalEmbedding;
    }
    const similarityScore = cosineSimilarity(oscEmbedding, editalEmbedding);
    console.log(`Vector similarity score for OSC ${oscId} and Edital ${editalId}: ${similarityScore}`);
    let matchResult;
    if (similarityScore < 0.70) {
        console.log(`Silently rejecting match for OSC ${oscId} and Edital ${editalId} due to low similarity score (${similarityScore} < 0.70)`);
        matchResult = {
            matchScore: 0,
            eligibility: false,
            status: 'Inelegível',
            badges: ['Baixa Relevância (Filtro)'],
            aiSummary: 'A avaliação foi interrompida devido à baixa similaridade semântica entre a ONG e o Edital.',
            reasoning: null
        };
    }
    else {
        matchResult = await (0, exports.scoreMatch)({
            osc: oscData,
            edital: editalData,
            oscId: oscId,
            editalId: editalId
        });
    }
    const matchRef = existingMatchRef || db.collection('matches').doc();
    const matchDocData = {
        ...matchResult,
        id: matchRef.id,
        oscId: oscId,
        editalId: editalId,
        oscName: oscData.name,
        editalTitle: editalData.title,
        sourceUrl: rawEditalData?.sourceUrl || null,
        createdAt: firestore_1.FieldValue.serverTimestamp()
    };
    await matchRef.set(matchDocData, { merge: true });
    return matchDocData;
}
exports.agenticSearchWorker = (0, tasks_1.onTaskDispatched)({
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
    const { oscId, jobId } = request.data;
    if (!oscId) {
        console.error("Invalid task payload: missing oscId.");
        return;
    }
    const db = (0, firestore_1.getFirestore)();
    const jobRef = jobId ? db.collection('agentic_search_jobs').doc(jobId) : null;
    try {
        if (jobRef) {
            await jobRef.update({
                status: 'generating_queries',
                logs: firestore_1.FieldValue.arrayUnion('Iniciando geração de queries de busca...'),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        const oscDoc = await db.collection('oscs').doc(oscId).get();
        if (!oscDoc.exists) {
            console.error(`OSC ${oscId} not found.`);
            if (jobRef)
                await jobRef.update({ status: 'failed', error: 'OSC não encontrada.', updatedAt: firestore_1.FieldValue.serverTimestamp() });
            return;
        }
        const rawOscData = oscDoc.data();
        const parseResult = schemas_js_1.ngoProfileSchema.safeParse(rawOscData);
        if (!parseResult.success) {
            console.warn(`Invalid OSC data for ${oscId}`);
            if (jobRef)
                await jobRef.update({ status: 'failed', error: 'Dados da OSC inválidos.', updatedAt: firestore_1.FieldValue.serverTimestamp() });
            return;
        }
        const oscData = parseResult.data;
        let oscEmbedding = rawOscData?.embedding || null;
        if (!oscEmbedding) {
            const oscText = `Missão: ${oscData.mission || ''}. Foco: ${(oscData.coreActivities || []).join(', ')}. Nome: ${oscData.name || ''}`;
            oscEmbedding = await generateTextEmbedding(oscText);
            await db.collection('oscs').doc(oscId).update({ embedding: oscEmbedding });
        }
        // Tier 1: Internal Database First
        if (jobRef) {
            await jobRef.update({
                logs: firestore_1.FieldValue.arrayUnion('Executando Tier 1: Busca em base interna...'),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        const matchEvaluatorQueue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
        const internalEditaisSnapshot = await db.collection('editais').limit(100).get();
        let instantMatches = 0;
        // Find internal editais that have high vector similarity
        const editaisMissingEmbeddings = [];
        const validEditaisForSimilarity = [];
        for (const editalDoc of internalEditaisSnapshot.docs) {
            const editalData = editalDoc.data();
            const editalEmbedding = editalData?.embedding || null;
            if (editalEmbedding) {
                validEditaisForSimilarity.push({ docId: editalDoc.id, embedding: editalEmbedding });
            }
            else if (editalData.title) {
                const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${editalData.eligibilityCriteria?.allowedActivities?.join(', ') || ''}.`;
                editaisMissingEmbeddings.push({ docId: editalDoc.id, text: editalText });
            }
        }
        // Process missing embeddings in chunks of 10 to avoid blocking the thread too long or hitting rate limits
        const embedChunkSize = 10;
        for (let i = 0; i < editaisMissingEmbeddings.length; i += embedChunkSize) {
            const chunk = editaisMissingEmbeddings.slice(i, i + embedChunkSize);
            await Promise.all(chunk.map(async (item) => {
                try {
                    const embedding = await generateTextEmbedding(item.text);
                    await db.collection('editais').doc(item.docId).update({ embedding: embedding });
                    validEditaisForSimilarity.push({ docId: item.docId, embedding: embedding });
                }
                catch (err) {
                    console.warn(`Failed to generate embedding for internal edital ${item.docId}:`, err);
                }
            }));
        }
        for (const edital of validEditaisForSimilarity) {
            if (oscEmbedding) {
                const similarityScore = cosineSimilarity(oscEmbedding, edital.embedding);
                if (similarityScore >= 0.70) { // Same strict threshold as the new pre-filter baseline
                    await matchEvaluatorQueue.enqueue({
                        oscId: oscId,
                        editalId: edital.docId
                    });
                    instantMatches++;
                }
            }
        }
        console.log(`Found ${instantMatches} instant internal matches for OSC ${oscId}.`);
        if (jobRef) {
            await jobRef.update({
                logs: firestore_1.FieldValue.arrayUnion(`Tier 1 Concluído: Encontrados ${instantMatches} editais promissores internos.`),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        const { queries } = await generateSearchQueries({ osc: oscData });
        console.log(`Generated queries for OSC ${oscId}:`, queries);
        if (jobRef) {
            await jobRef.update({
                'progress.queriesGenerated': queries.length,
                'progress.validEditaisEnqueued': instantMatches,
                status: 'scraping_web',
                logs: firestore_1.FieldValue.arrayUnion(`Geradas ${queries.length} queries. Iniciando busca na web...`),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        let totalLinksFound = 0;
        let totalLinksEvaluated = 0;
        let totalValidEditaisEnqueued = instantMatches;
        const methodBreakdown = { internal: instantMatches, web: 0 };
        const queryPerformance = {};
        const topDomains = {};
        const rejections = { expired: 0, out_of_scope: 0, fetch_error: 0, snippet_rejected: 0 };
        let allSearchResults = [];
        const QUERY_CHUNK_SIZE = 3;
        for (let q = 0; q < queries.length; q += QUERY_CHUNK_SIZE) {
            const queryChunk = queries.slice(q, q + QUERY_CHUNK_SIZE);
            await Promise.all(queryChunk.map(async (baseQuery) => {
                const query = baseQuery;
                try {
                    if (jobRef) {
                        await jobRef.update({
                            logs: firestore_1.FieldValue.arrayUnion(`Buscando: "${query}"...`),
                            updatedAt: firestore_1.FieldValue.serverTimestamp()
                        });
                    }
                    const searchPromises = [];
                    // Tier 2: Google Vertex AI Search
                    let vertexProjectId = process.env.VERTEX_AI_SEARCH_PROJECT_ID;
                    if (!vertexProjectId) {
                        try {
                            vertexProjectId = vertexAiSearchProjectIdString.value();
                        }
                        catch (e) { /* ignore */ }
                    }
                    vertexProjectId = vertexProjectId || "566889139686";
                    let vertexLocation = process.env.VERTEX_AI_SEARCH_LOCATION;
                    if (!vertexLocation) {
                        try {
                            vertexLocation = vertexAiSearchLocationString.value();
                        }
                        catch (e) { /* ignore */ }
                    }
                    vertexLocation = vertexLocation || "global";
                    let vertexEngineId = process.env.VERTEX_AI_SEARCH_ENGINE_ID;
                    if (!vertexEngineId) {
                        try {
                            vertexEngineId = vertexAiSearchEngineIdString.value();
                        }
                        catch (e) { /* ignore */ }
                    }
                    vertexEngineId = vertexEngineId || "triade-sniper-search_1787960465651";
                    if (vertexEngineId && vertexLocation && vertexProjectId) {
                        const vertexSearchPromise = (async () => {
                            try {
                                console.log(`[Agentic Search] Executing Vertex AI Search for query: "${query}"`);
                                const auth = new google_auth_library_1.GoogleAuth({
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
                                    if (vertexResponse.ok)
                                        break;
                                    if (vertexResponse.status === 429 || vertexResponse.status >= 500) {
                                        attempt++;
                                        console.warn(`Vertex AI Search API failed with status ${vertexResponse.status}. Retrying ${attempt}/${maxAttempts}...`);
                                        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
                                    }
                                    else {
                                        break; // Non-retryable error
                                    }
                                }
                                if (!vertexResponse || !vertexResponse.ok) {
                                    const status = vertexResponse ? vertexResponse.status : 'unknown';
                                    console.error(`Vertex AI Search API failed permanently with status: ${status}`);
                                    if (jobRef) {
                                        await jobRef.update({
                                            logs: firestore_1.FieldValue.arrayUnion(`Falha permanente no Vertex AI para query: "${query}" (Status: ${status})`),
                                        });
                                    }
                                }
                                else {
                                    const vertexData = await vertexResponse.json();
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
                                            }
                                            catch (e) { }
                                            allSearchResults.push({
                                                link: derivedStructData.link,
                                                title: derivedStructData.title || '',
                                                snippet: snippet,
                                                query: query
                                            });
                                        }
                                    }
                                }
                            }
                            catch (e) {
                                console.error(`[Agentic Search] Exception during Vertex AI Search:`, e);
                            }
                        })();
                        searchPromises.push(vertexSearchPromise);
                    }
                    // Tier 3: Brave Search API
                    let braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
                    if (!braveApiKey) {
                        try {
                            braveApiKey = braveApiKeyString.value();
                        }
                        catch (e) { /* ignore */ }
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
                                    const braveData = await searchResponse.json();
                                    const results = braveData.web?.results || [];
                                    for (const r of results) {
                                        if (r.url) {
                                            try {
                                                const domain = new URL(r.url).hostname;
                                                topDomains[domain] = (topDomains[domain] || 0) + 1;
                                            }
                                            catch (e) { }
                                            allSearchResults.push({
                                                link: r.url,
                                                title: r.title || '',
                                                snippet: r.description || '',
                                                query: query
                                            });
                                        }
                                    }
                                }
                                catch (e) {
                                    console.warn(`Brave Search API request threw error for page ${offset}`, e);
                                }
                            }));
                        })();
                        searchPromises.push(braveSearchPromise);
                    }
                    else {
                        console.warn(`[Agentic Search] BRAVE_SEARCH_API_KEY not found. Skipping Brave search.`);
                    }
                    await Promise.all(searchPromises);
                }
                catch (err) {
                    console.error(`Error searching for query ${query}:`, err);
                }
            }));
        }
        // Intra-job deduplication
        const uniqueSearchResults = [];
        const seenLinks = new Set();
        for (const res of allSearchResults) {
            if (!seenLinks.has(res.link)) {
                seenLinks.add(res.link);
                uniqueSearchResults.push(res);
            }
        }
        console.log(`Aggregated ${uniqueSearchResults.length} unique links across all queries.`);
        if (jobRef) {
            await jobRef.update({
                logs: firestore_1.FieldValue.arrayUnion(`Agregados ${uniqueSearchResults.length} links únicos de todas as fontes.`),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
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
                logs: firestore_1.FieldValue.arrayUnion(`Filtro de duplicatas concluído: ${shieldedResults.length} novos links identificados.`),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        let hasUpdatedStatus = false;
        // Process in chunks of 3 to control concurrency and adhere to Vertex AI rate limits
        const chunkSize = 3;
        const essentialKeywords = ['edital', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'fomento', 'chamada pública', 'financiamento'];
        // Phase 1: Pre-filtering and Scoring (Steps A & B)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evaluatedLinks = [];
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
                }
                catch (embedErr) {
                    console.warn(`Failed to generate embedding for snippet of ${link}, bypassing snippet filter:`, embedErr);
                    similarityScore = 1; // Bypass filter on failure to prevent silent rejections
                }
                if (similarityScore > 0.30) {
                    evaluatedLinks.push({ r, score: similarityScore });
                }
                else {
                    rejections.snippet_rejected++;
                }
            }));
            // Debounce progress updates after each chunk
            if (jobRef) {
                await jobRef.update({
                    'progress.linksFound': totalLinksFound,
                    'progress.linksEvaluated': totalLinksEvaluated,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
        }
        // Sort by score descending and take the top 30 most promising links
        evaluatedLinks.sort((a, b) => b.score - a.score);
        const topLinks = evaluatedLinks.slice(0, 30);
        console.log(`Phase 1 complete. Proceeding with top ${topLinks.length} links out of ${evaluatedLinks.length} evaluated.`);
        if (jobRef) {
            await jobRef.update({
                logs: firestore_1.FieldValue.arrayUnion(`Fase 1 concluída. Avaliando os top ${topLinks.length} links promissores de ${evaluatedLinks.length}.`),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
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
                    if (fetchedText && fetchedText.length >= 500) {
                        const fetchedTextLower = fetchedText.toLowerCase();
                        const hasKeywordInFullText = essentialKeywords.some(kw => fetchedTextLower.includes(kw));
                        if (!hasKeywordInFullText) {
                            console.log(`Rejecting ${link} post-fetch: missing essential keywords in full text.`);
                            rejections.out_of_scope++;
                            return; // Reject before LLM evaluation
                        }
                        fullTextToAnalyze = fetchedText;
                    }
                    else {
                        console.warn(`Rejecting ${link}: full text fetch returned insufficient content.`);
                        rejections.fetch_error++;
                        return; // Drop URL if fetch didn't yield enough content
                    }
                }
                catch (fetchErr) {
                    console.warn(`Failed to fetch full text for ${link}, dropping URL to prevent hallucinations`, fetchErr);
                    rejections.fetch_error++;
                    return; // Explicitly drop URL on failure
                }
                if (jobRef && !hasUpdatedStatus) { // Update status to scoring on the first valid link of the batch
                    hasUpdatedStatus = true;
                    await jobRef.update({ status: 'scoring_triage', updatedAt: firestore_1.FieldValue.serverTimestamp() });
                }
                // Step D: LLM Triage (High Cost)
                fullTextToAnalyze = fullTextToAnalyze.substring(0, 3000); // Truncate to reduce token cost
                const triageResult = await triageEditalWebpage({ text: fullTextToAnalyze, searchQuery: r.query });
                if (triageResult.isValidEdital) {
                    await enqueueEditalExtraction(link, fullTextToAnalyze, "Edital válido", jobId || `AGENTIC_${oscId}`);
                    console.log(`Successfully enqueued agentic extraction for ${link}`);
                    totalValidEditaisEnqueued++;
                    methodBreakdown.web++;
                    if (r.query) {
                        queryPerformance[r.query] = (queryPerformance[r.query] || 0) + 1;
                    }
                }
                else {
                    rejections.out_of_scope++;
                }
            }));
            // Debounce progress updates after each chunk
            if (jobRef) {
                await jobRef.update({
                    'progress.validEditaisEnqueued': totalValidEditaisEnqueued,
                    updatedAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
        }
        console.log(`Successfully finished agentic search for OSC ${oscId}`);
        if (jobRef) {
            await jobRef.update({
                status: 'completed',
                logs: firestore_1.FieldValue.arrayUnion('Busca finalizada com sucesso.'),
                analytics: { methodBreakdown, queryPerformance, topDomains, rejections },
                completedAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
    }
    catch (error) {
        console.error(`Agentic search failed for OSC ${oscId}`, error);
        if (jobRef) {
            await jobRef.update({
                status: 'failed',
                error: formatGenkitError(error, 'Erro interno desconhecido.').message,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
        throw error;
    }
});
exports.matchEvaluatorWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: {
        maxAttempts: 3,
        minBackoffSeconds: 30,
    },
    rateLimits: {
        maxConcurrentDispatches: 5, // Prevent Vertex AI rate limits (HTTP 429)
    },
    timeoutSeconds: 540, // Allow enough time for Genkit execution
    memory: '1GiB'
}, async (request) => {
    const { oscId, editalId } = request.data;
    if (!oscId || !editalId) {
        console.error("Invalid task payload: missing oscId or editalId.");
        return;
    }
    try {
        const result = await processMatchEvaluation(oscId, editalId);
        if (result === null) {
            console.log(`Task skipped safely due to invalid data for OSC ${oscId} and Edital ${editalId}`);
        }
        else {
            console.log(`Successfully processed task for OSC ${oscId} and Edital ${editalId}`);
        }
    }
    catch (error) {
        console.error(`Task execution failed for OSC ${oscId} and Edital ${editalId}`, error);
        throw error; // Let the queue handle the retry
    }
});
const STATE_ABBREVIATIONS = {
    'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapa', 'AM': 'Amazonas', 'BA': 'Bahia',
    'CE': 'Ceara', 'DF': 'Distrito Federal', 'ES': 'Espirito Santo', 'GO': 'Goias',
    'MA': 'Maranhao', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul', 'MG': 'Minas Gerais',
    'PA': 'Para', 'PB': 'Paraiba', 'PR': 'Parana', 'PE': 'Pernambuco', 'PI': 'Piaui',
    'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte', 'RS': 'Rio Grande do Sul',
    'RO': 'Rondonia', 'RR': 'Roraima', 'SC': 'Santa Catarina', 'SP': 'Sao Paulo',
    'SE': 'Sergipe', 'TO': 'Tocantins'
};
exports.processOscChunkWorker = (0, tasks_1.onTaskDispatched)({
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
    const { oscIds, activityArea, aiPrompt, onlyActive, jobId } = request.data;
    if (!oscIds || !Array.isArray(oscIds)) {
        console.error("Invalid task payload: missing oscIds.");
        return;
    }
    const db = (0, firestore_1.getFirestore)();
    let processed = 0;
    let imported = 0;
    const collectedOscs = [];
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
                if (!rawCnpj)
                    return;
                const cleanCnpj = String(rawCnpj).replace(/\D/g, '');
                if (cleanCnpj.length !== 14)
                    return;
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
                    const secActivities = (rawData.cnaes_secundarios || []).map((c) => (c.descricao || '').toLowerCase());
                    const matchesArea = mainActivity.includes(searchArea) || secActivities.some((a) => a.includes(searchArea));
                    if (!matchesArea) {
                        return;
                    }
                }
                collectedOscs.push({ cleanCnpj, rawData, id_osc });
            }
            catch (error) {
                console.error(`Error processing OSC ${id_osc}:`, error);
            }
            finally {
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
            let allMatchedCnpjs = [];
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
                        (osc.rawData.cnaes_secundarios || []).forEach((c) => {
                            textFields.push(c.descricao || '');
                        });
                        return `CNPJ: ${osc.cleanCnpj}, Name: ${textFields[0]}, Descriptions: ${textFields.join(' ')}`;
                    }).join('\n');
                    const llmPrompt = `You are a strict, ruthless data filter. Evaluate NGOs strictly based on explicit textual evidence in their Name or CNAE. Do NOT assume generic religious organizations (igrejas, congregações) or generic neighborhood associations (moradores) run niche programs unless their name explicitly states it. If the user asks for a specific niche and the NGO is generic, EXCLUDE IT. When in doubt, EXCLUDE. User's request: ${aiPrompt}. Here are ${chunk.length} NGOs (Name + CNAE descriptions):\n${promptData}\nAnalyze their semantic alignment with the request. Return a raw JSON array containing ONLY the string CNPJs of the NGOs that genuinely match the profile.`;
                    const response = await ai.generate({
                        model: 'vertexai/gemini-2.5-flash',
                        prompt: llmPrompt,
                        config: { temperature: 0.0 },
                        output: { schema: zod_1.z.array(zod_1.z.string()) }
                    });
                    return response.output || [];
                }));
                allMatchedCnpjs = allMatchedCnpjs.concat(batchResults.flat());
            }
            filteredOscs = filteredOscs.filter(osc => allMatchedCnpjs.includes(osc.cleanCnpj));
        }
        catch (error) {
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
            const parseResult = schemas_js_1.ngoProfileSchema.safeParse(transformedData);
            if (!parseResult.success) {
                console.warn(`Validation failed for CNPJ ${cleanCnpj}:`, parseResult.error);
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
            imported++;
        }
        catch (error) {
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
                    const updateData = {
                        chunksProcessed: newChunksProcessed,
                        validOscsSaved: newValidOscsSaved,
                        updatedAt: firestore_1.FieldValue.serverTimestamp()
                    };
                    if (newChunksProcessed >= (data?.totalChunks || 0)) {
                        updateData.status = 'completed';
                    }
                    transaction.update(jobRef, updateData);
                }
            });
        }
        catch (error) {
            console.error(`Error updating job ${jobId}:`, error);
        }
    }
    logger.info(`Chunk processing complete. Processed: ${processed}, Imported: ${imported}`);
});
exports.ingestOscDataFunction = (0, https_1.onCall)({
    cors: [/triade-assessoria\.web\.app$/, /triade-assessoria\.firebaseapp\.com$/, /localhost:/],
    timeoutSeconds: 540,
    memory: '1GiB',
    invoker: 'public',
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    const { uf, municipio, activityArea, aiPrompt, onlyActive } = request.data;
    if (!uf && !municipio) {
        throw new https_1.HttpsError('invalid-argument', 'Either uf or municipio filter is required.');
    }
    // 1. IPEA Discovery (Geographical Search)
    let oscList = [];
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
        }
        else if (uf) {
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during IPEA discovery';
        console.error('IPEA Discovery Error:', errorMessage);
        throw new https_1.HttpsError('internal', errorMessage);
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
    const queue = (0, functions_1.getFunctions)().taskQueue('processOscChunkWorker');
    const db = (0, firestore_1.getFirestore)();
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
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
async function routeEditalUrl(url, sourceContext, searchId, options) {
    if (url.toLowerCase().includes('prosas.com.br')) {
        logger.info(`[Smart Router] Routing Prosas link to authenticated worker: ${url}`);
        await (0, functions_1.getFunctions)().taskQueue('prosasAuthenticatedWorker').enqueue({ url, searchId: searchId || sourceContext });
        return { success: true, message: "Edital encaminhado para o raspador autenticado (Prosas)." };
    }
    try {
        const text = await fetchAndExtractText(url);
        if (!text || text.length < 500) {
            return { success: false, message: "Texto ausente ou muito curto." };
        }
        // Heuristic Pre-filter
        const textLower = text.toLowerCase();
        const essentialKeywords = ['edital', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'fomento', 'chamada pública', 'financiamento'];
        const hasKeyword = essentialKeywords.some(kw => textLower.includes(kw));
        if (!hasKeyword) {
            return { success: false, message: "Rejeitado pelo filtro heurístico pré-LLM (palavras-chave ausentes)." };
        }
        const triageResult = await triageEditalWebpage({ text, searchQuery: options?.searchQuery });
        if (triageResult.isValidEdital) {
            // Only fall back to sourceContext if searchId is strictly undefined
            await enqueueEditalExtraction(url, text, "Edital válido", searchId !== undefined ? searchId : sourceContext);
            return { success: true, message: "Edital válido" };
        }
        else {
            return { success: false, message: "Edital inválido" };
        }
    }
    catch (error) {
        logger.error(`[Smart Router] Error processing link ${url}:`, error);
        return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
    }
}
async function enqueueEditalExtraction(link, text, reason, searchId) {
    const db = (0, firestore_1.getFirestore)();
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        expireAt: expireAt
    });
    const queue = (0, functions_1.getFunctions)().taskQueue('extractionWorker');
    await queue.enqueue({
        searchId: searchId || null,
        link: link,
        contentId: tempContentRef.id,
        reason: reason
    });
    return tempContentRef.id;
}
exports.triggerMatchOrchestrator = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    const { editalId, oscId, forceRecalculate } = request.data;
    if (!editalId || !oscId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing editalId or oscId.');
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
    }
    catch (error) {
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
    // The automated fan-out to matchEvaluatorWorker and agenticSearchWorker has been removed
    // to prevent the "Thundering Herd" effect during mass ingestion of OSCs.
    // Agentic Search and matching should now be triggered manually via VIP requests
    // or via a decoupled slow-burn cron queue.
    console.log(`OSC ${oscId} updated successfully. Automated match cascades are disabled.`);
});
async function processRssFeeds() {
    const RSS_URLS = [
        // Mock Google Alerts RSS URLs
        "https://news.google.com/rss/search?q=edital+ONG+OR+OSC+brasil",
        "https://news.google.com/rss/search?q=financiamento+projetos+culturais+edital",
        // Prosas RSS with regional filters for Nordeste and Paraiba
        "https://blog.prosas.com.br/categoria/editais/feed/?tag=nordeste,paraiba"
    ];
    const parser = new rss_parser_1.default();
    const db = (0, firestore_1.getFirestore)();
    let processedCount = 0;
    let savedCount = 0;
    for (const feedUrl of RSS_URLS) {
        try {
            console.log(`Fetching RSS feed: ${feedUrl}`);
            const feed = await parser.parseURL(feedUrl);
            // Limit to top 5 items per feed to prevent token leaks
            const topItems = feed.items.slice(0, 5);
            for (const item of topItems) {
                if (!item.link)
                    continue;
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
                processedCount++;
                console.log(`Processing link: ${item.link}`);
                const routeResult = await routeEditalUrl(item.link, "RSS");
                console.log(`Router result for ${item.link}: success=${routeResult.success}, message=${routeResult.message}`);
                if (routeResult.success) {
                    savedCount++;
                }
            }
        }
        catch (error) {
            console.error(`Error fetching or parsing RSS feed ${feedUrl}:`, error);
        }
    }
    console.log(`Ingestion complete. Processed ${processedCount} items, saved ${savedCount} valid editais.`);
    return { processedCount, savedCount };
}
exports.ingestGoogleAlertsRss = (0, scheduler_1.onSchedule)('0 2 * * *', async () => {
    await processRssFeeds();
});
exports.ingestManualOscFunction = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    const { storagePaths } = request.data;
    if (!storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'Pelo menos um caminho de Storage é necessário.');
    }
    const bucket = (0, storage_1.getStorage)().bucket();
    const pdfBase64s = [];
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
        const oscRef = await (0, firestore_1.getFirestore)().collection('oscs').add({
            ...profileData,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            source: 'manual_ingest'
        });
        // Cleanup: Delete temporary files
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            }
            catch (cleanupError) {
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
    }
    catch (error) {
        console.error('Error in ingestManualOscFunction:', error);
        // Ensure cleanup happens even on failure
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            }
            catch (cleanupError) {
                console.error(`Failed to clean up temp file ${path} during error handling:`, cleanupError);
            }
        }
        throw new https_1.HttpsError('internal', 'Erro ao extrair dados dos documentos da OSC.');
    }
});
exports.ingestManualEditalFunction = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 540,
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const url = request.data.url;
    if (!url || typeof url !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'A valid URL is required.');
    }
    try {
        const routeResult = await routeEditalUrl(url, "MANUAL");
        if (!routeResult.success) {
            return { success: false, message: `O conteúdo não parece ser um edital válido. Motivo: ${routeResult.message}` };
        }
        return { success: true, editalId: "pending", message: routeResult.message };
    }
    catch (error) {
        console.error('Error in ingestManualEditalFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during manual edital ingestion.';
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
const searchDatabaseTool = ai.defineTool({
    name: 'searchDatabaseTool',
    description: 'Searches the Firestore database for NGOs (OSCs) and Editais (Grants) to find matches.',
    inputSchema: zod_1.z.object({
        city: zod_1.z.string().optional().describe("City name to filter NGOs"),
        state: zod_1.z.string().optional().describe("State abbreviation or name to filter NGOs"),
        activity: zod_1.z.string().optional().describe("Core activity to filter NGOs (e.g., 'Educação', 'Cultura')"),
        limit: zod_1.z.number().optional().default(10).describe("Maximum number of NGOs to return"),
    }),
    outputSchema: zod_1.z.object({
        oscs: zod_1.z.array(schemas_js_1.ngoProfileSchema.extend({ oscId: zod_1.z.string() })),
        editais: zod_1.z.array(schemas_js_1.editalSchema.extend({ editalId: zod_1.z.string() })),
    })
}, async (input) => {
    const db = (0, firestore_1.getFirestore)();
    // Fetch up to 5 editais for context
    const editaisSnapshot = await db.collection('editais').limit(5).get();
    const editais = editaisSnapshot.docs.map(doc => ({
        title: doc.data().title,
        importantDates: doc.data().importantDates,
        editalId: doc.id
    })); // Cast as any to bypass strict schema for minimal response
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
    })); // Cast as any to bypass strict schema for minimal response
    // Apply basic in-memory filters for simplicity given complex NoSQL querying constraints
    if (input.city) {
        const lowerCity = input.city.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oscs = oscs.filter((osc) => osc.location.toLowerCase().includes(lowerCity));
    }
    if (input.state) {
        const lowerState = input.state.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oscs = oscs.filter((osc) => osc.location.toLowerCase().includes(lowerState));
    }
    if (input.activity) {
        const lowerActivity = input.activity.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oscs = oscs.filter((osc) => (osc.coreActivities || []).some((act) => act.toLowerCase().includes(lowerActivity)));
    }
    // Return up to the requested limit
    oscs = oscs.slice(0, input.limit || 10);
    return {
        oscs,
        editais
    };
});
const copilotFlow = ai.defineFlow({
    name: 'copilotFlow',
    inputSchema: zod_1.z.object({
        prompt: zod_1.z.string().max(2000).describe("Natural language prompt from the user"),
    }),
    outputSchema: schemas_js_1.copilotResponseSchema,
}, async (input) => {
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
        output: { schema: schemas_js_1.copilotResponseSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao gerar resposta do Copilot");
    }
    return response.output;
});
exports.askCopilotFunction = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 300,
}, async (request) => {
    // Require authentication
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const uid = request.auth.uid;
    const db = (0, firestore_1.getFirestore)();
    const userRef = db.collection('users').doc(uid);
    const { prompt } = request.data;
    if (!prompt) {
        throw new https_1.HttpsError('invalid-argument', 'O prompt é obrigatório.');
    }
    if (prompt.length > 2000) {
        throw new https_1.HttpsError('invalid-argument', 'O prompt excede o limite máximo de 2000 caracteres.');
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
                        throw new https_1.HttpsError('resource-exhausted', 'Por favor, aguarde 10 segundos antes de enviar outra solicitação ao Copilot.');
                    }
                }
            }
            transaction.set(userRef, { lastCopilotRequest: now }, { merge: true });
        });
    }
    catch (error) {
        if (error.code === 'resource-exhausted') {
            throw error;
        }
        console.error('Error checking rate limit:', error);
        throw new https_1.HttpsError('internal', 'Erro interno ao verificar o limite de taxa.');
    }
    try {
        return await copilotFlow({ prompt });
    }
    catch (error) {
        console.error('Error in askCopilotFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during Copilot execution.';
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
exports.manualTriggerRssSyncFunction = (0, https_1.onCall)({
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
    }
    catch (error) {
        console.error('Error in manualTriggerRssSyncFunction:', error);
        const errorMessage = error instanceof Error ? error.message : 'Internal error during manual RSS sync.';
        throw new https_1.HttpsError('internal', errorMessage);
    }
});
exports.scheduledMatchSweeper = (0, scheduler_1.onSchedule)('0 0 * * 0', async () => {
    const db = (0, firestore_1.getFirestore)();
    // Safety Limit: Only sweep editais created in the last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const editaisSnapshot = await db.collection('editais')
        .where('createdAt', '>=', oneWeekAgo)
        .get();
    const queue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
    let enqueuedCount = 0;
    const MAX_ENQUEUES = 2000; // Global fail-safe limit for the sweeper
    for (const editalDoc of editaisSnapshot.docs) {
        if (enqueuedCount >= MAX_ENQUEUES) {
            console.log(`Sweeper reached safety limit of ${MAX_ENQUEUES} enqueues. Stopping.`);
            break;
        }
        const editalId = editalDoc.id;
        const editalData = editalDoc.data();
        const editalEmbedding = editalData.embedding;
        if (!editalEmbedding || !Array.isArray(editalEmbedding) || editalEmbedding.length === 0) {
            console.log(`Skipping edital ${editalId} because it lacks a valid embedding.`);
            continue;
        }
        // Check which OSCs already have matches for this Edital
        const matchesQuery = await db.collection('matches')
            .where('editalId', '==', editalId)
            .get();
        const matchedOscIds = new Set(matchesQuery.docs.map(doc => doc.data().oscId));
        // Retrieve top 50 nearest OSCs using Vector Search
        let oscsSnapshot;
        try {
            // Note: findNearest is available in Node.js Firestore SDK for Vector Search
            // We'll fallback to a regular query if not supported by types yet, but standard @google-cloud/firestore should support it
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            oscsSnapshot = await db.collection('oscs')
                .findNearest('embedding', editalEmbedding, { limit: 50, distanceMeasure: 'COSINE' })
                .get();
        }
        catch (error) {
            console.error(`Vector search failed for edital ${editalId}:`, error);
            continue;
        }
        const oscIds = oscsSnapshot.docs.map((doc) => doc.id);
        // Find missing oscIds
        const missingOscIds = oscIds.filter((id) => !matchedOscIds.has(id));
        const oscsToEnqueue = missingOscIds.slice(0, MAX_ENQUEUES - enqueuedCount);
        console.log(`Sweeping ${oscsToEnqueue.length} missing matches for Edital ${editalId}`);
        const enqueuePromises = oscsToEnqueue.map((oscId) => {
            return queue.enqueue({
                oscId: oscId,
                editalId: editalId
            });
        });
        await Promise.all(enqueuePromises);
        enqueuedCount += oscsToEnqueue.length;
    }
    console.log(`Weekly sweeper complete. Enqueued ${enqueuedCount} missing matches.`);
});
const notifications_js_1 = require("./services/notifications.js");
exports.onMatchGenerated = (0, firestore_2.onDocumentWritten)('matches/{matchId}', async (event) => {
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
        const db = (0, firestore_1.getFirestore)();
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
            const notificationService = new notifications_js_1.NotificationService(new notifications_js_1.MockNotificationProvider());
            await notificationService.notifyHighMatch({
                ngoName,
                editalTitle,
                score: currentScore,
                actionPlanSnippet
            });
            console.log(`Notification sent for match ${event.params.matchId} (Score: ${currentScore})`);
        }
        catch (error) {
            console.error("Error sending notification for match:", event.params.matchId, error);
        }
    }
});
exports.triggerAgenticSearch = (0, https_1.onCall)({
    cors: [/triade-assessoria\.web\.app$/, /triade-assessoria\.firebaseapp\.com$/, /localhost:/],
    timeoutSeconds: 300,
    invoker: 'public',
}, async (request) => {
    logger.info(`[Diagnostics] triggerAgenticSearch invoked.`);
    logger.info(`[Diagnostics] GCLOUD_PROJECT: ${process.env.GCLOUD_PROJECT || 'not set'}`);
    logger.info(`[Diagnostics] GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || 'not set'}`);
    try {
        const oscId = request.data.oscId;
        if (!oscId) {
            throw new https_1.HttpsError('invalid-argument', 'oscId is required');
        }
        const db = (0, firestore_1.getFirestore)();
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
            startedAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const agenticQueue = (0, functions_1.getFunctions)().taskQueue('agenticSearchWorker');
        await agenticQueue.enqueue({
            oscId: oscId,
            jobId: jobRef.id
        });
        return { success: true, message: `Busca agêntica enfileirada para OSC ${oscId}`, jobId: jobRef.id };
    }
    catch (error) {
        console.error("Error triggering agentic search:", error);
        throw formatGenkitError(error, 'Falha ao iniciar a busca agêntica.');
    }
});
exports.autonomousSearchWorker = (0, https_1.onCall)({
    enforceAppCheck: false
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    const { targetId, query } = request.data;
    logger.info(`Triggering background autonomous search. TargetId: ${targetId || 'All'}, Query: ${query}`);
    const db = (0, firestore_1.getFirestore)();
    // Fetch targets
    let targetsSnapshot;
    if (targetId) {
        const targetDoc = await db.collection('scraping_targets').doc(targetId).get();
        if (!targetDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Scraping target not found.');
        }
        targetsSnapshot = { docs: [targetDoc] };
    }
    else {
        targetsSnapshot = await db.collection('scraping_targets').get();
    }
    if (!targetsSnapshot || targetsSnapshot.docs.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'No scraping targets configured.');
    }
    const allTargets = targetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = allTargets.filter((t) => t.active !== false);
    if (targets.length === 0) {
        throw new https_1.HttpsError('failed-precondition', 'No active scraping targets available.');
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
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return {
        success: true,
        searchId: searchRef.id,
        message: 'Busca autônoma iniciada em segundo plano.'
    };
});
exports.triggerScrapingWorker = (0, https_1.onCall)({
    cors: true,
    timeoutSeconds: 300,
}, async (request) => {
    try {
        const targetId = request.data.targetId;
        if (!targetId) {
            throw new https_1.HttpsError('invalid-argument', 'targetId is required');
        }
        const db = (0, firestore_1.getFirestore)();
        const targetDoc = await db.collection('scraping_targets').doc(targetId).get();
        if (!targetDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Scraping target not found');
        }
        const targetData = { id: targetDoc.id, ...targetDoc.data() };
        // Create a tracking document just like autonomousSearchWorker does
        const searchRef = db.collection('searches').doc();
        await searchRef.set({
            query: `Manual Sync: ${targetData.name || targetData.id}`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            status: 'running',
            logs: [],
            totalTargets: 1,
            completedTargets: 0,
            processedCount: 0,
            savedCount: 0
        });
        const queue = (0, functions_1.getFunctions)().taskQueue('processScrapingTargetWorker');
        await queue.enqueue({
            searchId: searchRef.id,
            target: targetData,
            query: ''
        });
        return { success: true, message: `Sincronização iniciada para a fonte.`, searchId: searchRef.id };
    }
    catch (error) {
        console.error("Error triggering manual sync:", error);
        throw new https_1.HttpsError('internal', 'Falha ao iniciar a sincronização.');
    }
});
exports.seedScrapingTargets = (0, https_1.onCall)({
    enforceAppCheck: false
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
}, async (request) => {
    // TODO: Re-enable auth checks
    const db = (0, firestore_1.getFirestore)();
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
            createdAt: firestore_1.FieldValue.serverTimestamp()
        });
    }
    await batch.commit();
    return {
        success: true,
        message: `${targets.length} alvos de scraping oficiais inseridos com sucesso (dados anteriores removidos).`
    };
});
exports.extractionWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    const { searchId, link, contentId, reason } = request.data;
    if (!link || !contentId) {
        console.error("Invalid task payload: missing link, or contentId.");
        return;
    }
    const db = (0, firestore_1.getFirestore)();
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
        const editalResult = await (0, exports.extractEditalRules)({ text });
        const parseResult = schemas_js_1.editalSchema.safeParse(editalResult);
        if (parseResult.success) {
            let embedding = [];
            try {
                const editalData = parseResult.data;
                const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${editalData.eligibilityCriteria.allowedActivities?.join(', ') || ''}.`;
                embedding = await generateTextEmbedding(editalText);
            }
            catch (embedError) {
                console.warn("Failed to generate embedding for new edital:", embedError);
            }
            const editalDocData = {
                ...parseResult.data,
                rawText: text.substring(0, 5000),
                sourceUrl: link,
                embedding: embedding.length > 0 ? embedding : null,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            };
            const docRef = await db.collection('editais').add(editalDocData);
            if (searchRef) {
                const safeReason = reason ? reason.substring(0, 200) : '';
                await searchRef.set({
                    logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Importado', reason: safeReason }),
                    savedCount: firestore_1.FieldValue.increment(1)
                }, { merge: true });
            }
            // Handoff: Trigger Match Evaluator for agentic search if searchId contains an oscId pattern
            // Note: In agentic search, we passed oscId in place of searchId in enqueueEditalExtraction
            if (searchId && searchId !== "MANUAL" && searchId !== "RSS" && searchId.length > 15) {
                try {
                    const matchQueue = (0, functions_1.getFunctions)().taskQueue('matchEvaluatorWorker');
                    await matchQueue.enqueue({
                        oscId: searchId,
                        editalId: docRef.id
                    });
                    console.log(`Enqueued match evaluation for new edital ${docRef.id} and OSC ${searchId}`);
                }
                catch (matchErr) {
                    console.error("Failed to enqueue match evaluator:", matchErr);
                }
            }
        }
        else {
            if (searchRef) {
                await searchRef.set({
                    logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Erro', reason: 'Falha na validação do schema do edital.' })
                }, { merge: true });
            }
        }
        // Cleanup the temporary content document only on success (to allow retries on error)
        try {
            await contentRef.delete();
        }
        catch (cleanupError) {
            console.error(`Failed to delete temporary content document ${contentId}:`, cleanupError);
        }
    }
    catch (error) {
        console.error(`Error in extractionWorker for link ${link}:`, error);
        if (searchRef) {
            const rawErrorMsg = error instanceof Error ? error.message : 'Erro desconhecido na extração';
            const safeErrorMsg = rawErrorMsg ? rawErrorMsg.substring(0, 200) : '';
            await searchRef.set({
                logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Erro', reason: safeErrorMsg })
            }, { merge: true });
        }
        throw error;
    }
});
async function handleScraperFailure(db, targetId, errorMsg) {
    if (!targetId)
        return;
    const targetRef = db.collection('scraping_targets').doc(targetId);
    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(targetRef);
        if (!doc.exists)
            return;
        const currentCount = doc.data()?.failureCount || 0;
        const newCount = currentCount + 1;
        const updateData = {
            failureCount: newCount,
            lastFailedAt: firestore_1.FieldValue.serverTimestamp(),
            disabledReason: errorMsg
        };
        if (newCount >= 3) {
            updateData.active = false;
            logger.error(`Circuit Breaker triggered for target ${targetId}. Disabled due to ${newCount} consecutive failures: ${errorMsg}`);
        }
        transaction.update(targetRef, updateData);
    });
}
async function handleScraperSuccess(db, targetId) {
    if (!targetId)
        return;
    const targetRef = db.collection('scraping_targets').doc(targetId);
    await targetRef.update({ failureCount: 0 });
}
exports.prosasAuthenticatedWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 2 },
    timeoutSeconds: 1800,
    memory: '4GiB'
}, async (request) => {
    const { url, searchId } = request.data;
    if (!url) {
        logger.error("Invalid task payload: missing url.");
        return;
    }
    logger.info(`[Prosas Auth Worker] Starting processing for URL: ${url}`);
    try {
        // 1. Fetch Session State from GCS
        const storage = (0, storage_1.getStorage)();
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
        }
        catch (e) {
            logger.warn('[Prosas Auth Worker] Failed to read or parse session state. Triggering inline renewal...', e);
            await renewProsasSessionInternal();
            await storage.bucket(sessionBucketName).file(sessionFileName).download({ destination: sessionFilePath });
        }
        // 2. Playwright Scraping
        playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
        const browser = await playwright_extra_1.chromium.launch({
            args: chromium_1.default.args,
            executablePath: await chromium_1.default.executablePath(),
            headless: true,
        });
        let combinedText = '';
        const downloadedPdfPaths = [];
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
                const storage = (0, storage_1.getStorage)();
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
                        }
                        catch (parseErr) {
                            logger.error(`[Prosas Auth Worker] Error parsing PDF text for ${pdfUrl}:`, parseErr);
                        }
                        combinedText += `\n[Anexo PDF: ${publicUrl}]\nConteúdo Extraído (Max 5 pags): ${parsedText.substring(0, 10000)}`;
                    }
                    catch (pdfErr) {
                        logger.error(`[Prosas Auth Worker] Error processing PDF ${pdfUrl}:`, pdfErr);
                    }
                }
            }
            else {
                logger.info(`[Prosas Auth Worker] No PDF links found on page.`);
            }
            // 4. Push to Claim Check (Lake of Editais)
            await enqueueEditalExtraction(url, combinedText, "Authenticated Prosas Scraping", searchId);
            logger.info(`[Prosas Auth Worker] Enqueued extraction for ${url}`);
        }
        finally {
            await browser.close();
            // Clean up session file
            if (fs.existsSync(sessionFilePath)) {
                fs.unlinkSync(sessionFilePath);
            }
        }
    }
    catch (error) {
        logger.error(`[Prosas Auth Worker] Fatal error processing ${url}`, error);
        const db = (0, firestore_1.getFirestore)();
        // Use a base64 encoded URL or a safe hash as document ID, but querying is simpler.
        // We'll use a hash or just URL string if it's short, but Firestore doc IDs can't contain slashes.
        // Safer to just query for the document to update it.
        const failuresRef = db.collection('failed_ingestions');
        const querySnapshot = await failuresRef.where('url', '==', url).limit(1).get();
        const retryCount = request.retryCount || 0;
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
                    failedAt: firestore_1.FieldValue.serverTimestamp(),
                    isPermanent: true
                });
            }
            else {
                await querySnapshot.docs[0].ref.update({
                    failedAt: firestore_1.FieldValue.serverTimestamp(),
                    isPermanent: true,
                    reason: errorMessage
                });
            }
            // Don't throw to stop retrying
        }
        else {
            if (querySnapshot.empty) {
                await failuresRef.add({
                    url: url,
                    attempts: retryCount + 1,
                    lastFailedAt: firestore_1.FieldValue.serverTimestamp(),
                    isPermanent: false
                });
            }
            else {
                await querySnapshot.docs[0].ref.update({
                    attempts: retryCount + 1,
                    lastFailedAt: firestore_1.FieldValue.serverTimestamp()
                });
            }
            throw error;
        }
    }
});
exports.processScrapingTargetWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 540,
    memory: '1GiB'
}, async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query, page = 1, linksQueue = [] } = request.data;
    if (!searchId || !target) {
        console.error("Invalid task payload: missing searchId or target.");
        return;
    }
    const db = (0, firestore_1.getFirestore)();
    const searchRef = db.collection('searches').doc(searchId);
    logger.info(`[Scraper] Starting processing for target: ${target.name} | URL: ${target.url} | Page: ${page} | Strategy: ${target.strategy}`);
    try {
        let totalProcessed = 0;
        let candidateLinks = linksQueue;
        let isNewFetch = false;
        if (candidateLinks.length === 0) {
            isNewFetch = true;
            try {
                let fetchUrl = target.url;
                const isProsas = target.name?.toLowerCase().includes('prosas') || fetchUrl.toLowerCase().includes('prosas.com.br');
                if (isProsas) {
                    fetchUrl = `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D=${page}&page%5Bsize%5D=20&&sort=`;
                }
                else {
                    if (fetchUrl.includes('{{page}}')) {
                        fetchUrl = fetchUrl.replace(/\{\{page\}\}/g, String(page));
                    }
                    else if (page > 1) {
                        if (target.strategy === 'AUTO') {
                            fetchUrl = fetchUrl.includes('?') ? `${fetchUrl}&page=${page}` : `${fetchUrl}?page=${page}`;
                        }
                        else if (target.strategy !== 'RSS') {
                            logger.info(`[Scraper] Stopping pagination for ${target.name}. No {{page}} pattern defined and page is ${page}.`);
                            return;
                        }
                    }
                }
                logger.info(`[Scraper] Fetching URL: ${fetchUrl}`);
                if (isProsas) {
                    playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
                    const browser = await playwright_extra_1.chromium.launch({
                        args: chromium_1.default.args,
                        executablePath: await chromium_1.default.executablePath(),
                        headless: true,
                    });
                    try {
                        const pageContext = await browser.newPage();
                        await pageContext.goto(fetchUrl, { waitUntil: 'networkidle' });
                        const jsonContent = await pageContext.evaluate(() => document.body.innerText);
                        const data = JSON.parse(jsonContent);
                        if (data && data.data && Array.isArray(data.data)) {
                            candidateLinks = data.data.map((item) => `https://prosas.com.br/editais/${item.id}`);
                        }
                        if (candidateLinks.length === 0) {
                            logger.info(`[Scraper] No links found for Prosas on page ${page}. Stopping pagination.`);
                        }
                    }
                    catch (e) {
                        logger.warn(`Prosas API fetch failed for ${target.name}: ${e.message}`);
                        await handleScraperFailure(db, target.id, `Prosas API fetch failed: ${e.message}`);
                    }
                    finally {
                        await browser.close();
                    }
                }
                else if (target.strategy === 'RSS') {
                    const parser = new rss_parser_1.default();
                    const feed = await parser.parseURL(fetchUrl);
                    candidateLinks = feed.items.map(item => item.link).filter(link => !!link);
                }
                else if (target.strategy === 'API') {
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
                    }
                    else {
                        logger.warn(`API fetch failed for ${target.name}: ${response.statusText}`);
                        await handleScraperFailure(db, target.id, `API fetch failed: ${response.statusText}`);
                    }
                }
                else if (target.strategy === 'HTML') {
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
                                }
                                catch {
                                    // Ignore
                                }
                            }
                        });
                        candidateLinks = [...new Set(candidateLinks)];
                    }
                    else {
                        logger.warn(`HTML fetch failed for ${target.name}: ${statusText}`);
                        await handleScraperFailure(db, target.id, `HTML fetch failed: ${statusText}`);
                    }
                }
                else if (target.strategy === 'AUTO') {
                    const isRss = fetchUrl.toLowerCase().endsWith('.xml') || fetchUrl.toLowerCase().includes('feed');
                    if (isRss) {
                        try {
                            const parser = new rss_parser_1.default();
                            const feed = await parser.parseURL(fetchUrl);
                            candidateLinks = feed.items.map(item => item.link).filter(link => !!link);
                        }
                        catch {
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
                                    const parser = new rss_parser_1.default();
                                    const feed = await parser.parseString(html);
                                    candidateLinks = feed.items.map(item => item.link).filter(link => !!link);
                                }
                                catch {
                                    logger.warn(`Failed to parse XML response as RSS for ${fetchUrl}`);
                                }
                            }
                            else {
                                const $ = cheerio.load(html);
                                const rssLink = $('link[type="application/rss+xml"]').attr('href');
                                if (rssLink) {
                                    try {
                                        const absoluteRssUrl = new URL(rssLink, fetchUrl).href;
                                        const parser = new rss_parser_1.default();
                                        const feed = await parser.parseURL(absoluteRssUrl);
                                        candidateLinks = feed.items.map(item => item.link).filter(link => !!link);
                                    }
                                    catch {
                                        logger.warn(`Failed to parse discovered RSS feed`);
                                    }
                                }
                                if (candidateLinks.length === 0) {
                                    let rawLinks = [];
                                    $('a').each((_, el) => {
                                        let href = $(el).attr('href');
                                        if (href) {
                                            try {
                                                href = new URL(href, fetchUrl).href;
                                                rawLinks.push(href);
                                            }
                                            catch {
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
                        }
                        else {
                            logger.warn(`AUTO fetch failed for ${target.name}: ${statusText}`);
                            await handleScraperFailure(db, target.id, `AUTO fetch failed: ${statusText}`);
                        }
                    }
                }
            }
            catch (error) {
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
            if (!link)
                continue;
            const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (!existingRef.empty) {
                totalProcessed++;
                continue;
            }
            try {
                const routeResult = await routeEditalUrl(link, searchId, searchId, { searchQuery: query });
                const safeReason = routeResult.message ? routeResult.message.substring(0, 200) : '';
                if (routeResult.success) {
                    await searchRef.update({
                        logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Em Processamento (Extração)', reason: safeReason })
                    });
                }
                else {
                    await searchRef.update({
                        logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Ignorado/Rejeitado', reason: safeReason })
                    });
                }
            }
            catch (error) {
                console.error(`Error processing link ${link} from ${target.name}:`, error);
                const rawErrorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
                const safeErrorMsg = rawErrorMsg ? rawErrorMsg.substring(0, 200) : '';
                await searchRef.update({
                    logs: firestore_1.FieldValue.arrayUnion({ link, status: 'Erro', reason: safeErrorMsg })
                });
            }
            totalProcessed++;
        }
        const queue = (0, functions_1.getFunctions)().taskQueue('processScrapingTargetWorker');
        if (remainingLinks.length > 0) {
            // Still have links from the current page to process
            await queue.enqueue({
                searchId,
                target,
                query,
                page,
                linksQueue: remainingLinks
            });
        }
        else if (candidateLinks.length > 0 && target.strategy !== 'RSS' && page < 100) {
            // Finished current page's links, fetch next page
            await queue.enqueue({
                searchId,
                target,
                query,
                page: page + 1,
                linksQueue: []
            });
        }
        else if (remainingLinks.length === 0) {
            // No more links to process, and no next page to fetch (either RSS, reached end, or max pages)
            await searchRef.update({
                completedTargets: firestore_1.FieldValue.increment(1)
            });
        }
        if (totalProcessed > 0) {
            await searchRef.update({
                processedCount: firestore_1.FieldValue.increment(totalProcessed)
            });
        }
    }
    catch (error) {
        console.error('Error during autonomous search target worker:', error);
    }
});
exports.onSearchCreated = (0, firestore_2.onDocumentCreated)({ document: 'searches/{searchId}' }, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    const searchId = event.params.searchId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targets = data.targets || [];
    const db = (0, firestore_1.getFirestore)();
    const searchRef = db.collection('searches').doc(searchId);
    const queue = (0, functions_1.getFunctions)().taskQueue('processScrapingTargetWorker');
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
    }
    catch (error) {
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
    playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
    const browser = await playwright_extra_1.chromium.launch({
        args: chromium_1.default.args,
        executablePath: await chromium_1.default.executablePath(),
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
        const storage = (0, storage_1.getStorage)();
        const bucket = storage.bucket('triade-prosas-session-state');
        await bucket.upload(outputFile, {
            destination: 'prosas_session.json',
            metadata: { contentType: 'application/json' }
        });
        logger.info('[Prosas Session Internal] Successfully uploaded session state to GCS.');
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }
    }
    catch (error) {
        logger.error('[Prosas Session Internal] Failed to renew session:', error);
        throw error;
    }
    finally {
        await browser.close();
    }
}
exports.renewProsasSessionCron = (0, scheduler_1.onSchedule)({
    schedule: '0 3 * * *',
    timeoutSeconds: 300,
    memory: '2GiB'
}, async (event) => {
    try {
        await renewProsasSessionInternal();
    }
    catch (error) {
        logger.error('[Prosas Session Cron] Cron execution failed:', error);
    }
});
exports.prosasBulkDiscoveryWorker = (0, tasks_1.onTaskDispatched)({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 1 },
    timeoutSeconds: 1800,
    memory: '2GiB'
}, async (request) => {
    let { page = 1, consecutiveZeroNewCount = 0 } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const queue = (0, functions_1.getFunctions)().taskQueue('prosasAuthenticatedWorker');
    logger.info(`[Prosas Bulk Discovery] Starting processing for page ${page}`);
    let browser = null;
    try {
        // Fetch Session State from GCS to bypass Cloudflare/auth wall
        const storage = (0, storage_1.getStorage)();
        const sessionBucketName = 'triade-prosas-session-state';
        const sessionFileName = 'prosas_session.json';
        logger.info(`[Prosas Bulk Discovery] Downloading session state from gs://${sessionBucketName}/${sessionFileName} directly into memory`);
        let [fileContent] = await storage.bucket(sessionBucketName).file(sessionFileName).download();
        let sessionData = JSON.parse(fileContent.toString('utf-8'));
        if (!sessionData.cookies || sessionData.cookies.length === 0) {
            logger.warn('[Prosas Bulk Discovery] Downloaded session appears invalid (no cookies). Triggering inline renewal...');
            await renewProsasSessionInternal();
            const [newFileContent] = await storage.bucket(sessionBucketName).file(sessionFileName).download();
            fileContent = newFileContent;
            sessionData = JSON.parse(fileContent.toString('utf-8'));
        }
        playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
        browser = await playwright_extra_1.chromium.launch({
            args: chromium_1.default.args,
            executablePath: await chromium_1.default.executablePath(),
            headless: true,
        });
        const context = await browser.newContext({ storageState: sessionData });
        const playwrightPage = await context.newPage();
        // Navigate directly to the search UI page
        const searchUrl = `https://prosas.com.br/editais?page=${page}`;
        logger.info(`[Prosas Bulk Discovery] Navigating to search URL to extract DOM: ${searchUrl}`);
        await playwrightPage.goto(searchUrl, { waitUntil: 'networkidle', timeout: 60000 });
        // Simulate human behavior and wait for content to load
        logger.info(`[Prosas Bulk Discovery] Simulating human behavior and waiting for DOM rendering...`);
        await playwrightPage.waitForTimeout(Math.floor(Math.random() * 3000) + 2000);
        await playwrightPage.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 500) + 200));
        await playwrightPage.waitForTimeout(Math.floor(Math.random() * 2000) + 1000);
        // Extract edital links directly from the rendered HTML DOM
        logger.info(`[Prosas Bulk Discovery] Extracting edital links from DOM...`);
        const links = await playwrightPage.evaluate(() => {
            return Array.from(document.querySelectorAll('a[href*="/editais/"]')).map((a) => a.href);
        });
        // Deduplicate the extracted links
        let candidateLinks = [...new Set(links)];
        // Filter out URLs that are exactly the list page itself or don't follow the ID pattern
        candidateLinks = candidateLinks.filter(url => {
            const match = url.match(/\/editais\/(\d+)$/);
            return match !== null;
        });
        if (candidateLinks.length === 0) {
            logger.info(`[Prosas Bulk Discovery] No unique edital links found for Prosas on page ${page}. Stopping pagination.`);
            return;
        }
        logger.info(`[Prosas Bulk Discovery] Discovered ${candidateLinks.length} unique edital links on Page ${page}`);
        let newCount = 0;
        for (const link of candidateLinks) {
            const querySnapshot = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();
            if (querySnapshot.empty) {
                // Enqueue with a random delay between 20s and 60s
                const randomDelaySec = Math.floor(Math.random() * (60 - 20 + 1)) + 20;
                const scheduleTime = new Date(Date.now() + randomDelaySec * 1000);
                await queue.enqueue({
                    url: link,
                    searchId: 'BULK_DISCOVERY'
                }, {
                    scheduleTime: scheduleTime
                });
                newCount++;
            }
        }
        logger.info(`[Prosas Bulk Discovery] Enqueued ${newCount} new editais for authenticated scraping.`);
        if (newCount === 0) {
            consecutiveZeroNewCount++;
        }
        else {
            consecutiveZeroNewCount = 0;
        }
        if (consecutiveZeroNewCount >= 3) {
            logger.info(`[Prosas Bulk Discovery] Encountered 3 consecutive pages with 0 new editais. Early exit triggered.`);
            return;
        }
        // Enqueue next page
        const discoveryQueue = (0, functions_1.getFunctions)().taskQueue('prosasBulkDiscoveryWorker');
        await discoveryQueue.enqueue({ page: page + 1, consecutiveZeroNewCount });
        logger.info(`[Prosas Bulk Discovery] Enqueued page ${page + 1} for discovery.`);
    }
    catch (e) {
        logger.error(`[Prosas Bulk Discovery] Prosas API fetch failed: ${e.message}`);
        throw e;
    }
    finally {
        if (browser) {
            await browser.close();
        }
    }
});
//# sourceMappingURL=index.js.map