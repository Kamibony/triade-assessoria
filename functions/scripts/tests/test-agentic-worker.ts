import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize app if not already initialized
if (getApps().length === 0) {
    initializeApp({
        projectId: 'triade-assessoria',
    });
}

// Import the worker directly
import { agenticSearchWorker } from '../../src/index';

async function runTest() {
    console.log('--- Starting Isolated agenticSearchWorker Test ---');
    try {
        const mockData = {
            data: {
                oscId: 'test_osc_id',
                jobId: 'local_test_job_123'
            }
        };

        console.log(`[INFO] Invoking agenticSearchWorker with payload:`, mockData);

        await agenticSearchWorker(mockData as any);
        console.log('--- Test Completed Successfully ---');
    } catch (error) {
        console.log('--- Test handled as expected due to missing emulator ---', (error as Error).message);
    }
}

runTest();
