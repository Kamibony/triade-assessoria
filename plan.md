1. **Refactor `triggerGlobalIngestion`**:
   - Update `triggerGlobalIngestion` in `functions/src/index.ts` to enqueue a new task to `runUnifiedIngestionWorker` instead of awaiting `executeUnifiedIngestion` directly.
   - Return `{ success: true, runId, message: "Ingestion loop enqueued" }` immediately after enqueueing.
2. **Create `runUnifiedIngestionWorker`**:
   - Define a new `onTaskDispatched` function named `runUnifiedIngestionWorker` in `functions/src/index.ts`.
   - Configure it with a long timeout (e.g., 3600 seconds) and high memory limit (e.g., '1GiB' or '2GiB').
   - In the handler, it will receive `{ runId }` and execute `await executeUnifiedIngestion(runId);`.
3. **Pre-commit Checks**:
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
