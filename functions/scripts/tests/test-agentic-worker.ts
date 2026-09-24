import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Need require for firebase-functions-test as it does not play well with ES modules sometimes
const fft = require('firebase-functions-test');
const test = fft({
    projectId: 'triade-assessoria',
});

// Initialize app if not already initialized
if (getApps().length === 0) {
    initializeApp({
        projectId: 'triade-assessoria',
    });
}

// We mock the onTaskDispatched since we just want to run the internal handler
import { agenticSearchWorker } from '../../src/index';

async function runTest() {
    console.log('--- Starting Isolated agenticSearchWorker Test ---');
    const db = getFirestore();

    const oscsSnapshot = await db.collection('oscs').limit(1).get();
    if (oscsSnapshot.empty) {
        console.error('ERROR: No OSC found in database. Cannot run test.');
        return;
    }

    const oscId = oscsSnapshot.docs[0].id;
    console.log(`[INFO] Found OSC ID for testing: ${oscId}`);

    const mockData = {
        oscId: oscId,
        jobId: 'local_test_job_123'
    };

    console.log(`[INFO] Invoking agenticSearchWorker with payload:`, mockData);

    // In Firebase Functions v2, onTaskDispatched returns an object with a `run` method
    // Alternatively, use firebase-functions-test wrap
    const wrappedWorker = test.wrap(agenticSearchWorker);

    try {
        await wrappedWorker({ data: mockData });
        console.log('--- Test Completed Successfully ---');
    } catch (error) {
        console.error('--- Test Failed with Error ---');
        console.error(error);
    } finally {
        test.cleanup();
    }
}

runTest();
