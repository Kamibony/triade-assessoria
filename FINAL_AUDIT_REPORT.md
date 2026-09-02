# Final Architecture Audit Report

This report outlines critical scale vulnerabilities, silent failures, billing leaks, and downstream side effects present in the current implementation of `triade-assessoria`.

## 1. Downstream Side Effects & Silent Failures
- **`matchEvaluatorWorker` Crash Loop for Sparse OSCs:**
  The `processMatchEvaluation` function uses `ngoProfileSchema.safeParse(rawOscData)` to validate OSC data before processing. If an OSC was mass-imported and lacks required fields (e.g., `foundationDate`, `location`, `documentationStatus`, `previousProjectsApproved`), the parsing will fail, throwing an error (`Invalid OSC data`). This will cause `matchEvaluatorWorker` to fail and retry repeatedly, creating silent failures and queue build-up without ever evaluating the match.
- **`onMatchGenerated` Notification Bug:**
  The threshold trigger `if (currentScore >= MATCH_THRESHOLD && previousScore < MATCH_THRESHOLD)` checks for high scores. However, the silent rejection in `processMatchEvaluation` creates dummy results without evaluating `reasoning` and `actionPlan`. While schema nullable logic is handled, the frontend or notification logic may attempt to parse `actionPlanSnippet` directly, which could be undefined.

## 2. Hidden Token / API Leaks
- **`ingestGoogleAlertsRss` Cron Job Leak:**
  The `ingestGoogleAlertsRss` scheduled function runs every day at 2 AM. It iterates through RSS feeds and calls `routeEditalUrl`, which directly triggers the `triageEditalWebpage` LLM flow for every new link. There is no heuristic pre-filter before checking the database if the link hasn't been ingested. More importantly, this cron job operates silently and unbounded, constantly consuming Gemini tokens for any RSS updates.
- **Cartesian Join in `scheduledMatchSweeper`:**
  This is the **most critical billing and resource leak**. Running weekly, the `scheduledMatchSweeper` fetches *all* `editais` and *all* `oscs`, then enqueues a `matchEvaluatorWorker` task for every missing match combination. If there are 10,000 OSCs and 100 Editais, this enqueues **1,000,000 tasks**. Each task performs a Firestore read, generates embeddings, calculates vector similarity, and potentially invokes Vertex AI. This will easily overwhelm Vertex AI quotas and cause thousands of dollars in hidden charges.

## 3. Database Cost Risks (Firestore)
- **`scraping_contents` 1MB Hard Limit Crash:**
  In `processScrapingTargetWorker` (specifically the HTML and AUTO strategies), the raw HTML of fetched pages is dumped directly into the `scraping_contents` collection (`text: html`). Unlike `enqueueEditalExtraction` which correctly truncates to 10,000 characters, the Data Lake scraper saves the entire HTML string. If a target URL returns a page larger than 1MB, Firestore will throw a fatal `INVALID_ARGUMENT` exception (exceeding document size limits), crashing the worker and triggering retry loops.

## 4. Scale Vulnerabilities
- **PDF Processing Out-of-Memory (OOM) Risks:**
  The `extractEditalRulesFunction` and `parsePdfProfileFunction` endpoints allow Base64 payloads up to 7MB, but are configured with only `512MiB` of memory. When `pdf-parse` converts these large buffers, V8 memory allocation scales drastically. If 20 users upload 5MB PDFs concurrently, the Node.js instances will exceed 512MB and crash (Signal 9 / OOM), dropping the user connections.
- **Thundering Herd via Manual RSS/Agentic Searches:**
  Despite disabling the automatic fan-out in `onOscUpdated`, manually invoking bulk jobs or letting the `scheduledMatchSweeper` loose will overwhelm the `matchEvaluatorWorker` queue (limited to 5 concurrent dispatches). This will lead to a massive backlog in Cloud Tasks, effectively locking up the matching engine for hours.
