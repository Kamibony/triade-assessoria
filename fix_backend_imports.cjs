const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');
content = content.replace(
    "import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';",
    "import { onRequest } from 'firebase-functions/v2/https';"
);
fs.writeFileSync('functions/src/index.ts', content);
