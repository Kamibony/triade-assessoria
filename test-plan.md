1. **Phase 2: Self-Healing Session Management**
   - Create a new scheduled function `renewProsasSessionCron` in `functions/src/index.ts` using `onSchedule`. This function will run periodically (e.g., `'0 3 * * *'` - every day at 3 AM).
   - The cron function will:
     - Launch Playwright with stealth plugins.
     - Navigate to `https://prosas.com.br/users/sign_in`.
     - Login using credentials from `process.env.PROSAS_USERNAME` and `process.env.PROSAS_PASSWORD`.
     - Extract session state.
     - Upload the session state JSON to the GCS bucket `triade-prosas-session-state`.
   - Update `prosasAuthenticatedWorker` to handle session expiry gracefully. If scraping fails (e.g., redirected to login), it should mark a session failure, and potentially queue a session renewal or throw a clear error for the retry mechanism.

2. **Phase 3: Scalable Bulk Ingestion Architecture**
   - Create `prosasBulkDiscoveryWorker` as an `onCall` or `onTaskDispatched` function in `functions/src/index.ts`.
   - This worker will:
     - Fetch `https://prosas.com.br/selecao/api/v2/third_party/oportunidades/inscricoes_abertas?include=area_interesses%2Cincentivador&page%5Bpage%5D={{page}}&page%5Bsize%5D=20&&sort=`.
     - Iterate through pages until no more results are found.
     - Check each extracted edital ID against the `editais` Firestore collection using `sourceUrl` (`https://prosas.com.br/editais/${id}`) to prevent duplicates.
     - For new editais, enqueue tasks to `prosasAuthenticatedWorker` with rate limiting and random delays using `scheduleTime`.

3. **Phase 4: Centralized Guardrails & Resiliency**
   - Update `extractionWorker` (or relevant scraping functions) to increment a `failureCount` field in the target document or a separate retry tracking collection on failure.
   - If `failureCount` reaches 3, write the URL/metadata to a `failed_ingestions` Firestore collection.
   - Ensure text truncation guardrails are applied when passing data to the LLM (already done for PDFs, but need to check standard HTML extraction too).

4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
