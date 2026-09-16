const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

code = code.replace(
    /onFeedback=\{\(matchId, action\) => \{/g,
    "onFeedback={(_matchId, action) => {"
);

fs.writeFileSync(filepath, code);
