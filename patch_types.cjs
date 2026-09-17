const fs = require('fs');
let content = fs.readFileSync('src/lib/types.ts', 'utf8');
content = content.replace(
    "id?: string;",
    "id?: string;\n    editalTitle?: string;"
);
fs.writeFileSync('src/lib/types.ts', content);
