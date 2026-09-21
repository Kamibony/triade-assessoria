import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

async function migrateCollection(collectionName: string) {
    console.log(`Starting migration for ${collectionName}...`);
    let count = 0;
    let lastDoc: any = null;
    let keepGoing = true;

    while (keepGoing) {
        let query: any = db.collection(collectionName).orderBy('__name__').limit(500);
        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            keepGoing = false;
            break;
        }

        const batch = db.batch();
        let batchCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data() as any;

            if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
                batch.update(doc.ref, {
                    embedding: FieldValue.vector(data.embedding)
                });
                batchCount++;
                count++;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`Migrated ${batchCount} documents in ${collectionName}. Total: ${count}`);
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    }

    console.log(`Finished migrating ${collectionName}. Total updated: ${count}`);
}

async function run() {
    try {
        await migrateCollection('editais');
        await migrateCollection('oscs');
        console.log('Migration complete!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

run();
