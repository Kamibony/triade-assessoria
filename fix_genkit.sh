#!/bin/bash
cd functions
sed -i "s|import { vertexAI, textEmbedding004 } from '@genkit-ai/vertexai';|import { googleAI, textEmbedding004 } from '@genkit-ai/google-genai';|g" src/index.ts
sed -i "s|plugins: \[vertexAI({ projectId: 'triade-assessoria', location: 'us-central1' })\],|plugins: \[googleAI()\],|g" src/index.ts
sed -i "s|model: 'vertexai/gemini-2.5-flash'|model: 'googleai/gemini-2.5-flash'|g" src/index.ts
