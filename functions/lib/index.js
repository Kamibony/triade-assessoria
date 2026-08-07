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
exports.checkEligibilityFunction = exports.parsePdfProfileFunction = exports.eligibilityChecker = exports.parsePdfToProfile = exports.eligibilityResultSchema = exports.ngoProfileSchema = exports.ai = void 0;
const admin = __importStar(require("firebase-admin"));
const genkit_1 = require("genkit");
const googleai_1 = require("@genkit-ai/googleai");
const params_1 = require("firebase-functions/params");
const zod_1 = require("zod");
const googleai_2 = require("@genkit-ai/googleai");
const https_1 = require("firebase-functions/https");
admin.initializeApp();
const geminiApiKey = (0, params_1.defineSecret)('GEMINI_API_KEY');
exports.ai = (0, genkit_1.genkit)({
    plugins: [(0, googleai_1.googleAI)()],
});
exports.ngoProfileSchema = zod_1.z.object({
    name: zod_1.z.string().describe("Nome da ONG"),
    foundationDate: zod_1.z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: zod_1.z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: zod_1.z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: zod_1.z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: zod_1.z.array(zod_1.z.string()).describe("Lista de atividades principais da ONG")
});
exports.eligibilityResultSchema = zod_1.z.object({
    eligible: zod_1.z.boolean().describe("Se a ONG é elegível para o Edital nº 023/2026"),
    reasoning: zod_1.z.string().describe("Explicação detalhada do motivo da elegibilidade ou inelegibilidade"),
    recommendations: zod_1.z.array(zod_1.z.string()).describe("Lista de recomendações acionáveis para a ONG melhorar sua chance de aprovação ou se adequar ao edital"),
    actionPlan: zod_1.z.array(zod_1.z.string()).optional().describe("Plano de Adequação: passo a passo estruturado para regularização (apenas se inelegível)")
});
exports.parsePdfToProfile = exports.ai.defineFlow({
    name: 'parsePdfToProfile',
    inputSchema: zod_1.z.object({
        pdfBase64: zod_1.z.string().describe("Arquivo PDF codificado em Base64"),
    }),
    outputSchema: exports.ngoProfileSchema,
}, async (input) => {
    const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social ou Cartão CNPJ de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).`;
    const response = await exports.ai.generate({
        model: googleai_2.gemini20ProExp0205,
        messages: [
            { role: 'user', content: [
                    { text: prompt },
                    { media: { url: `data:application/pdf;base64,${input.pdfBase64}` } }
                ] }
        ],
        output: { schema: exports.ngoProfileSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao extrair dados do PDF");
    }
    return response.output;
});
exports.eligibilityChecker = exports.ai.defineFlow({
    name: 'eligibilityChecker',
    inputSchema: exports.ngoProfileSchema,
    outputSchema: exports.eligibilityResultSchema,
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
    const response = await exports.ai.generate({
        model: googleai_2.gemini20ProExp0205,
        prompt: prompt,
        output: { schema: exports.eligibilityResultSchema }
    });
    if (!response.output) {
        throw new Error("Falha ao gerar resposta de elegibilidade");
    }
    return response.output;
});
exports.parsePdfProfileFunction = (0, https_1.onCallGenkit)({
    secrets: [geminiApiKey]
}, exports.parsePdfToProfile);
exports.checkEligibilityFunction = (0, https_1.onCallGenkit)({
    secrets: [geminiApiKey]
}, exports.eligibilityChecker);
//# sourceMappingURL=index.js.map