const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    'let existingMatchRef = null;',
    'let existingMatchRef: any = null;'
);
content = content.replace(
    'let existingMatchData = null;',
    'let existingMatchData: any = null;'
);

fs.writeFileSync('functions/src/index.ts', content);
