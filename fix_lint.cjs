const fs = require('fs');
let code = fs.readFileSync('functions/src/index.ts', 'utf8');
code = code.replace(/} catch \{\n        console\.error\("Error fetching text from URL", url, e\);/g, '} catch (e) {\n        console.error("Error fetching text from URL", url, e);');
code = code.replace(/\} catch \{\n                         console\.error\(\`Error extracting rules for \$\{item\.link\}:\`, e\);/g, '} catch (e) {\n                         console.error(`Error extracting rules for ${item.link}:`, e);');
fs.writeFileSync('functions/src/index.ts', code, 'utf8');
