const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');
content = content.replace(
    "const enqueuePromises = validInternalMatches.map(match =>",
    "const enqueuePromises = validInternalMatches.map((match: any) =>"
);
fs.writeFileSync('functions/src/index.ts', content);
