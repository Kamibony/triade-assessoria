import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFunctions } from 'firebase-admin/functions';
import * as admin from 'firebase-admin';
import { genkit } from 'genkit';
import { z } from 'zod';
import { vertexAI } from '@genkit-ai/google-genai';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import * as logger from 'firebase-functions/logger';
import { ngoProfileSchema, editalSchema, matchSchema, triageSchema, copilotResponseSchema } from './shared/schemas.js';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';

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
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Simple backoff
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
        maxConcurrentDispatches: 5,
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
            // 1. Get CNPJ from IPEA
            const oscDetailsRes = await fetchWithRetry(`https://mapaosc.ipea.gov.br/api/api/osc/${id_osc}`);
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

    await Promise.all(enqueuePromises);
    console.log(`Enqueued ${editaisSnapshot.docs.length} match tasks for OSC update ${oscId}.`);
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
                        const editalResult = await extractEditalRules({ text });
                        const parseResult = editalSchema.safeParse(editalResult);

                        if (parseResult.success) {
                            const editalDocData = {
                                ...parseResult.data,
                                rawText: text.substring(0, 5000), // Save a snippet
                                sourceUrl: item.link,
                                createdAt: FieldValue.serverTimestamp(),
                            };

                            const editalRef = db.collection('editais').doc();
                            await editalRef.set(editalDocData);
                            savedCount++;
                            console.log(`Successfully saved Edital from ${item.link}`);
                        } else {
                            console.warn(`Validation failed for extracted Edital from ${item.link}:`, parseResult.error);
                        }
                    } catch (e) {
                         console.error(`Error extracting rules for ${item.link}:`, e);
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

        const editalResult = await extractEditalRules({ text });
        const parseResult = editalSchema.safeParse(editalResult);

        if (!parseResult.success) {
            return { success: false, message: "Falha na formatação dos dados estruturados do edital pelo modelo de IA." };
        }

        const db = getFirestore();
        const editalDocData = {
            ...parseResult.data,
            rawText: text.substring(0, 5000), // Save a snippet
            sourceUrl: url,
            createdAt: FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('editais').add(editalDocData);
        return { success: true, editalId: docRef.id, message: "Edital adicionado com sucesso." };

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


export const processScrapingTargetWorker = onTaskDispatched({
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 30 },
    rateLimits: { maxConcurrentDispatches: 5 },
    timeoutSeconds: 540
}, async (request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query } = request.data as { searchId: string, target: any, query?: string };

    if (!searchId || !target) {
        console.error("Invalid task payload: missing searchId or target.");
        return;
    }

    const db = getFirestore();
    const searchRef = db.collection('searches').doc(searchId);

    try {
        let totalProcessed = 0;
        let totalSaved = 0;
        let candidateLinks: string[] = [];

        try {
            if (target.strategy === 'RSS') {
                const parser = new Parser();
                const feed = await parser.parseURL(target.url);
                candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
            } else if (target.strategy === 'API') {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(target.url, {
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
                }
            } else if (target.strategy === 'HTML') {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const response = await fetch(target.url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                    }
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const html = await response.text();
                    const $ = cheerio.load(html);
                    const selector = target.cssSelector || 'a';

                    $(selector).each((_, el) => {
                        let href = $(el).attr('href');
                        if (href) {
                            try {
                                href = new URL(href, target.url).href;
                                candidateLinks.push(href);
                            } catch {
                                // Ignore
                            }
                        }
                    });
                    candidateLinks = [...new Set(candidateLinks)];
                } else {
                    logger.warn(`HTML fetch failed for ${target.name}: ${response.statusText}`);
                }
            } else if (target.strategy === 'AUTO') {
                const isRss = target.url.toLowerCase().endsWith('.xml') || target.url.toLowerCase().includes('feed');
                if (isRss) {
                    try {
                        const parser = new Parser();
                        const feed = await parser.parseURL(target.url);
                        candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                    } catch {
                        logger.warn(`Direct RSS parsing failed for ${target.url}`);
                    }
                }

                if (candidateLinks.length === 0) {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    const response = await fetch(target.url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                        }
                    });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const contentType = response.headers.get('content-type') || '';
                        const html = await response.text();

                        if (contentType.includes('xml') || contentType.includes('rss')) {
                            try {
                                const parser = new Parser();
                                const feed = await parser.parseString(html);
                                candidateLinks = feed.items.map(item => item.link).filter(link => !!link) as string[];
                            } catch {
                                logger.warn(`Failed to parse XML response as RSS for ${target.url}`);
                            }
                        } else {
                            const $ = cheerio.load(html);
                            const rssLink = $('link[type="application/rss+xml"]').attr('href');
                            if (rssLink) {
                                try {
                                    const absoluteRssUrl = new URL(rssLink, target.url).href;
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
                                            href = new URL(href, target.url).href;
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
                        logger.warn(`AUTO fetch failed for ${target.name}: ${response.statusText}`);
                    }
                }
            }
        } catch (error) {
            logger.error(`Error extracting links for target ${target.name}:`, error);
        }

        const linksToProcess = candidateLinks.slice(0, 10);

        for (let i = 0; i < linksToProcess.length; i++) {
            const link = linksToProcess[i];
            if (!link) continue;

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

                const triageResult = await triageEditalWebpage({ text, searchQuery: query });

                if (triageResult.isValidEdital) {
                    const editalResult = await extractEditalRules({ text });
                    const parseResult = editalSchema.safeParse(editalResult);

                    if (parseResult.success) {
                        const editalDocData = {
                            ...parseResult.data,
                            rawText: text.substring(0, 5000),
                            sourceUrl: link,
                            createdAt: FieldValue.serverTimestamp(),
                        };

                        await db.collection('editais').add(editalDocData);
                        await searchRef.update({
                            logs: FieldValue.arrayUnion({ link, status: 'Importado', reason: triageResult.reason })
                        });
                        totalSaved++;
                    } else {
                         await searchRef.update({
                             logs: FieldValue.arrayUnion({ link, status: 'Erro', reason: 'Falha na validação do schema do edital.' })
                         });
                    }
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

        await searchRef.update({
            processedCount: FieldValue.increment(totalProcessed),
            savedCount: FieldValue.increment(totalSaved),
            completedTargets: FieldValue.increment(1)
        });

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
