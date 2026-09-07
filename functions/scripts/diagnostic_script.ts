import { fetchAndExtractText } from '../src/index';

async function diagnose() {
    console.log("=== Diagnosing PDF Text Extraction ===");

    // Testing multiple reliable URLs to prove resilience
    const testUrls = [
        'https://www.orimi.com/pdf-test.pdf',
        'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
    ];

    for (const testUrl of testUrls) {
        console.log(`\nTesting URL: ${testUrl}`);
        try {
            const text = await fetchAndExtractText(testUrl);
            console.log(`Extraction Success: ${!!text}`);
            console.log(`Extracted Text Length: ${text.length}`);
            console.log(`Preview: ${text.substring(0, 100)}...`);

            if (text.length >= 150) {
                console.log("-> VALID: Meets 150 character heuristic threshold.");
            } else {
                console.log("-> WARNING: Text length < 150. May be rejected as an SPA skeleton or empty file by heuristic.");
            }
        } catch (e) {
            console.error("Extraction Failed:", e);
        }
    }
}
diagnose();
