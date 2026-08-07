"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const genkit_1 = require("genkit");
const googleai_1 = require("@genkit-ai/googleai");
const ai = (0, genkit_1.genkit)({
    plugins: [(0, googleai_1.googleAI)({ apiKey: "test" })],
});
console.log("ai config initialized");
//# sourceMappingURL=test_pdf.js.map