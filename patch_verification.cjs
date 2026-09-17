const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const searchBlock1 = `        // Update the match document with the result
        await matchRef.update({
             verificationResult: verificationResult,
             ...(hasRejections ? { eligibility: false } : {}),
             updatedAt: FieldValue.serverTimestamp()
        });`;

const replaceBlock1 = `        // Update the match document with the result
        await matchRef.update({
             verificationResult: verificationResult,
             eligibility: !hasRejections,
             updatedAt: FieldValue.serverTimestamp()
        });`;

const searchBlock2 = `            await matchRef.update({
                 verificationResult: verificationResult,
                 ...(hasRejections ? { eligibility: false } : {}),
                 updatedAt: FieldValue.serverTimestamp()
            });`;

const replaceBlock2 = `            await matchRef.update({
                 verificationResult: verificationResult,
                 eligibility: !hasRejections,
                 updatedAt: FieldValue.serverTimestamp()
            });`;

content = content.replace(searchBlock1, replaceBlock1);
content = content.replace(searchBlock2, replaceBlock2);
fs.writeFileSync('functions/src/index.ts', content);
