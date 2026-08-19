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
Object.defineProperty(exports, "__esModule", { value: true });
exports.onEditalCreated = exports.extractEditalRulesFunction = exports.parsePdfProfileFunction = exports.matchSchema = void 0;
const firestore_1 = require("firebase-admin/firestore");
const admin = __importStar(require("firebase-admin"));
const genkit_1 = require("genkit");
const zod_1 = require("zod");
const google_genai_1 = require("@genkit-ai/google-genai");
const https_1 = require("firebase-functions/v2/https");
admin.initializeApp();
const ai = (0, genkit_1.genkit)({
    plugins: [(0, google_genai_1.vertexAI)({ projectId: 'triade-assessoria', location: 'us-central1' })],
});
const ngoProfileSchema = zod_1.z.object({
    name: zod_1.z.string().describe("Nome da ONG"),
    foundationDate: zod_1.z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: zod_1.z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: zod_1.z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: zod_1.z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: zod_1.z.array(zod_1.z.string()).describe("Lista de atividades principais da ONG")
});
const editalSchema = zod_1.z.object({
    title: zod_1.z.string().describe("Título do edital"),
    issuer: zod_1.z.string().describe("Órgão emissor ou financiador do edital"),
    publicationDate: zod_1.z.string().describe("Data de publicação do edital (YYYY-MM-DD)"),
    deadline: zod_1.z.string().describe("Data limite para inscrições ou submissões (YYYY-MM-DD)"),
    totalBudget: zod_1.z.number().describe("Orçamento total previsto no edital"),
    eligibilityCriteria: zod_1.z.object({
        minYearsActive: zod_1.z.number().describe("Mínimo de anos de atividade exigido da ONG"),
        requiredLocations: zod_1.z.array(zod_1.z.string()).describe("Lista de estados ou cidades exigidos para participação (ex: ['PB', 'PE'])"),
        requiredDocumentation: zod_1.z.array(zod_1.z.string()).describe("Lista de documentações exigidas"),
        allowedActivities: zod_1.z.array(zod_1.z.string()).describe("Lista de atividades permitidas ou focos de atuação"),
    }).describe("Critérios de elegibilidade do edital")
});
exports.matchSchema = zod_1.z.object({
    editalId: zod_1.z.string().describe("ID do edital analisado"),
    oscId: zod_1.z.string().describe("ID da ONG analisada"),
    matchScore: zod_1.z.number().min(0).max(100).describe("Score de match entre a ONG e o Edital (0 a 100)"),
    eligibility: zod_1.z.boolean().describe("Se a ONG é elegível (true) ou não (false)"),
    reasoning: zod_1.z.string().describe("Justificativa detalhada do AI para o score e elegibilidade"),
    actionPlan: zod_1.z.array(zod_1.z.string()).optional().describe("Plano de Ação sugerido caso a ONG não seja elegível ou tenha score baixo")
});
const parsePdfToProfile = ai.defineFlow({
    name: 'parsePdfToProfile',
    inputSchema: zod_1.z.object({
        pdfBase64: zod_1.z.string().describe("Arquivo PDF codificado em Base64"),
    }),
    outputSchema: ngoProfileSchema,
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
        output: { schema: ngoProfileSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair dados do PDF");
    }
    return response.output;
});
const scoreMatch = ai.defineFlow({
    name: 'scoreMatch',
    inputSchema: zod_1.z.object({
        osc: ngoProfileSchema,
        edital: editalSchema,
        oscId: zod_1.z.string(),
        editalId: zod_1.z.string()
    }),
    outputSchema: exports.matchSchema,
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
        output: { schema: exports.matchSchema }
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
    outputSchema: editalSchema,
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
        output: { schema: editalSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair as regras do edital");
    }
    return response.output;
});
exports.extractEditalRulesFunction = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return await extractEditalRules(request.data);
});
const firestore_2 = require("firebase-functions/v2/firestore");
exports.onEditalCreated = (0, firestore_2.onDocumentCreated)('editais/{editalId}', async (event) => {
    const editalSnapshot = event.data;
    if (!editalSnapshot) {
        console.log("No data associated with the event.");
        return;
    }
    const editalData = editalSnapshot.data();
    const editalId = event.params.editalId;
    const db = (0, firestore_1.getFirestore)();
    const oscsSnapshot = await db.collection('oscs').get();
    const BATCH_SIZE = 10;
    let successful = 0;
    let failed = 0;
    for (let i = 0; i < oscsSnapshot.docs.length; i += BATCH_SIZE) {
        const chunk = oscsSnapshot.docs.slice(i, i + BATCH_SIZE);
        const matchPromises = chunk.map(async (oscDoc) => {
            const oscData = oscDoc.data();
            const oscId = oscDoc.id;
            try {
                const matchResult = await scoreMatch({
                    osc: oscData,
                    edital: editalData,
                    oscId: oscId,
                    editalId: editalId
                });
                const matchRef = db.collection('matches').doc();
                await matchRef.set({
                    ...matchResult,
                    id: matchRef.id,
                    createdAt: firestore_1.FieldValue.serverTimestamp()
                });
                console.log(`Successfully processed match for OSC ${oscId} and Edital ${editalId}`);
                return matchResult;
            }
            catch (error) {
                console.error(`Failed to process match for OSC ${oscId} and Edital ${editalId}`, error);
                throw error; // Rethrow to be caught by allSettled
            }
        });
        const results = await Promise.allSettled(matchPromises);
        successful += results.filter(r => r.status === 'fulfilled').length;
        failed += results.filter(r => r.status === 'rejected').length;
    }
    console.log(`Batch matchmaking complete. ${successful} successful, ${failed} failed.`);
});
//# sourceMappingURL=index.js.map