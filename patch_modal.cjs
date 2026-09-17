const fs = require('fs');
let content = fs.readFileSync('src/components/portal/PortalDiscover.tsx', 'utf8');

const searchBlock = `                    <h2 className="text-2xl font-bold mb-6 pr-8">
                        Edital {match.editalId} - Detalhes
                    </h2>`;
const replaceBlock = `                    <h2 className="text-2xl font-bold mb-6 pr-8">
                        {match.editalTitle || \`Edital \${match.editalId}\`} - Detalhes
                    </h2>`;

content = content.replace(searchBlock, replaceBlock);
fs.writeFileSync('src/components/portal/PortalDiscover.tsx', content);
