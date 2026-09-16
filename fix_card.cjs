const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

code = code.replace(
    /const isPendingInfo = match\.verificationResult\?\.some\(r => r\.status === 'Pendente de Informação'\) \|\| match\.actionState === 'Pendente de Informação';/,
    "const isPendingInfo = match.verificationResult?.some(r => r.status === 'Pendente de Informação');"
);

fs.writeFileSync(filepath, code);
