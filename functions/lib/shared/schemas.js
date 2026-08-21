"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triageSchema = exports.matchSchema = exports.editalSchema = exports.ngoProfileSchema = void 0;
const zod_1 = require("zod");
exports.ngoProfileSchema = zod_1.z.object({
    name: zod_1.z.string().describe("Nome da ONG"),
    foundationDate: zod_1.z.string().describe("Data de fundação da ONG (YYYY-MM-DD)"),
    location: zod_1.z.string().describe("Localização da sede (Cidade/Estado)"),
    documentationStatus: zod_1.z.enum(['Em dia', 'Pendente', 'Irregular']).describe("Status das certidões negativas e documentação básica"),
    previousProjectsApproved: zod_1.z.boolean().describe("Se a ONG já teve projetos culturais aprovados anteriormente"),
    coreActivities: zod_1.z.array(zod_1.z.string()).describe("Lista de atividades principais da ONG")
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
exports.triageSchema = zod_1.z.object({
    isValidEdital: zod_1.z.boolean().describe("True se a página contiver as regras de um edital ou for o documento oficial do edital. False se for apenas uma notícia SOBRE o edital."),
    reason: zod_1.z.string().describe("Justificativa para a decisão")
});
//# sourceMappingURL=schemas.js.map