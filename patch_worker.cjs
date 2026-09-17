const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const searchBlock = `            const jobDoc = await jobRef.get();
            const data = jobDoc.data();
            // Check if status is completed (meaning dispatching is fully done) before marking evaluations complete
            if (data && data.status === 'completed' && data.matchesEvaluated >= data.matchesTriggered) {
                await jobRef.update({
                    evaluationsCompleted: true,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }`;

const replaceBlock = `            const jobDoc = await jobRef.get();
            const data = jobDoc.data();
            // Update job to completed if all evaluated
            if (data && data.matchesEvaluated >= data.matchesTriggered) {
                await jobRef.update({
                    status: 'completed',
                    evaluationsCompleted: true,
                    updatedAt: FieldValue.serverTimestamp()
                });
            }`;

content = content.replace(searchBlock, replaceBlock);
fs.writeFileSync('functions/src/index.ts', content);
