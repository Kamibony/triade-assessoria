import { z } from 'zod';

export const ngoProfileSchema = z.object({
    name: z.string().describe("Nome da ONG"),
    foundationDate: z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: z.array(z.string()).describe("Lista de atividades principais da ONG")
});

export const editalSchema = z.object({
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
