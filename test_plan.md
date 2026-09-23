# Diagnostic Findings

The issue described is "Silent Task Disappearance in Cloud Tasks", where `editalVectorSearchWorker` logs state "Successfully enqueued 100 matchEvaluatorWorker tasks", the Cloud UI confirms tasks added, but the queue itself remains empty with 0 completed/running.

**Root Causes Identifications:**
1.  **Task Name / ID Conflicts (Silent Deduplication):** When the `enqueue` function doesn't receive an explicit task ID, the Google Cloud Tasks API may attempt deduplication or if the underlying payload structure ends up generating an identical hash/name, it immediately silently drops the duplicates. The `enqueue` logic currently iterates through candidates and pushes them using `await matchEvaluatorQueue.enqueue({ oscId, editalId, jobId })` without any unique `id` explicitly provided in the options object. The Firebase SDK for Cloud Tasks attempts to generate names, but within tight asynchronous loops or identical metadata, rapid dispatch causes deduplication collisions, discarding tasks.
2.  **Lack of centralized task dispatch mechanism (Violation of Memory rule):** The codebase memory explicitly states: *When dispatching Firebase Cloud Tasks, strictly use the centralized `safeEnqueueTasks` utility (e.g., imported from `./services/safeTasks.js`). Do not use inline `getFunctions().taskQueue().enqueue()` or `Promise.all()`. The utility safely abstracts explicit region routing (`locations/us-central1/functions/...`) to prevent SDK default-location mistakes, ensures sequential `for...of` execution, and provides isolated `try...catch` logging.*
The `safeEnqueueTasks` utility wasn't even present in `functions/src/services/safeTasks.ts` and was instead done inline via `getFunctions().taskQueue(..).enqueue(...)` across multiple locations.

# Architectural Solution Plan

1.  **Re-introduce `safeEnqueueTasks` Utility:**
    - I have created `functions/src/services/safeTasks.ts`. It includes deterministic UUID-based naming for tasks (stripping out invalid chars for Cloud Tasks) combined with sequential `for..of` execution and robust region prefix handling.
2.  **Refactor `editalVectorSearchWorker`:**
    - Replace the inline `queue.enqueue()` loops with `safeEnqueueTasks` in `editalVectorSearchWorker`.
    - Provide a unique, deterministic ID generation strategy `(data) => \`eval_\${data.jobId}_\${data.oscId}_\${data.editalId}\``. This ensures deduplication is *intentional* and explicit but prevents silent drops of valid distinct pairs.
3.  **Refactor `matchEvaluatorWorker` memory constraints & requirements:**
    - Review the logic in `matchEvaluatorWorker` to ensure it continues to handle processing correctly, as per memory rules.
    - The memory constraint states: *The `matchEvaluatorWorker` implements proactive Reverse Matchmaker LLM logic... crucially, the UPSERT payload (`{ merge: true }`) must also explicitly include `oscId`, `editalId`, `eligibility`, `status`, and `createdAt`...* Ensure this worker has `memory: '2GiB'` (which it does based on line 1972).
4.  **Refactor other inline enqueues related to matching:**
    - To fix the symptom holistically, I'll update other inline calls of `matchEvaluatorWorker` enqueueing (e.g., in `triggerReverseMatch` or `processOscChunkWorker`) to use `safeEnqueueTasks`.
5.  **Compile & Pre-Commit Validation:** Ensure TS files build correctly without any generic type errors since the new `safeTasks.ts` forces `<T extends Record<string, any>>` as requested by the memory instructions.
