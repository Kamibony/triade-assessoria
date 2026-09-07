const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// I failed to replace the line properly earlier because of eslint-disable-next-line
const targetStr = `    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query, page = 1, linksQueue = [], runId } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[], runId?: string };`;

const replacementStr = `    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { searchId, target, query, page = 1, linksQueue = [], runId, consecutiveZeroNewCount = 0 } = request.data as { searchId: string, target: any, query?: string, page?: number, linksQueue?: string[], runId?: string, consecutiveZeroNewCount?: number };`;

content = content.replace(targetStr, replacementStr);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
