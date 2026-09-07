const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

content = content.replace(
    `            if (nextConsecutiveZeroNewCount < 2) {
                await queue.enqueue({
                    searchId,
                    target,
                    query,
                    page: page + 1,
                    linksQueue: [],
                    runId,
                    consecutiveZeroNewCount: nextConsecutiveZeroNewCount
                });
            } else {`,
    `            if (nextConsecutiveZeroNewCount < 2) {
                await queue.enqueue({
                    searchId,
                    target,
                    query,
                    page: page + 1,
                    linksQueue: [],
                    runId,
                    consecutiveZeroNewCount: nextConsecutiveZeroNewCount
                });
            } else {`
);

// Ah, wait, consecutiveZeroNewCount is passed, but maybe it wasn't defined correctly in the enqueue call... let's check what it's complaining about.

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
