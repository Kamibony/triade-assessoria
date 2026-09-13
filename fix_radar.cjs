const fs = require('fs');
let content = fs.readFileSync('src/components/RadarOportunidades.tsx', 'utf8');
content = content.replace(
    'const totalMatches = globalStats?.total || 0;',
    'const totalMatches = globalStats?.total ?? 0;'
);
content = content.replace(
    'const aiApproved = globalStats?.aiApproved || 0;',
    'const aiApproved = globalStats?.aiApproved ?? 0;'
);
content = content.replace(
    'const manuallyApproved = globalStats?.manuallyApproved || 0;',
    'const manuallyApproved = globalStats?.manuallyApproved ?? 0;'
);
fs.writeFileSync('src/components/RadarOportunidades.tsx', content);
