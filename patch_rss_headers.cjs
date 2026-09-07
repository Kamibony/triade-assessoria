const fs = require('fs');
let content = fs.readFileSync('functions/src/index.ts', 'utf8');

// The line we want to replace is where new Parser() is instantiated inside the AUTO fetch block and in processRssFeeds.
// Actually, let's just replace all instances of "new Parser()" with the configured one.

const targetParser = `new Parser()`;
const configuredParser = `new Parser({
        customFields: { item: ['content:encoded', 'creator'] },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
        }
    })`;

content = content.replace(/new Parser\(\)/g, configuredParser);

fs.writeFileSync('functions/src/index.ts', content, 'utf8');
