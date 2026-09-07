const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
`        // Heuristic Pre-filter
        const textLower = text.toLowerCase();
        const essentialKeywords = ['edital', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'fomento', 'chamada pública', 'financiamento'];
        const hasKeyword = essentialKeywords.some(kw => textLower.includes(kw));

        if (!hasKeyword) {
             return { success: false, message: "Rejeitado pelo filtro heurístico pré-LLM (palavras-chave ausentes no texto extraído)." };
        }`,
`        // Heuristic Pre-filter (Stricter AND gate)
        const textLower = text.toLowerCase();
        const primaryKeywords = ['edital', 'chamada pública', 'processo seletivo', 'fomento', 'regulamento'];
        const secondaryKeywords = ['inscrições abertas', 'inscrição', 'inscrições', 'prazo', 'cronograma', 'financiamento', 'submissão'];

        const hasPrimary = primaryKeywords.some(kw => textLower.includes(kw));
        const hasSecondary = secondaryKeywords.some(kw => textLower.includes(kw));

        if (!(hasPrimary && hasSecondary)) {
             return { success: false, message: "Rejeitado pelo filtro heurístico pré-LLM (ausência de combinação primária+secundária de palavras-chave)." };
        }`
);

content = content.replace(
`                                    rawLinks = [...new Set(rawLinks)];
                                    const excludePatterns = [/sobre/i, /contato/i, /\\.jpg$/i, /\\.png$/i, /facebook\\.com/i, /instagram\\.com/i, /twitter\\.com/i, /mailto:/i, /login/i, /entrar/i];
                                    const preFiltered = rawLinks.filter(link => !excludePatterns.some(pattern => pattern.test(link)));
                                    const selectionResult = await selectEditalLinksFlow({ links: preFiltered });
                                    candidateLinks = selectionResult.selectedLinks;`,
`                                    rawLinks = [...new Set(rawLinks)];
                                    const excludePatterns = [/sobre/i, /contato/i, /\\.jpg$/i, /\\.png$/i, /facebook\\.com/i, /instagram\\.com/i, /twitter\\.com/i, /mailto:/i, /login/i, /entrar/i];
                                    const includePatterns = [/\\/edital\\//i, /\\/chamada\\//i, /edital/i, /inscricoes/i, /inscrições/i, /processo-seletivo/i, /\\.pdf$/i];
                                    const preFiltered = rawLinks.filter(link => !excludePatterns.some(pattern => pattern.test(link)));
                                    candidateLinks = preFiltered.filter(link => includePatterns.some(pattern => pattern.test(link)));`
);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
