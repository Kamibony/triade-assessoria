# Hybrid Engine Architecture Implementation Roadmap

Based on the `ARCHITECTURE.md` blueprint and the current codebase state, here is the systematic, step-by-step milestone plan to safely roll out the new Hybrid Engine (Busca Autônoma & Ingestão em Massa).

## Milestone 1: Backend Decoupling & Unified Ingestion API (The Foundation)
**Goal:** Separate the lightweight, fast scraping and triage phase from the heavy, expensive LLM extraction phase to prevent timeouts, scale better, and respect Google Cloud Tasks payload limits.
- **Step 1:** Create a new Cloud Task worker `extractionWorker` in `functions/src/index.ts`. It will receive the `searchId`, `url`, and a `contentId` (following the Claim Check pattern to bypass 100 KB limits), execute the Genkit `extractEditalRules` flow, save the structured edital to Firestore, and update the search progress (`savedCount`).
- **Step 2:** Refactor `processScrapingTargetWorker`. When `triageEditalWebpage` approves a link, instead of running extraction synchronously, it saves the raw text to a temporary Firestore document and enqueues a task to `extractionWorker`.
- **Step 3:** Implement a unified `ingestEdital` Callable function that accepts URL/Text/HTML, performs triage, uses the Claim Check pattern, and enqueues to `extractionWorker`. Refactor `ingestManualEditalFunction` and RSS sync to use this unified entry point.

## Milestone 2: Scraper Circuit Breakers & Resilience
**Goal:** Prevent faulty scrapers from endlessly retrying, wasting resources, and hitting quotas.
- **Step 1:** Add `failureCount` and `lastFailedAt` tracking to `scraping_targets` documents.
- **Step 2:** Update `processScrapingTargetWorker` to increment `failureCount` upon critical failures (e.g., target unreachable, HTML structure changed).
- **Step 3:** If `failureCount` exceeds a threshold (e.g., 3), automatically toggle the target to `active: false` and generate an alert log.

## Milestone 3: Vector Search Pre-Filtering (Ostreľovač Optimization)
**Goal:** Optimize Genkit costs for matching by using cheap vector embeddings for initial candidate filtering before running the expensive `scoreMatch` prompt.
- **Step 1:** Set up text embeddings generation for OSCs and Editais upon creation/update.
- **Step 2:** Modify `matchEvaluatorWorker` to perform a cosine similarity check first.
- **Step 3:** Only invoke the `gemini-2.5-flash` LLM if the similarity score surpasses a predefined threshold.

## Milestone 4: Frontend Pipeline Observability
**Goal:** Expose the decoupled pipeline states and broken scrapers to the operators.
- **Step 1:** Use `list_files` and `read_file` to thoroughly explore the frontend structure in `src/` to identify the exact components for the Admin Dashboard.
- **Step 2:** Update the identified Admin Dashboard components to visualize the new asynchronous extraction queue status.
- **Step 3:** Enhance the Fontes de Dados (Sources) UI to highlight targets disabled by the Circuit Breaker, allowing admins to fix and reactivate them.
