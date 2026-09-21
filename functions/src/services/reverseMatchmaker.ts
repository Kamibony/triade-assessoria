import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import * as logger from 'firebase-functions/logger';

// Dynamic import to avoid circular dependency
export const triggerReverseMatch = onDocumentCreated('editais/{editalId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.warn('No data associated with the event');
        return;
    }

    const editalId = event.params.editalId;
    const editalData = snapshot.data();

    logger.info(`Reverse matchmaker triggered for newly ingested edital: ${editalId}`);

    const db = getFirestore();

    // Check if embedding exists. If not, generate it dynamically to prevent silent failures.
    let editalEmbedding = editalData.embedding;
    if (!editalEmbedding) {
         logger.info(`Edital ${editalId} lacks an embedding vector. Generating...`);
         try {
             // In-line embedding generation via Genkit plugin to avoid importing from index directly
             const { genkit } = await import('genkit');
             const { vertexAI } = await import('@genkit-ai/google-genai');

             const ai = genkit({
                 plugins: [vertexAI({ location: 'us-central1' })],
             });

             const editalText = `Objetivo e Título: ${editalData.title || ''}. Elegibilidade: Atividades permitidas: ${(editalData.eligibilityCriteria?.allowedActivities || []).join(', ')}.`;
             const response = await ai.embed({
                 embedder: 'vertexai/text-embedding-004',
                 content: editalText.substring(0, 5000)
             });
             const embeddingArray = response.map((e: any) => e.embedding)[0];
             if (!embeddingArray) {
                  throw new Error("Empty embedding returned from AI provider.");
             }
             editalEmbedding = FieldValue.vector(embeddingArray);
             await db.collection('editais').doc(editalId).update({ embedding: editalEmbedding });
         } catch (e) {
             logger.error(`Failed to generate embedding for Edital ${editalId}:`, e);
             return;
         }
    }

    const matchEvaluatorQueue = getFunctions().taskQueue('matchEvaluatorWorker');

    try {
        const vectorQuery = Array.isArray(editalEmbedding) ? FieldValue.vector(editalEmbedding) : editalEmbedding;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const oscsSnapshot = await (db.collection('oscs') as any)
            .findNearest('embedding', vectorQuery, {
                limit: 100,
                distanceMeasure: 'COSINE',
                distanceResultField: 'vectorDistance'
            })
            .get();

        const validCandidates = oscsSnapshot.docs
            .map((doc: any) => ({
                id: doc.id,
                distance: doc.get('vectorDistance'),
                similarity: 1 - doc.get('vectorDistance')
            }))
            .filter((c: any) => c.similarity >= 0.25);

        const candidates = validCandidates;

        logger.info(`Found ${candidates.length} potential OSC matches for Edital ${editalId}. Enqueuing to evaluation task...`);

        // Layer 3: Enqueue to LLM Judge via Cloud Tasks
        for (const osc of candidates) {
            await matchEvaluatorQueue.enqueue({
                oscId: osc.id,
                editalId: editalId
            });
        }

        logger.info(`Successfully enqueued ${candidates.length} match tasks for Edital ${editalId}.`);
    } catch (error) {
        logger.error(`Error in reverse matchmaker for Edital ${editalId}:`, error);
    }
});
