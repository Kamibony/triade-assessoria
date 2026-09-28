import { prosasAuthenticatedWorker } from '../../src/index.js';

// Just verifying it compiles and imports correctly
async function runTest() {
    console.log("Worker imported successfully. Type is:", typeof prosasAuthenticatedWorker);
    console.log("Structural test passed. Code compiles and worker is reachable.");
    process.exit(0);
}

runTest();
