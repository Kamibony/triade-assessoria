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
exports.triggerMatchOrchestrator = exports.extractEditalRulesFunction = exports.checkEligibilityFunction = exports.parsePdfProfileFunction = exports.matchSchema = void 0;
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
const eligibilityResultSchema = zod_1.z.object({
    eligible: zod_1.z.boolean().describe("Se a ONG é elegível para o Edital nº 023/2026"),
    reasoning: zod_1.z.string().describe("Explicação detalhada do motivo da elegibilidade ou inelegibilidade"),
    recommendations: zod_1.z.array(zod_1.z.string()).describe("Lista de recomendações acionáveis para a ONG melhorar sua chance de aprovação ou se adequar ao edital"),
    actionPlan: zod_1.z.array(zod_1.z.string()).optional().describe("Plano de Adequação: passo a passo estruturado para regularização (apenas se inelegível)")
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
const eligibilityChecker = ai.defineFlow({
    name: 'eligibilityChecker',
    inputSchema: ngoProfileSchema,
    outputSchema: eligibilityResultSchema,
}, async (profile) => {
    const prompt = `Você é um agente especialista em avaliação de projetos culturais para leis de incentivo no Brasil, atuando pela Tríade Assessoria.

A sua tarefa é analisar o perfil de uma ONG e determinar se ela é elegível para participar do Edital do ICMS Cultural da Paraíba (Edital nº 023/2026).
Para ser elegível, a ONG deve ter pelo menos 2 anos de fundação, estar localizada no estado da Paraíba (PB), ter documentação 'Em dia' e realizar atividades no setor cultural.

Perfil da ONG:
Nome: ${profile.name}
Data de Fundação: ${profile.foundationDate}
Localização: ${profile.location}
Status da Documentação: ${profile.documentationStatus}
Projetos Culturais Anteriores: ${profile.previousProjectsApproved ? 'Sim' : 'Não'}
Atividades Principais: ${profile.coreActivities.join(', ')}

Avalie os critérios, forneça uma justificativa clara e inclua recomendações.
Se a ONG for INELEGÍVEL, você DEVE gerar um 'actionPlan' (Plano de Adequação) com um passo a passo estruturado e detalhado para que a ONG possa corrigir suas pendências (ex: regularizar certidões, alterar estatuto, etc.) e se inscrever em editais futuros.
Responda estritamente em português do Brasil (pt-BR).`;
    const response = await ai.generate({
        model: 'vertexai/gemini-2.5-flash',
        prompt: prompt,
        output: { schema: eligibilityResultSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao gerar resposta de elegibilidade");
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
exports.checkEligibilityFunction = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    return await eligibilityChecker(request.data);
});
exports.extractEditalRulesFunction = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    return await extractEditalRules(request.data);
});
exports.triggerMatchOrchestrator = (0, https_1.onCall)({
    cors: true
}, async (request) => {
    const data = request.data;
    if (!data.oscId || !data.editalId) {
        throw new Error("Missing oscId or editalId");
    }
    const db = (0, firestore_1.getFirestore)();
    const oscDoc = await db.collection('oscs').doc(data.oscId).get();
    const editalDoc = await db.collection('editais').doc(data.editalId).get();
    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error("OSC or Edital not found");
    }
    const oscData = oscDoc.data();
    const editalData = editalDoc.data();
    // Call Genkit Flow
    const matchResult = await scoreMatch({
        osc: oscData,
        edital: editalData,
        oscId: data.oscId,
        editalId: data.editalId
    });
    // Save to Firestore matches collection
    const matchRef = db.collection('matches').doc();
    await matchRef.set({
        ...matchResult,
        id: matchRef.id,
        createdAt: firestore_1.FieldValue.serverTimestamp()
    });
    return { matchId: matchRef.id, ...matchResult };
});
//# sourceMappingURL=index.js.map