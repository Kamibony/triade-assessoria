import * as cheerio from 'cheerio';

function sanitizeAndTruncateText(html: string): string {
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer, etc to get main content
    $('script, style, nav, footer, header, aside, noscript, iframe').remove();

    let text = $('body').text();
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    if (text && text.length > 3000) {
        text = text.substring(0, 3000);
    }
    return text;
}

function runTest() {
    console.log("Generating 5MB messy HTML payload...");

    // Generate ~5MB string
    const chunk = '<header>Ignore this</header><div><p>Valid text.</p><script>alert("evil")</script></div><footer>Footer text</footer>';
    const repeatCount = Math.ceil((5 * 1024 * 1024) / chunk.length);
    let largeHtml = chunk.repeat(repeatCount);

    console.log(`Payload length: ${largeHtml.length} bytes`);

    console.log("Running sanitization and truncation...");
    const result = sanitizeAndTruncateText(largeHtml);

    console.log(`Resulting length: ${result.length} chars (Expected: 3000)`);

    if (result.length === 3000) {
        console.log("Success: Output is correctly truncated to 3000 characters and script didn't OOM.");
    } else {
        console.error("Test failed: Output length is not 3000.");
    }

    if (result.includes('evil') || result.includes('Ignore this')) {
         console.error("Test failed: Unwanted tags were not stripped correctly.");
    } else {
         console.log("Success: Scripts and headers correctly stripped.");
    }
}

runTest();
