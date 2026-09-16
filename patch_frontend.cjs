const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

code = code.replace(
    /const triggerBatchVerification = httpsCallable\(functions, 'triggerBatchVerification'\);\s+triggerBatchVerification\(\{ targetId: oscId, targetType: 'osc' \}\)\.catch\(err => \{/g,
    `const refreshOscOpportunities = httpsCallable(functions, 'refreshOscOpportunities');
    refreshOscOpportunities({ targetId: oscId }).catch(err => {`
);

fs.writeFileSync(filepath, code);
