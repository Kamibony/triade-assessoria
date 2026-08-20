const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    '        existingMatchRef = matchesQuery.docs[0].ref;',
    '        existingMatchRef = matchesQuery.docs[0]?.ref;'
);
content = content.replace(
    '        existingMatchData = matchesQuery.docs[0].data();',
    '        existingMatchData = matchesQuery.docs[0]?.data();'
);

fs.writeFileSync('functions/src/index.ts', content);
