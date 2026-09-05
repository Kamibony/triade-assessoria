"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapingTargetSchema = exports.copilotResponseSchema = exports.triageSchema = exports.matchSchema = exports.bureaucracySchema = exports.editalSchema = exports.ngoProfileSchema = void 0;
const zod_1 = require("zod");
exports.ngoProfileSchema = zod_1.z.object({
    name: zod_1.z.string().describe("Nome da ONG"),
    cnpj: zod_1.z.string().optional().describe("CNPJ da ONG"),
    mission: zod_1.z.string().optional().describe("Missão ou Foco de atuação da ONG (extraído do Estatuto)"),
    boardValidity: zod_1.z.string().optional().describe("Validade da diretoria (extraído da ATA)"),
    foundationDate: zod_1.z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: zod_1.z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: zod_1.z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: zod_1.z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: zod_1.z.array(zod_1.z.string()).describe("Lista de atividades principais da ONG"),
    embedding: zod_1.z.array(zod_1.z.number()).optional().describe("Vetor de embedding para busca semântica")
});
exports.editalSchema = zod_1.z.object({
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
    }).describe("Critérios de elegibilidade do edital"),
    embedding: zod_1.z.array(zod_1.z.number()).optional().describe("Vetor de embedding para busca semântica")
});
exports.bureaucracySchema = zod_1.z.object({
    passesBureaucracy: zod_1.z.boolean().describe("Se a ONG passa nas regras burocráticas (tempo, localização, documentos, prazo)"),
    rejectionReason: zod_1.z.string().nullable().optional().describe("Se rejeitada, o motivo claro. Se aprovada, null.")
});
exports.matchSchema = zod_1.z.object({
    editalId: zod_1.z.string().describe("ID do edital analisado"),
    oscId: zod_1.z.string().describe("ID da ONG analisada"),
    oscName: zod_1.z.string().optional().describe("Nome da ONG analisada"),
    matchScore: zod_1.z.number().min(0).max(100).describe("Score de match entre a ONG e o Edital (0 a 100)"),
    eligibility: zod_1.z.boolean().describe("Se a ONG é elegível (true) ou não (false)"),
    reasoning: zod_1.z.string().nullable().optional().describe("Justificativa detalhada do AI para o score e elegibilidade (nulo se falhar no portão 1 ou inelegível)"),
    aiSummary: zod_1.z.string().optional().describe("Um resumo conciso de 1-2 frases sobre a compatibilidade"),
    badges: zod_1.z.array(zod_1.z.string()).optional().describe("Lista de tags ou selos (ex: 'Alto Alinhamento', 'Prazo Curto', 'Regional')"),
    actionPlan: zod_1.z.array(zod_1.z.string()).optional().describe("Plano de Ação sugerido caso a ONG não seja elegível ou tenha score baixo (opcional/pular para poupar tokens se inelegível claro)"),
    actionState: zod_1.z.enum(['Pendente', 'Aprovado', 'Rejeitado', 'Revisao']).optional().default('Pendente').describe("Estado de feedback humano sobre o match")
});
exports.triageSchema = zod_1.z.object({
    isValidEdital: zod_1.z.boolean().describe("True se a página contiver as regras de um edital ou for o documento oficial do edital. False se for apenas uma notícia SOBRE o edital.")
});
exports.copilotResponseSchema = zod_1.z.object({
    matchedOscs: zod_1.z.array(zod_1.z.object({
        oscId: zod_1.z.string().describe("ID da ONG"),
        name: zod_1.z.string().describe("Nome da ONG"),
        location: zod_1.z.string().describe("Localização da ONG"),
        coreActivities: zod_1.z.array(zod_1.z.string()).describe("Principais atividades da ONG"),
        reasoning: zod_1.z.string().describe("Breve explicação do porquê esta ONG é um bom match")
    })).describe("Lista de ONGs que melhor correspondem à pesquisa"),
    outreachMessage: zod_1.z.string().describe("Mensagem de contato (email ou WhatsApp) rascunhada, personalizada para engajar essas ONGs e informá-las sobre a oportunidade"),
    explanation: zod_1.z.string().describe("Explicação geral sobre os resultados encontrados para o operador")
});
exports.scrapingTargetSchema = zod_1.z.object({
    name: zod_1.z.string().describe("Nome da fonte do edital (ex: Prosas)"),
    url: zod_1.z.string().describe("URL do endpoint, feed RSS, ou página HTML"),
    strategy: zod_1.z.enum(['RSS', 'API', 'HTML']).describe("Estratégia de extração"),
    cssSelector: zod_1.z.string().optional().describe("Seletor CSS para extrair os links (apenas para a estratégia HTML)")
});
//# sourceMappingURL=schemas.js.map