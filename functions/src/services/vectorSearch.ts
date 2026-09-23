import { Firestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

export function cosineSimilarity(vecA: any, vecB: any): number {
    const a = vecA?.toArray ? vecA.toArray() : vecA;
    const b = vecB?.toArray ? vecB.toArray() : vecB;

    if (!a || !b || a.length !== b.length) {
        logger.warn(`cosineSimilarity returning 0 due to missing vectors or dimension mismatch. vecA.length: ${a?.length}, vecB.length: ${b?.length}`);
        return 0;
    }
    let dotProduct = 0; let normA = 0; let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += (a[i] || 0) * (b[i] || 0);
        normA += (a[i] || 0) * (a[i] || 0);
        normB += (b[i] || 0) * (b[i] || 0);
    }
    if (normA === 0 || normB === 0) {
        logger.warn(`cosineSimilarity returning 0 due to zero norm. normA: ${normA}, normB: ${normB}`);
        return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function findTopVectorMatches(
    collectionName: string,
    queryVector: number[] | FieldValue | any,
    threshold: number,
    limit: number,
    db: Firestore,
    queryBuilder?: (query: any) => any
) {
    let results: { id: string; similarity: number; data?: any }[] = [];

    // Attempt native findNearest
    try {
        logger.info(`[findTopVectorMatches] Attempting native findNearest on ${collectionName}`);
        let baseQuery = db.collection(collectionName);
        if (queryBuilder) {
            baseQuery = queryBuilder(baseQuery);
        }

        const snapshot = await (baseQuery as any)
            .findNearest('embedding', queryVector, {
                limit: limit,
                distanceMeasure: 'COSINE',
                distanceResultField: 'vectorDistance'
            })
            .get();

        if (snapshot.docs.length > 0) {
            logger.info(`[findTopVectorMatches] Native findNearest found ${snapshot.docs.length} raw docs`);

            for (const doc of snapshot.docs) {
                let distance = doc.get('vectorDistance');
                if (distance === undefined || distance === null) {
                   distance = doc.data()?.vectorDistance;
                }

                let similarity: number;
                if (distance === undefined || distance === null) {
                    logger.warn(`[findTopVectorMatches] Missing vectorDistance for doc ${doc.id}, falling back to local cosineSimilarity.`);
                    similarity = cosineSimilarity(queryVector, doc.data()?.embedding);
                } else {
                   similarity = 1 - distance;
                }

                if (similarity >= threshold) {
                    results.push({ id: doc.id, similarity, data: doc.data() });
                }
            }

            // Only return if we found valid matches above threshold or if we got actual docs back.
            // If native returns 0 docs entirely, it might be a silent failure. Let's fallback if 0 docs are returned.
            if (snapshot.docs.length > 0) {
                logger.info(`[findTopVectorMatches] Native findNearest success: Returning ${results.length} results above threshold ${threshold}`);
                return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
            }
        }

        logger.warn(`[findTopVectorMatches] Native findNearest returned 0 docs for ${collectionName}. Falling back to in-memory calculation.`);
    } catch (e) {
        logger.error(`[findTopVectorMatches] Native findNearest failed for ${collectionName}:`, e);
        logger.info(`[findTopVectorMatches] Falling back to in-memory calculation.`);
    }

    // Fallback: In-memory calculation
    try {
        let fallbackQuery = db.collection(collectionName) as any;
        if (queryBuilder) {
            fallbackQuery = queryBuilder(fallbackQuery);
        }

        const allDocsSnapshot = await fallbackQuery.get();
        logger.info(`[findTopVectorMatches] Fallback fetched ${allDocsSnapshot.docs.length} total docs from ${collectionName}`);

        for (const doc of allDocsSnapshot.docs) {
            const docData = doc.data();
            const docEmbedding = docData.embedding;

            if (!docEmbedding) {
                continue; // Skip docs without embeddings
            }

            const similarity = cosineSimilarity(queryVector, docEmbedding);

            if (similarity >= threshold) {
                results.push({ id: doc.id, similarity, data: docData });
            }
        }

        logger.info(`[findTopVectorMatches] Fallback found ${results.length} total matches above threshold ${threshold} before sort/limit`);

        return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    } catch (fallbackError) {
         logger.error(`[findTopVectorMatches] In-memory fallback calculation failed:`, fallbackError);
         return []; // Total failure
    }
}
