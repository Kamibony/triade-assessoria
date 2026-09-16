const fs = require('fs');
const filepath = 'functions/src/index.ts';
let code = fs.readFileSync(filepath, 'utf8');

code = code.replace(
    /if \(matchResult && matchResult\.id && !matchResult\.id\.startsWith\('error_'\)\) \{/g,
    "if (matchResult && matchResult.id && typeof matchResult.id === 'string' && !matchResult.id.startsWith('error_')) {"
);

fs.writeFileSync(filepath, code);
