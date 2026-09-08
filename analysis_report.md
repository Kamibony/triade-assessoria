# Edital Ingestion Pipeline: Architectural and Risk Analysis

This report outlines the architecture, data flow, and potential risks of the Edital Ingestion Pipeline before mass repopulation of the Data Lake.

## 1. Ingestion Channels & Mechanics

### RSS Feeds (`processRssFeeds` / `rssWorker`)
*   **Mechanism:** Scheduled ingestion (`scheduledGlobalIngestion`) triggers the `rssWorker`.
*   **Operation:** The worker (`rssWorker`) calls `processRssFeeds`. This function fetches RSS feeds (currently configured in the code, e.g., Google News). It iterates through the feeds and their items.
*   **Volume Control:** It explicitly limits processing to the top 5 items per feed to prevent token leaks and excessive LLM calls.
*   **Routing:** For each item, it calls `routeEditalUrl(item.link, "RSS", undefined, undefined, "PROSAS_RSS")`.

### Vertex AI Search & Predefined Queries (`processPredefinedQueries`)
*   **Mechanism:** `rssWorker` also triggers `processPredefinedQueries`.
*   **Operation:** Executes predefined queries against Vertex AI Search using native fetch calls.
*   **Volume:** Retrieves search results.
*   **Routing:** For each search result link, it calls `routeEditalUrl(link, "VERTEX_SEARCH", undefined, { searchQuery: query }, "VERTEX_SEARCH")`. Note: There's a `try/catch` wrapper required for fetch calls to prevent crashes.

### Scraping Targets / Fontes (`processScrapingTargetWorker`)
*   **Mechanism:** Triggered via queues, taking objects with HTML/API/RSS/AUTO strategies.
*   **Operation:** A background task (`processScrapingTargetWorker`) processes a target URL.
    *   **AUTO Strategy:** Avoids LLM calls for link selection. Uses `cheerio` locally with regex inclusion/exclusion filters matching structural URL patterns (`/edital/`, `chamada`). Limits pagination depth to 5 pages. Stops if 2 consecutive pages yield zero links. Uses `scraping_cache` for deduplication.
*   **Routing:** Extracted links are passed to `routeEditalUrl` (e.g., passing "VERTEX_SEARCH" as `discoverySource`).

### Prosas Specialized Pipeline
*   **Mechanism:** Split into discovery and authenticated extraction.
*   **Discovery (`prosasBulkDiscoveryWorker`):** Scrapes Prosas for listing pages. Enqueues individual opportunity URLs to the `prosasAuthenticatedWorker`.
*   **Extraction (`prosasAuthenticatedWorker`):** Uses Playwright with authenticated session state (maintained via GitHub Secrets and `renewProsasSessionInternal`). Fetches full content behind the login.
*   **Routing:** Directly calls `enqueueEditalExtraction(url, combinedText, "Authenticated Prosas Scraping", searchId, "PROSAS_AUTH")`. It bypasses the standard `routeEditalUrl` heuristic/AI filtering because Prosas data is highly structured.

### Agentic Search (`agenticSearchWorker`)
*   **Mechanism:** Triggered per OSC (e.g., manually via `triggerAgenticSearch` after OSC ingestion).
*   **Operation:** Uses Firestore's native `.findNearest()` with `COSINE` distance. Locally pre-filters for similarity (`1 - vectorDistance >= 0.25`) and limits to 15 candidates before LLM evaluation.
*   **Integration:** It performs its own search and extraction logic.
*   **Routing:** When it finds a valid edital, it directly calls `enqueueEditalExtraction`. *Crucially*, it passes `AGENTIC_${oscId}` as the `searchId`.

## 2. Pipeline Interconnection & Routing

All discovery channels funnel towards extracting text and validating the edital.

1.  **Discovery:** Raw URLs are discovered via RSS, Vertex AI, Scraping Targets, or Agentic Search.
2.  **Routing (`routeEditalUrl`):** Except for Prosas authenticated links, URLs go to `routeEditalUrl`.
    *   **Prosas Trap:** If the URL is `prosas.com.br`, it redirects immediately to `prosasAuthenticatedWorker`.
    *   **Extraction:** Calls `fetchAndExtractText(url)`.
    *   **Heuristic Filter:** Applies an AND-gate text filter (requires Primary AND Secondary keywords) to minimize false positives and LLM costs.
    *   **LLM Evaluation:** Sends text to an LLM evaluator (`triageEditalWebpage`).
    *   **Dispatch:** If approved by the LLM, it calls `enqueueEditalExtraction`.
3.  **Queueing (`enqueueEditalExtraction`):** Prepares the data, adds telemetry (`discoverySource`), and enqueues to `extractionWorker`.
4.  **Extraction & Storage (`extractionWorker`):**
    *   Receives the text.
    *   Uses a Genkit flow (with Zod schema `editalSchema`) to structure the data.
    *   **Storage:** Saves the document to the `editais` Firestore collection.
    *   **Fallback:** If Zod parsing fails, it *must* still save the raw text with a `parseError: true` flag to prevent data loss.

## 3. Risks, Threats, & Failure Points

### Rate Limits / HTTP 429 Errors
*   **Vertex AI:** Native fetch calls in `processPredefinedQueries` lack built-in retry logic. A burst of requests could hit rate limits. The current memory dictates wrapping these in `try/catch` with graceful degradation.
*   **Prosas/Web Scraping:** `processScrapingTargetWorker` uses a concurrency limit (e.g., `p-limit(3)`). However, heavy scraping queues must have `retryConfig: { maxAttempts: 1 }` (or 2) to prevent infinite loops and GCP budget drain upon repeated 429s or blocks.

### Session Expiration (Prosas)
*   **Risk:** Playwright sessions expire.
*   **Mitigation:** `renewProsasSessionInternal` attempts to renew. If it fails (CAPTCHA, bad creds), it writes to the `system_alerts` collection. If the session is invalid, `prosasAuthenticatedWorker` tasks will fail. The `retryConfig` must be strictly limited to prevent a queue pileup.

### Memory / OOM Threats (`fetchAndExtractText`)
*   **Risk:** Processing large PDFs or unthrottled concurrent requests can crash the worker.
*   **Mitigation (Current/Required):**
    *   Memory allocation: Heavy workers must use `memory: '2GiB'`.
    *   PDF Checks: `fetchAndExtractText` must check `Content-Length` (reject > 10MB) *before* stream conversion.
    *   PDF Parsing: Use `Uint8Array` conversion (`new Uint8Array(Buffer.from(arrayBuffer))`) and `pdf-parse` v2.4.5 API instead of Base64 to prevent OOM.
    *   Concurrency: Use `p-limit` in workers instead of unthrottled `Promise.all`.

### Data Corruption & Fallback Objects
*   **The 2099 Bug:** If Zod parsing fails in `extractionWorker`, it persists a fallback document to `editais` with dummy values (e.g., deadline `2099-12-31`).
*   **Risk:** Downstream agents (like `bureaucracyAgentFlow`) or queries might ingest these dummy values as valid data, causing logical errors in processing.
*   **Mitigation:** Downstream consumers *must* check for the `parseError: true` flag or validate the dates before acting on the data. Prompt engineering should also forbid LLMs from hallucinating specific data formats.

### Other Critical Landmines
*   **Search ID Pseudo-IDs:** `processScrapingTargetWorker` uses `GLOBAL_RUN`, `RSS`, etc. Code updating `searches/{searchId}` must explicitly skip these to prevent `NOT_FOUND` errors that crash tasks.
*   **Agentic Search Hand-off:** `extractionWorker` relies on the `AGENTIC_${oscId}` prefix to extract the target OSC. If formatted incorrectly, the connection is lost.
*   **Firestore 500-Write Limit:** Batch updates (especially those with 768-dim vectors) must be limited to 50 documents, not 500, to avoid "Transaction too big" errors.
*   **Silent Hangs:** Workers must explicitly update their status in `ingestion_runs` using `try/catch` blocks. Unhandled exceptions will leave the run hanging indefinitely in a 'RUNNING' state until swept by the `scheduledIngestionTimeoutSweeper` (45 min timeout).
