const googleAI = require('@genkit-ai/googleai');
console.log("googleAI models:", Object.keys(googleAI).filter(k => k.toLowerCase().includes('gemini')));
