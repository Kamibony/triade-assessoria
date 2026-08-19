import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { genkit } from 'genkit';
import { z } from 'zod';
import { vertexAI } from '@genkit-ai/google-genai';
import { onCall } from 'firebase-functions/v2/https';

admin.initializeApp();

const ai = genkit({
    plugins: [vertexAI({ projectId: 'triade-assessoria', location: 'us-central1' })],
});

const ngoProfileSchema = z.object({
    name: z.string().describe("Nome da ONG"),
    foundationDate: z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: z.array(z.string()).describe("Lista de atividades principais da ONG")
});

const editalSchema = z.object({
    title: z.string().describe("Título do edital"),
    issuer: z.string().describe("Órgão emissor ou financiador do edital"),
    publicationDate: z.string().describe("Data de publicação do edital (YYYY-MM-DD)"),
    deadline: z.string().describe("Data limite para inscrições ou submissões (YYYY-MM-DD)"),
    totalBudget: z.number().describe("Orçamento total previsto no edital"),
    eligibilityCriteria: z.object({
        minYearsActive: z.number().describe("Mínimo de anos de atividade exigido da ONG"),
        requiredLocations: z.array(z.string()).describe("Lista de estados ou cidades exigidos para participação (ex: ['PB', 'PE'])"),
        requiredDocumentation: z.array(z.string()).describe("Lista de documentações exigidas"),
        allowedActivities: z.array(z.string()).describe("Lista de atividades permitidas ou focos de atuação"),
    }).describe("Critérios de elegibilidade do edital")
});


export const matchSchema = z.object({
    editalId: z.string().describe("ID do edital analisado"),
    oscId: z.string().describe("ID da ONG analisada"),
    matchScore: z.number().min(0).max(100).describe("Score de match entre a ONG e o Edital (0 a 100)"),
    eligibility: z.boolean().describe("Se a ONG é elegível (true) ou não (false)"),
    reasoning: z.string().describe("Justificativa detalhada do AI para o score e elegibilidade"),
    actionPlan: z.array(z.string()).optional().describe("Plano de Ação sugerido caso a ONG não seja elegível ou tenha score baixo")
});


const eligibilityResultSchema = z.object({
    eligible: z.boolean().describe("Se a ONG é elegível para o Edital nº 023/2026"),
    reasoning: z.string().describe("Explicação detalhada do motivo da elegibilidade ou inelegibilidade"),
    recommendations: z.array(z.string()).describe("Lista de recomendações acionáveis para a ONG melhorar sua chance de aprovação ou se adequar ao edital"),
    actionPlan: z.array(z.string()).optional().describe("Plano de Adequação: passo a passo estruturado para regularização (apenas se inelegível)")
});

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

const eligibilityChecker = ai.defineFlow(
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
            model: 'vertexai/gemini-2.5-flash',
            prompt: prompt,
            output: { schema: eligibilityResultSchema }
        });

        if (!response.output) {
            throw new Error("Falha ao gerar resposta de elegibilidade");
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

export const checkEligibilityFunction = onCall({
    cors: true
}, async (request) => {
    return await eligibilityChecker(request.data);
});

export const extractEditalRulesFunction = onCall({
    cors: true
}, async (request) => {
    return await extractEditalRules(request.data);
});



export const triggerMatchOrchestrator = onCall({
    cors: true
}, async (request) => {
    const data = request.data as { oscId: string; editalId: string };
    if (!data.oscId || !data.editalId) {
        throw new Error("Missing oscId or editalId");
    }

    const db = getFirestore();
    const oscDoc = await db.collection('oscs').doc(data.oscId).get();
    const editalDoc = await db.collection('editais').doc(data.editalId).get();

    if (!oscDoc.exists || !editalDoc.exists) {
        throw new Error("OSC or Edital not found");
    }

    const oscData = oscDoc.data();
    const editalData = editalDoc.data();

    // Call Genkit Flow
    const matchResult = await scoreMatch({
        osc: oscData as z.infer<typeof ngoProfileSchema>,
        edital: editalData as z.infer<typeof editalSchema>,
        oscId: data.oscId,
        editalId: data.editalId
    });

    // Save to Firestore matches collection
    const matchRef = db.collection('matches').doc();
    await matchRef.set({
        ...matchResult,
        id: matchRef.id,
        createdAt: FieldValue.serverTimestamp()
    });

    return { matchId: matchRef.id, ...matchResult };
});
