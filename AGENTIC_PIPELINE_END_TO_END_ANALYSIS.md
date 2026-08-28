# Agentic Pipeline End-to-End Analysis: Agentic Search -> Extraction -> Matchmaking

This document provides a comprehensive architectural and failure-mode analysis of the "Ostrelovač" Agentic Search pipeline, covering the asynchronous lifecycle from user initiation to real-time UI reflection.

## 1. Detailed Flow Sequence & Dependency Map

The pipeline follows a loosely coupled, asynchronous architecture leveraging Firebase Cloud Functions (v2 task queues) and Firestore for state management.

### Sequence Outline

1. **User Initiation (UI):**
   - A user clicks the search trigger in the OSC Profile view (`OscProfileView.tsx`).
   - The UI invokes the `triggerAgenticSearch` Callable Function via the Firebase Client SDK, passing the `oscId`.

2. **Orchestration (`triggerAgenticSearch`):**
   - **Firestore Write:** Creates a tracking document in the `agentic_search_jobs` collection with an initial status of `queued`.
   - **Payload:** `{ id, oscId, status: 'queued', progress: {...}, logs: [...], startedAt, updatedAt }`.
   - **Task Dispatch:** Enqueues a task to the `agenticSearchWorker` Cloud Task queue.
   - **Payload passed to worker:** `{ oscId, jobId }`.

3. **Search & Triage (`agenticSearchWorker`):**
   - **State Update:** Updates job status to `generating_queries`.
   - **LLM Query Generation:** Uses Genkit to analyze the OSC profile (`oscs/{oscId}`) and generate optimized search queries (injecting year and relevant terms).
   - **Web Search:** Iterates through queries, calling the Brave Search API (up to 20 results per query).
   - **Pre-filtering:** Uses vector similarity (cosine > 0.30) against the OSC embedding and the Brave snippet embedding.
   - **Full Content Fetch:** For promising links, attempts to fetch full HTML text (`fetchAndExtractText`). Falls back to snippet on failure.
   - **LLM Triage:** Uses Genkit (`triageEditalWebpage`) to evaluate if the content is a valid grant opportunity.
   - **Handoff (Claim-Check):** If valid, invokes `enqueueEditalExtraction()`.
   - **State Update:** Continuously updates `progress` fields (`linksFound`, `validEditaisEnqueued`) and logs in `agentic_search_jobs` for the UI.

4. **Claim-Check Pattern (`enqueueEditalExtraction`):**
   - **Firestore Write:** Creates a temporary document in `scraping_contents` containing the large text payload (to bypass 100KB Cloud Tasks limit). The document has a 24-hour TTL (`expireAt`).
   - **Task Dispatch:** Enqueues a task to `extractionWorker`.
   - **Payload passed to worker:** `{ searchId: oscId, link, contentId, reason }` (Note: `oscId` is passed in the `searchId` field for agentic searches).

5. **Extraction & Embedding (`extractionWorker`):**
   - **Retrieval:** Reads the full text from `scraping_contents/{contentId}`.
   - **LLM Extraction:** Uses Genkit (`extractEditalRules`) to parse the text into a structured JSON schema (`editalSchema`).
   - **Embedding:** Generates a vector embedding for the edital text.
   - **Firestore Write:** Saves the structured data and embedding to the `editais` collection.
   - **Targeted Handoff:** Checks if `searchId` matches an `oscId` pattern (length > 15). If so, enqueues a task to `matchEvaluatorWorker`.
   - **Cleanup:** Deletes the temporary `scraping_contents` document *only on success*.
   - **Payload passed to worker:** `{ oscId, editalId }`.

6. **Matchmaking (`matchEvaluatorWorker`):**
   - **Evaluation:** Processes the specific pair (`oscId`, `editalId`) using Genkit to evaluate alignment and generate a score/rationale.
   - **Firestore Write:** Saves the result to the `matches` collection.

7. **Real-time UI Reflection:**
   - The UI listens to `agentic_search_jobs` via `onSnapshot` for progress updates.
   - The targeted Matches view inside `OscProfileView.tsx` automatically updates as new matches are written to Firestore.

## 2. Concurrency, Throttling & Cost Analysis

### Concurrency Handling
- **Multiple Users:** The pipeline handles multiple simultaneous users by relying on Google Cloud Tasks for queueing. Each search is tracked by a unique `jobId`.
- **Queue Limits:** The `agenticSearchWorker` is configured with `maxConcurrentDispatches: 2`. This strict limit prevents concurrent runs from overwhelming the Brave Search API or Vertex AI quotas. `matchEvaluatorWorker` allows `maxConcurrentDispatches: 5`.

### Rate Limits & Quotas
- **Brave API:** Limited by the subscription plan (typically queries per second/month). `maxConcurrentDispatches` provides a buffer.
- **Vertex AI Genkit:** Generative models have strict Requests Per Minute (RPM) and Tokens Per Minute (TPM) quotas. The strict concurrency controls on workers are critical here to avoid `HTTP 429 Too Many Requests` errors.

### Cost Analysis (Theoretical Worst-Case)
*(Assumptions based on standard API pricing, actuals vary)*
- **0 Valid Editais:** Cost is driven by query generation, Brave API calls (e.g., 5 queries = 5 API calls), and snippet embeddings. Full text fetches and triage are minimal. Cost is extremely low (cents).
- **20 Valid Editais:** Maximum cost scenario.
  - 20 full text fetches.
  - 20 Genkit `triageEditalWebpage` calls.
  - 20 Genkit `extractEditalRules` calls (heavy prompt + large text context).
  - 20 Genkit embedding generation calls.
  - 20 Genkit `processMatchEvaluation` calls.
  - Total cost scales linearly with the number of valid editais found, potentially reaching several dollars per search depending on the chosen model (e.g., Gemini 1.5 Pro vs Flash) and text length.

## 3. Failure Modes & Edge Case Resilience

### Broken Chain Recovery
- **Mid-Process Crash (Extraction):** If `extractionWorker` fails (e.g., LLM schema validation error, timeout), Cloud Tasks will automatically retry based on `retryConfig` (up to 3 attempts). If it exhausts retries, the temporary document remains in `scraping_contents` until its TTL expires.
- **Mid-Process Crash (Matchmaking):** If `matchEvaluatorWorker` fails, it also relies on task retries. If it completely fails, the edital exists in the DB, but the match is never evaluated.
- **User Notification:** The UI monitors `agentic_search_jobs`. If `agenticSearchWorker` fails entirely, it updates the status to `failed`, which the UI displays. However, failures in downstream queues (`extractionWorker`, `matchEvaluatorWorker`) are **not** currently propagated back to the `agentic_search_jobs` tracker. The user sees "completed" when the search finishes queueing extraction tasks, not when extraction/matching finishes. This is an ambiguous state.

### Orphaned Documents (Claim-Check Cleanup)
- Temporary documents in `scraping_contents` are created with a 24-hour TTL (`expireAt`).
- `extractionWorker` explicitly deletes the document *only* on successful completion.
- If a task fails or the queue is paused, Firestore's TTL index automatically deletes the document after 24 hours, preventing database bloat without requiring manual cleanup jobs.

### Idempotency & Race Conditions
- **Duplicate Searches:** If two searches for the same OSC are triggered concurrently, two separate jobs are created. Both will execute.
- **Duplicate Links:** `agenticSearchWorker` maintains a local `searchedLinks` Set to prevent processing the same URL twice *within a single job*.
- **Duplicate Editais:** Before evaluating a link, `agenticSearchWorker` queries the DB: `db.collection('editais').where('sourceUrl', '==', link)`. If the URL already exists, it skips triage. This prevents duplicate entries across different jobs, provided the URL string matches exactly.
- **Match Idempotency:** The match generator uses composite keys (often `oscId_editalId`) to overwrite or skip existing matches, ensuring idempotency at the database level.

## 4. Production Recommendations & Next Steps

1. **Fix Job State Ambiguity:** The `agentic_search_jobs` status is marked `completed` as soon as `agenticSearchWorker` finishes iterating web results. It does not wait for downstream extraction and matchmaking.
   - **Recommendation:** Implement a counter or a robust state machine. The job should only be "completed" when all enqueued extraction/matching tasks resolve (success or failure). Currently, users might see "Done" while matches are still processing in the background.

2. **Strict Edital Idempotency:** Relying solely on `sourceUrl` equality is fragile (e.g., `http://` vs `https://`, trailing slashes, tracking params).
   - **Recommendation:** Implement URL normalization before checking for existence, or use vector similarity on the extracted text to detect semantic duplicates even if the URL changes slightly.

3. **Error Propagation:** If `extractionWorker` permanently fails (exhausts retries), the `agentic_search_jobs` document is never updated.
   - **Recommendation:** Implement a failure hook or dead-letter queue process that updates the tracking document if downstream tasks fail.

4. **Resource Constraints:** `agenticSearchWorker` processes up to 20 results * 5 queries sequentially within the worker. Full text fetching is slow.
   - **Recommendation:** The 1800s timeout is generous, but memory limits (`4GiB`) might be hit if fetching large PDFs sequentially. Consider fanning out the triage step to its own queue (similar to extraction) for better isolation and parallelism.
