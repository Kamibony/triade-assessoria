import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
    initializeApp({
        projectId: 'triade-assessoria',
    });
}

const db = getFirestore();

async function seedTargets() {
    console.log('Seeding system targets...');
    const targetsRef = db.collection('scraping_targets');
    const targets = [
        { name: 'Prosas Global', strategy: 'PROSAS', isActive: true },
        { name: 'Default RSS Feeds', strategy: 'RSS', isActive: true },
        { name: 'Vertex Sniper', strategy: 'VERTEX', query: 'edital fomento', isActive: true }
    ];

    for (const target of targets) {
        // Query if target with same name exists
        const snapshot = await targetsRef.where('name', '==', target.name).get();
        if (snapshot.empty) {
            await targetsRef.add(target);
            console.log(`Added target: ${target.name}`);
        } else {
            console.log(`Target already exists: ${target.name}`);
        }
    }
    console.log('Done.');
}

seedTargets().catch(console.error);
