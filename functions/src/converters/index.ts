import { QueryDocumentSnapshot, FirestoreDataConverter, DocumentData, PartialWithFieldValue, WithFieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

export function createConverter<T extends z.ZodTypeAny>(
    schema: T
): FirestoreDataConverter<z.infer<T>> {
    return {
        toFirestore(modelObject: WithFieldValue<z.infer<T>> | PartialWithFieldValue<z.infer<T>>): DocumentData {
            // Attempt to parse strictly on writes
            try {
                return schema.parse(modelObject);
            } catch (error) {
                if ('partial' in schema && typeof schema.partial === 'function') {
                    return schema.partial().parse(modelObject);
                }
                throw error;
            }
        },
        fromFirestore(snapshot: QueryDocumentSnapshot): z.infer<T> {
            const data = snapshot.data();
            const result = schema.safeParse(data);
            if (!result.success) {
                console.warn(`[Converter Warning] Failed to parse document ${snapshot.id}:`, result.error.format());
                // Fallback to returning the raw data so legacy reads don't break immediately
                return data as z.infer<T>;
            }
            return result.data;
        }
    };
}
