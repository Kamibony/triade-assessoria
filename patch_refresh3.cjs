const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const searchBlock = `    await Promise.all(enqueuePromises);

    return { success: true, jobId, message: \`\${validInternalMatches.length} novas oportunidades enfileiradas para avaliação.\` };
});`;

const replaceBlock = `    await Promise.all(enqueuePromises);

    // Resolve race condition where evaluations finish before job dispatch is complete
    const finalJobDoc = await jobRef.get();
    const finalJobData = finalJobDoc.data();
    if (finalJobData && finalJobData.matchesEvaluated >= validInternalMatches.length) {
        await jobRef.update({
            status: 'completed',
            evaluationsCompleted: true,
            updatedAt: FieldValue.serverTimestamp()
        });
    }

    return { success: true, jobId, message: \`\${validInternalMatches.length} novas oportunidades enfileiradas para avaliação.\` };
});`;

content = content.replace(searchBlock, replaceBlock);
fs.writeFileSync('functions/src/index.ts', content);
