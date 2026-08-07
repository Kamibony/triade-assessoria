const { googleAI } = require('@genkit-ai/googleai');
const googleGenai = require('@genkit-ai/google-genai');
console.log("googleAI models:", Object.keys(require('@genkit-ai/googleai')).filter(k => k.toLowerCase().includes('gemini')));
console.log("google-genai models:", Object.keys(require('@genkit-ai/google-genai')).filter(k => k.toLowerCase().includes('gemini')));
