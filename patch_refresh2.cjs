const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

const oldBlock = `    await jobRef.set({
        targetId,
        targetType: 'osc',
        type: 'batch_verification',
        totalTasks: validInternalMatches.length,
        completedTasks: 0,
        failedTasks: 0,
        status: 'running',
        matchesTriggered: validInternalMatches.length,
        matchesEvaluated: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });`;

const newBlock = `    await jobRef.set({
        targetId,
        targetType: 'osc',
        type: 'batch_verification',
        totalTasks: validInternalMatches.length,
        completedTasks: 0,
        failedTasks: 0,
        status: 'running', // Changed from running so we can update it to completed after dispatch
        matchesTriggered: validInternalMatches.length,
        matchesEvaluated: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
    });`;

content = content.replace(oldBlock, newBlock);
fs.writeFileSync('functions/src/index.ts', content);
