# Prosas Data Ingestion Pipeline: Deep-Dive Audit

This document details the architectural and code-level bottlenecks encountered during the recent global ingestion run, analyzing the "Why" behind each failure point and proposing actionable solutions.

---

## 1. The 1000 -> 39 Drop (Deduplication Logic)

### Analysis of the Bottleneck
The drop from ~1000 scraped items to just 39 unique URLs is **not** caused by dropping valid, previously unseen editais via the database deduplication shield. Instead, it is caused by the `ProsasScraper` fetching the **exact same items** repeatedly across its 50 pagination loops, resulting in hundreds of duplicate URL payloads.

1. **Pagination Race Condition:** In `ProsasScraper.ts`, the code sets up an interceptor for the Prosas API (`inscricoes_abertas`) and then clicks the "Next" button (`btn.click()`) via `page.evaluate()`. However, because it immediately loops and awaits the *next* API response, it often catches the identical response from the previous page load before the Prosas frontend actually fetches the next page, or the API itself returns the same results due to state issues.
2. **Orchestrator Deduplication:** In `executeUnifiedIngestion`, Prosas URLs completely bypass the "Database & Queue Deduplication Shield". Instead, all extracted Prosas URLs are accumulated into the `globalProsasUrlsToBatch` array and simply deduplicated in memory using `[...new Set(globalProsasUrlsToBatch)]`.
3. **The Result:** The scraper returned ~1000 items, but because the pagination logic failed to actually retrieve new items, 961 of those were exact duplicates of the first 39 unique items. The `Set` correctly reduced them, meaning no valid/new editais were lost—they were just never scraped.

### Proposed Solution
*   **Fix Pagination Sync:** In `ProsasScraper.ts`, refactor the pagination logic to ensure the DOM updates and the correct subsequent API request is fired and resolved before proceeding to the next loop iteration. Use strict state tracking (e.g., verifying the page number in the API response matches the expected page).

---

## 2. The `spawn EFAULT` Concurrency Issue

### Analysis of the Bottleneck
The `spawn EFAULT` crash during `chromium.launch` in the second batch is a direct result of Cloud Functions Gen 2 concurrency settings clashing with the serverless Chromium package (`@sparticuz/chromium`).

1. **Shared Environment:** Cloud Functions Gen 2 supports concurrent request processing within the exact same container instance (defaulting to 80 concurrent requests).
2. **Race Condition in `/tmp/`:** When two `prosasAuthenticatedWorker` tasks are dispatched simultaneously, both execute `chromium.launch()` inside the same container. `@sparticuz/chromium` attempts to unpack the heavy Chromium binary into the shared `/tmp/` directory. The concurrent executions cause a race condition (e.g., one reads while the other writes, or both attempt to modify the same Playwright profile data), leading to the `spawn EFAULT` corrupted binary error.
3. **Memory Exhaustion:** Additionally, running multiple Chromium instances concurrently within a single function instance rapidly exhausts the tiny `/dev/shm` (shared memory) partition, crashing the browser.

### Proposed Solution
*   **Isolate Executions:** Modify the Cloud Function deployment configuration for `prosasAuthenticatedWorker` to enforce strict isolation by setting `concurrency: 1`. This ensures each Cloud Task spins up its own dedicated container with an isolated `/tmp/` directory, safely bypassing the race condition.

---

## 3. The PDF Parse `length` Error

### Analysis of the Bottleneck
The error `TypeError: Cannot read properties of undefined (reading 'length')` during PDF extraction in `fetchAndExtractText` and `prosasAuthenticatedWorker` is caused by a misunderstanding of the return signature of the `pdf-parse` library wrapper.

1. **The Bug:** The code does:
   ```typescript
   const pdfData = await parser.getText();
   return pdfData.text.replace(/\s+/g, ' ').trim();
   ```
2. **The Root Cause:** In the custom wrapper or this specific implementation context of `pdf-parse`, `parser.getText()` returns a raw **string**, not an object containing a `.text` property.
3. **The Crash:** Because `pdfData` is a string, `pdfData.text` evaluates to `undefined`. When the code implicitly or explicitly tries to evaluate the length of the string later (or via `pdfData.text.length` logged in `prosasAuthenticatedWorker`), it calls `undefined.length`, which throws the exact `TypeError` observed.

### Proposed Solution
*   **Correct Variable Access:** Update the PDF extraction logic to check the type of the returned data. If `parser.getText()` returns a string directly, use it directly (e.g., `const rawText = typeof pdfData === 'string' ? pdfData : pdfData.text;`).

---

## 4. Extraction Worker Instability (260 Errors)

### Analysis of the Bottleneck
The `extractionWorker` processes raw text by invoking the `extractEditalRules` Genkit flow (which calls the Vertex AI Gemini model). The 260 errors stem from a combination of AI rate limiting, strict Zod validation conflicts, and automatic task retries.

1. **Genkit Rate Limits (429s):** The worker is configured with `rateLimits: { maxConcurrentDispatches: 2 }`, but global ingestion triggers a massive spike of tasks. The Gemini API (`vertexai/gemini-2.5-flash`) likely hits its Quota/Rate limits, throwing 429 exceptions.
2. **Infinite Retry Loop:** Because `extractionWorker` does not wrap the `extractEditalRules` call in a safe `try/catch` that swallows 429s or validation errors, any failure bubbles up. Firebase Cloud Tasks automatically retries the task up to 3 times (`retryConfig: { maxAttempts: 3 }`). Therefore, ~80 failing URLs quickly balloon into 240+ logged errors.
3. **Firestore Zod Converter Conflict:** When the worker successfully generates an edital, it injects timestamp fields (`createdAt`, `updatedAt` via `FieldValue.serverTimestamp()`) and attempts to save using `{ merge: true }` through a Zod `withConverter`. However, if the merged object doesn't perfectly align with the strict `editalSchema` (e.g., missing default fields stripped during a partial update), the `.parse()` method inside the converter throws a validation error, failing the task and triggering another retry.

### Proposed Solution
*   **Error Handling & Dead Lettering:** Implement a strict `try/catch` around the Genkit execution. If a 429 Quota error occurs, gracefully defer or dead-letter the task instead of crashing.
*   **Safe Converter Updates:** Bypass `withConverter` for complex merges involving `FieldValue` tokens, or ensure the Zod schema explicitly allows and retains `FieldValue` types during the `.parse()` operation before writing to Firestore.