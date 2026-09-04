"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cheerio = __importStar(require("cheerio"));
function sanitizeAndTruncateText(html) {
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
    }
    else {
        console.error("Test failed: Output length is not 3000.");
    }
    if (result.includes('evil') || result.includes('Ignore this')) {
        console.error("Test failed: Unwanted tags were not stripped correctly.");
    }
    else {
        console.log("Success: Scripts and headers correctly stripped.");
    }
}
runTest();
//# sourceMappingURL=test-sanitizer.js.map