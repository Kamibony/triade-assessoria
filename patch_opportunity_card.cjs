const fs = require('fs');
let content = fs.readFileSync('src/components/portal/PortalDiscover.tsx', 'utf8');

const searchBlock = `                    <h3 className="text-lg font-bold leading-tight line-clamp-2">Edital {match.editalId} (Mock Title)</h3>`;
const replaceBlock = `                    <h3 className="text-lg font-bold leading-tight line-clamp-2">{match.editalTitle || \`Edital \${match.editalId}\`}</h3>`;

content = content.replace(searchBlock, replaceBlock);
fs.writeFileSync('src/components/portal/PortalDiscover.tsx', content);
