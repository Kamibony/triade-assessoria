const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// Update parsePdfToProfile to accept multiple PDFs
content = content.replace(
    /const parsePdfToProfile = ai\.defineFlow\([\s\S]*?async \(input\) => \{[\s\S]*?const prompt = `Você é um especialista em análise de documentos legais de ONGs no Brasil\.[\s\S]*?Sempre retorne os dados em português do Brasil \(pt-BR\)\.`;/,
`const parsePdfToProfile = ai.defineFlow(
    {
        name: 'parsePdfToProfile',
        inputSchema: z.object({
            pdfBase64s: z.array(z.string()).describe("Arquivos PDF codificados em Base64"),
        }),
        outputSchema: ngoProfileSchema,
    },
    async (input) => {
        const prompt = \`Você é um especialista em análise de documentos legais de ONGs no Brasil.
Eu enviarei o Estatuto Social, Cartão CNPJ e/ou ATA de uma ONG.
Extraia as informações necessárias e preencha o perfil da ONG (ngoProfileSchema) com precisão.
Você DEVE extrair o CNPJ, Nome (Legal Name), Missão/Foco de atuação (do Estatuto) e a Validade da Diretoria (da ATA).
Se o documento não mencionar o status da documentação, presuma 'Pendente'. Se não houver clareza sobre projetos anteriores, presuma falso.
Sempre retorne os dados em português do Brasil (pt-BR).\`;`
);

content = content.replace(
    /messages: \[\s*\{\s*role: 'user',\s*content: \[\s*\{\s*text: prompt\s*\},[\s\S]*?\{ media: \{ url: `data:application\/pdf;base64,\$\{input\.pdfBase64\}` \} \}\s*\]\}\s*\]/,
`messages: [
                { role: 'user', content: [
                    { text: prompt },
                    ...input.pdfBase64s.map(pdf => ({ media: { url: \`data:application/pdf;base64,\${pdf}\` } }))
                ]}
            ]`
);

// Add ingestManualOscFunction
const ingestManualOscFunctionStr = `
export const ingestManualOscFunction = onCall({
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }

    const { pdfBase64s } = request.data as { pdfBase64s?: string[] };
    if (!pdfBase64s || !Array.isArray(pdfBase64s) || pdfBase64s.length === 0) {
        throw new HttpsError('invalid-argument', 'Pelo menos um PDF em Base64 é necessário.');
    }

    try {
        const profileData = await parsePdfToProfile({ pdfBase64s });

        // Save to Firestore
        const oscRef = await getFirestore().collection('oscs').add({
            ...profileData,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: 'manual_ingest'
        });

        return {
            success: true,
            oscId: oscRef.id,
            profile: {
                ...profileData,
                id: oscRef.id
            }
        };
    } catch (error: unknown) {
        console.error('Error in ingestManualOscFunction:', error);
        throw new HttpsError('internal', 'Erro ao extrair dados dos documentos da OSC.');
    }
});
`;

content = content.replace(
    /export const ingestManualEditalFunction = onCall\(/,
    `${ingestManualOscFunctionStr}\n\nexport const ingestManualEditalFunction = onCall(`
);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
