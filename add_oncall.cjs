const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const newOnCallCode = `
export const triggerMatchOrchestrator = onCall({
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { editalId, oscId, forceRecalculate } = request.data;

    if (!editalId || !oscId) {
        throw new HttpsError('invalid-argument', 'Missing editalId or oscId.');
    }

    try {
        const matchResult = await processMatchEvaluation(oscId, editalId, forceRecalculate);
        return matchResult;
    } catch (error: any) {
        console.error('Error generating match:', error);
        throw new HttpsError('internal', error.message || 'Internal error generating match.');
    }
});
`;

content += '\n' + newOnCallCode;

fs.writeFileSync('functions/src/index.ts', content);
