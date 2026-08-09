import * as admin from 'firebase-admin';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
import { gemini20ProExp0205 } from '@genkit-ai/googleai';
import { onCallGenkit } from 'firebase-functions/https';

admin.initializeApp();

const geminiApiKey = defineSecret('GEMINI_API_KEY');

export const ai = genkit({
    plugins: [googleAI()],
});

export const ngoProfileSchema = z.object({
    name: z.string().describe("Nome da ONG"),
    foundationDate: z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: z.array(z.string()).describe("Lista de atividades principais da ONG")
});

export const eligibilityResultSchema = z.object({
    eligible: z.boolean().describe("Se a ONG é elegível para o Edital nº 023/2026"),
    reasoning: z.string().describe("Explicação detalhada do motivo da elegibilidade ou inelegibilidade"),
    recommendations: z.array(z.string()).describe("Lista de recomendações acionáveis para a ONG melhorar sua chance de aprovação ou se adequar ao edital"),
    actionPlan: z.array(z.string()).optional().describe("Plano de Adequação: passo a passo estruturado para regularização (apenas se inelegível)")
});

export const parsePdfToProfile = ai.defineFlow(
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
            model: gemini20ProExp0205,
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

export const eligibilityChecker = ai.defineFlow(
    {
        name: 'eligibilityChecker',
        inputSchema: ngoProfileSchema,
        outputSchema: eligibilityResultSchema,
    },
    async (profile) => {
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
            model: gemini20ProExp0205,
            prompt: prompt,
            output: { schema: eligibilityResultSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar resposta de elegibilidade");
        }
        return response.output;
    }
);

export const parsePdfProfileFunction = onCallGenkit({
    secrets: [geminiApiKey],
    cors: true
}, parsePdfToProfile);

export const checkEligibilityFunction = onCallGenkit({
    secrets: [geminiApiKey],
    cors: true
}, eligibilityChecker);
