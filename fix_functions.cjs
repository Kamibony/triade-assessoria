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

// Add getStorage import
if (!content.includes("import { getStorage } from 'firebase-admin/storage';")) {
  content = content.replace(
      /import \{ getFirestore, FieldValue \} from 'firebase-admin\/firestore';/,
      `import { getFirestore, FieldValue } from 'firebase-admin/firestore';\nimport { getStorage } from 'firebase-admin/storage';`
  );
}

// Update parsePdfProfileFunction to handle base64 array
content = content.replace(
    /export const parsePdfProfileFunction = onCall\(\{[\s\S]*?return await parsePdfToProfile\(request\.data\);\n\}\);/,
    `export const parsePdfProfileFunction = onCall({
    cors: true
}, async (request) => {
    // TODO: Re-enable auth checks once Auth is implemented.
    // if (!request.auth) {
    //     throw new HttpsError('unauthenticated', 'User must be authenticated.');
    // }
    return await parsePdfToProfile({ pdfBase64s: request.data.pdfBase64 ? [request.data.pdfBase64] : request.data.pdfBase64s || [] });
});`
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

    const { storagePaths } = request.data as { storagePaths?: string[] };
    if (!storagePaths || !Array.isArray(storagePaths) || storagePaths.length === 0) {
        throw new HttpsError('invalid-argument', 'Pelo menos um caminho de Storage é necessário.');
    }

    const bucket = getStorage().bucket();
    const pdfBase64s: string[] = [];

    try {
        // Download and convert PDFs to Base64
        for (const path of storagePaths) {
            const file = bucket.file(path);
            const [exists] = await file.exists();
            if (!exists) {
                throw new Error(\`Arquivo não encontrado no Storage: \${path}\`);
            }
            const [buffer] = await file.download();
            pdfBase64s.push(buffer.toString('base64'));
        }

        const profileData = await parsePdfToProfile({ pdfBase64s });

        // Save to Firestore
        const oscRef = await getFirestore().collection('oscs').add({
            ...profileData,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: 'manual_ingest'
        });

        // Cleanup: Delete temporary files
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            } catch (cleanupError) {
                console.error(\`Failed to clean up temp file \${path}:\`, cleanupError);
            }
        }

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

        // Ensure cleanup happens even on failure
        for (const path of storagePaths) {
            try {
                await bucket.file(path).delete();
            } catch (cleanupError) {
                console.error(\`Failed to clean up temp file \${path} during error handling:\`, cleanupError);
            }
        }
        throw new HttpsError('internal', 'Erro ao extrair dados dos documentos da OSC.');
    }
});
`;

content = content.replace(
    /export const ingestManualEditalFunction = onCall\(/,
    `${ingestManualOscFunctionStr}\n\nexport const ingestManualEditalFunction = onCall(`
);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
