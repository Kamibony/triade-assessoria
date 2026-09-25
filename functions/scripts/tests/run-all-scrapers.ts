import { ProsasScraper } from '../../src/scrapers/ProsasScraper.js';
import { VertexAIScraper } from '../../src/scrapers/VertexAIScraper.js';
import { BraveScraper } from '../../src/scrapers/BraveScraper.js';
import Parser from 'rss-parser';
import { initializeApp, getApps } from 'firebase-admin/app';

if (getApps().length === 0) {
    try {
        initializeApp();
    } catch (e) {
        console.warn("Could not initialize default firebase app. It will fail if credentials are not provided.");
    }
}

async function runScrapers() {
    console.log("Starting lightweight scraper verification...");
    let failed = false;

    const testStrategy = async (name: string, strategy: any) => {
        try {
            console.log(`Testing ${name}...`);
            const results = await strategy.fetchDelta();
            console.log(`✅ ${name} passed (Returned ${results.length} items).`);
        } catch (error: any) {
            console.error(`❌ ${name} failed:`, error.message || error);
            failed = true;
        }
    };

    await testStrategy('ProsasScraper', new ProsasScraper());
    await testStrategy('VertexAIScraper', new VertexAIScraper('edital'));
    await testStrategy('BraveScraper', new BraveScraper('edital'));

    console.log("Testing RSS Parser...");
    try {
        const parser = new Parser({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8,text/html;q=0.7,*/*;q=0.1'
            }
        });
        const feed = await parser.parseURL("https://news.google.com/rss/search?q=edital+ONG+OR+OSC+brasil");
        console.log(`✅ RSS Parser passed (Returned ${feed.items.length} items).`);
    } catch (error: any) {
        console.error(`❌ RSS Parser failed:`, error.message || error);
        failed = true;
    }

    if (failed) {
        console.error("One or more scrapers failed validation. Aborting.");
        process.exit(1);
    } else {
        console.log("All scrapers verified successfully. Ready for deployment.");
        process.exit(0);
    }
}

runScrapers();
