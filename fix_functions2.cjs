const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    'const matchTime = existingMatchData.createdAt.toMillis();',
    'const matchTime = existingMatchData.createdAt.toMillis();'
); // actually need to see what lines 238 and 239 are

const lines = content.split('\n');
console.log(lines[237]);
console.log(lines[238]);
console.log(lines[239]);
