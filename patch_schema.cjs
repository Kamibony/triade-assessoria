const fs = require('fs');
const file = './functions/src/shared/schemas.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/export const verificationResultSchema = z.array\(z.object\({[\s\S]*?}\)\)\.describe\("Resultado da verificação do advogado do diabo"\);/,
`export const verificationResultSchema = z.array(z.object({
    criterion: z.enum(['Localização', 'Prazo', 'Fundação', 'Documentação']).describe("O critério avaliado"),
    status: z.enum(['Aprovado', 'Reprovado', 'Pendente de Informação']).describe("Status da avaliação do critério (NUNCA use Não Encontrado)"),
    citation: z.string().describe("Citação exata do edital que justifica o status, ou explique porque está pendente")
})).length(4).describe("Resultado da verificação do advogado do diabo. Exatamente 4 itens obrigatórios.");`
);

fs.writeFileSync(file, code);
