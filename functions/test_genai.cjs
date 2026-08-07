const genai = require('@genkit-ai/google-genai');
console.log("google-genai models:", Object.keys(genai).filter(k => k.toLowerCase().includes('gemini')));
