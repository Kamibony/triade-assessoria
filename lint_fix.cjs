const fs = require('fs');

let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    "export const scheduledMatchSweeper = onSchedule('every 1 weeks', async (event) => {",
    "export const scheduledMatchSweeper = onSchedule('every 1 weeks', async () => {"
);

fs.writeFileSync('functions/src/index.ts', content);

let typesContent = fs.readFileSync('src/lib/types.ts', 'utf8');
typesContent = typesContent.replace(
    'createdAt?: any;',
    'createdAt?: { toMillis?: () => number; seconds?: number; nanoseconds?: number; };'
);
fs.writeFileSync('src/lib/types.ts', typesContent);

let matchViewContent = fs.readFileSync('src/components/NgoMatchView.tsx', 'utf8');
matchViewContent = matchViewContent.replace(
    'const formatTimeAgo = (timestamp: any) => {',
    'const formatTimeAgo = (timestamp: { toMillis?: () => number, seconds?: number }) => {'
);
matchViewContent = matchViewContent.replace(
    'const diffDays = Math.floor((Date.now() - millis) / (1000 * 60 * 60 * 24));',
    'const now = new Date().getTime();\n        const diffDays = Math.floor((now - millis) / (1000 * 60 * 60 * 24));'
);
fs.writeFileSync('src/components/NgoMatchView.tsx', matchViewContent);
