const fs = require('fs');
const file = './functions/src/index.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
/const dynamicThreshold = isSparseProfile \? 0\.10 : 0\.15;/g,
"const dynamicThreshold = isSparseProfile ? 0.25 : 0.30;"
);

code = code.replace(
/\.filter\(\(m: any\) => m\.similarity >= 0\.15\)/g,
".filter((m: any) => m.similarity >= 0.25)"
);

fs.writeFileSync(file, code);
