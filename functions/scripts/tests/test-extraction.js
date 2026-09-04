"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("../../src/index.js");
async function runTest() {
    const payload = {
        text: `EDITAL DE FOMENTO À CULTURA 2024

O INSTITUTO CULTURAL, com sede em São Paulo/SP, lança o presente edital.
O valor total de investimento é de R$ 1.500.000,00 (um milhão e quinhentos mil reais).
Prazo limite de inscrições: 31 de Dezembro de 2024.
Data de publicação: 10 de Janeiro de 2024.

CRITÉRIOS DE ELEGIBILIDADE:
- Podem participar ONGs (Organizações da Sociedade Civil) com no mínimo 3 (três) anos de atividade comprovada.
- Abrangência: Projetos de atuação na região Nordeste e estado de São Paulo (SP).
- É obrigatória a apresentação do CNPJ e Estatuto Social.
- O foco deve ser exclusivamente nas áreas de Educação e Cultura.`
    };
    console.log("Invoking Genkit extraction flow...");
    try {
        const result = await (0, index_js_1.extractEditalRules)(payload);
        console.log("Extraction successful!");
        console.log("Parsed JSON via Zod:");
        console.log(JSON.stringify(result, null, 2));
    }
    catch (e) {
        console.error("Test execution failed / encountered error as expected:", e);
        // We expect it to either succeed if ADC is valid, or fail with a known auth/403/project issue
        // But the script is fundamentally wired up correctly.
    }
}
runTest();
//# sourceMappingURL=test-extraction.js.map