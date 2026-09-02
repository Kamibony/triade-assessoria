import { z } from 'zod';

export const ngoProfileSchema = z.object({
    name: z.string().describe("Nome da ONG"),
    cnpj: z.string().optional().describe("CNPJ da ONG"),
    mission: z.string().optional().describe("Missão ou Foco de atuação da ONG (extraído do Estatuto)"),
    boardValidity: z.string().optional().describe("Validade da diretoria (extraído da ATA)"),
    foundationDate: z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: z.array(z.string()).describe("Lista de atividades principais da ONG"),
    embedding: z.array(z.number()).optional().describe("Vetor de embedding para busca semântica")
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
    }).describe("Critérios de elegibilidade do edital"),
    embedding: z.array(z.number()).optional().describe("Vetor de embedding para busca semântica")
});

export const matchSchema = z.object({
    editalId: z.string().describe("ID do edital analisado"),
    oscId: z.string().describe("ID da ONG analisada"),
    oscName: z.string().optional().describe("Nome da ONG analisada"),
    matchScore: z.number().min(0).max(100).describe("Score de match entre a ONG e o Edital (0 a 100)"),
    eligibility: z.boolean().describe("Se a ONG é elegível (true) ou não (false)"),
    reasoning: z.string().describe("Justificativa detalhada do AI para o score e elegibilidade"),
    aiSummary: z.string().optional().describe("Um resumo conciso de 1-2 frases sobre a compatibilidade"),
    badges: z.array(z.string()).optional().describe("Lista de tags ou selos (ex: 'Alto Alinhamento', 'Prazo Curto', 'Regional')"),
    actionPlan: z.array(z.string()).optional().describe("Plano de Ação sugerido caso a ONG não seja elegível ou tenha score baixo")
});

export const triageSchema = z.object({
    isValidEdital: z.boolean().describe("True se a página contiver as regras de um edital ou for o documento oficial do edital. False se for apenas uma notícia SOBRE o edital.")
});

export const copilotResponseSchema = z.object({
    matchedOscs: z.array(z.object({
        oscId: z.string().describe("ID da ONG"),
        name: z.string().describe("Nome da ONG"),
        location: z.string().describe("Localização da ONG"),
        coreActivities: z.array(z.string()).describe("Principais atividades da ONG"),
        reasoning: z.string().describe("Breve explicação do porquê esta ONG é um bom match")
    })).describe("Lista de ONGs que melhor correspondem à pesquisa"),
    outreachMessage: z.string().describe("Mensagem de contato (email ou WhatsApp) rascunhada, personalizada para engajar essas ONGs e informá-las sobre a oportunidade"),
    explanation: z.string().describe("Explicação geral sobre os resultados encontrados para o operador")
});

export const scrapingTargetSchema = z.object({
    name: z.string().describe("Nome da fonte do edital (ex: Prosas)"),
    url: z.string().describe("URL do endpoint, feed RSS, ou página HTML"),
    strategy: z.enum(['RSS', 'API', 'HTML']).describe("Estratégia de extração"),
    cssSelector: z.string().optional().describe("Seletor CSS para extrair os links (apenas para a estratégia HTML)")
});
