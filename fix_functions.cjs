const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    'const oscData = oscDoc.data() as z.infer<typeof ngoProfileSchema> & { updatedAt?: admin.firestore.Timestamp };',
    'const oscData = oscDoc.data() as z.infer<typeof ngoProfileSchema> & { updatedAt?: any };'
);
content = content.replace(
    'const editalData = editalDoc.data() as z.infer<typeof editalSchema> & { updatedAt?: admin.firestore.Timestamp };',
    'const editalData = editalDoc.data() as z.infer<typeof editalSchema> & { updatedAt?: any };'
);

content = content.replace(
    'if (!forceRecalculate && existingMatchData && existingMatchData.createdAt) {',
    'if (!forceRecalculate && existingMatchData && existingMatchData.createdAt && existingMatchData.createdAt.toMillis) {'
);
content = content.replace(
    'const oscUpdateTime = oscData.updatedAt ? oscData.updatedAt.toMillis() : 0;',
    'const oscUpdateTime = oscData.updatedAt && oscData.updatedAt.toMillis ? oscData.updatedAt.toMillis() : 0;'
);
content = content.replace(
    'const editalUpdateTime = editalData.updatedAt ? editalData.updatedAt.toMillis() : 0;',
    'const editalUpdateTime = editalData.updatedAt && editalData.updatedAt.toMillis ? editalData.updatedAt.toMillis() : 0;'
);


fs.writeFileSync('functions/src/index.ts', content);
