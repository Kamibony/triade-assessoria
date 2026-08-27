# Architectural Audit & Analysis: Tríade Assessoria Pipeline

## Executive Summary
This document provides a comprehensive architectural audit and analysis of the two major data ingestion and matchmaking tracks within the Tríade Assessoria repository:
1. **The Data Lake Ingestion Pipeline ("Široká sieť"):** The mass-ingestion scraping system.
2. **The Autonomous Matchmaker / Agentic Search ("Ostreľovač" / "Helicopter"):** The targeted, OSC-first search and evaluation system.

The goal is to identify current architectural states, highlight active bottlenecks, and propose pragmatic recommendations to scale these systems effectively, minimizing LLM costs and ensuring robust, non-paid data collection.

---

## Track 1: The Data Lake Ingestion Pipeline ("Široká sieť")

### Current State Architecture
The "Široká sieť" is designed for bulk ingestion across ~45 configured sources. It operates on an event-driven, serverless architecture using Firebase and Google Cloud Tasks.

*   **Orchestration:** Triggered manually (`triggerScrapingWorker`) or via a background cron/orchestrator (`autonomousSearchWorker`, `onSearchCreated`). It enqueues scraping tasks based on `scraping_targets` documents.
*   **Scraping Worker (`processScrapingTargetWorker`):**
    *   Handles concurrent scraping via Cloud Tasks.
    *   Supports multiple strategies: `RSS`, `API`, `HTML`, and a hybrid `AUTO` strategy.
    *   Utilizes **Playwright (with stealth plugin)** specifically for bypassing Cloudflare/bot protections on `Prosas`.
    *   Relies on standard native `fetch` (with exponential backoff) for all other targets to avoid paid proxy services.
    *   Implements a **Circuit Breaker** pattern (`handleScraperFailure`), disabling targets after 3 consecutive failures to prevent endless retries on broken sites.
    *   Implements pagination by replacing a `{{page}}` token or appending a query parameter.
*   **Extraction & Decoupling:** Uses the **Claim-Check pattern**. Raw HTML/text is dumped into a temporary `scraping_contents` collection. A lightweight `extractionWorker` task is enqueued with the document ID.
*   **AI Pre-filtering (Triage):** `triageEditalWebpage` uses Genkit (`gemini-2.5-flash`) to analyze raw text and determine if it's a valid edital before full extraction.
*   **Full Extraction:** Valid editais are processed by `extractEditalRules` to structure the data and generate text embeddings (`vertexai/text-embedding-004`) for vector search, finally saving to the `editais` collection.

### Active Bottlenecks & Vulnerabilities

1.  **LLM Cost & Quotas (The Triage Trap):** Currently, `triageEditalWebpage` is invoked on *every* link discovered that isn't already in the database. Relying solely on `gemini-2.5-flash` for initial triage across 45 sources without prior heuristic filtering is extremely expensive and risks hitting Vertex AI quota limits (HTTP 429) at scale.
2.  **Scraping Fragility:** Relying almost entirely on native `fetch` (outside of Prosas) makes the pipeline highly susceptible to IP bans, Cloudflare captchas, and basic bot protections. The Circuit Breaker will likely disable high-value targets frequently.
3.  **Pagination Limitations:** The current pagination logic (`{{page}}` replacement or naive `?page=`) is rigid. Modern sites use infinite scroll, cursor-based pagination, or GraphQL, which the current `HTML`/`AUTO` strategies cannot handle.
4.  **Data Lake Staging Bloat:** The Claim-Check pattern dumps HTML into `scraping_contents`. While successful extractions delete the temporary doc, failed extractions (or timeouts) leave orphaned documents, causing storage bloat over time.

### Architectural Recommendations

1.  **Implement Heuristic Pre-Filtering:** Before invoking the Genkit `triageEditalWebpage` flow, introduce a lightweight, regex/keyword-based heuristic filter in the scraping worker.
    *   *Action:* Check if the raw text contains essential keywords (e.g., "edital", "inscrição", "prazo", "fomento", "chamada pública"). If not, discard immediately. This will drastically reduce LLM calls.
2.  **Expand Playwright Usage & Free Proxy Rotation:** While paid proxies (ScrapingBee) are avoided, relying on a single GCP IP range is unsustainable.
    *   *Action:* Expand the Playwright (stealth) implementation to be configurable per-target, not just hardcoded for Prosas. Implement a basic, free proxy rotation mechanism (or utilize distinct Cloud Function regions) to distribute requests.
3.  **Decouple Discovery from Fetching:** The `processScrapingTargetWorker` currently discovers links *and* fetches their content synchronously.
    *   *Action:* Split this into two workers: a `DiscoveryWorker` (finds URLs and enqueues them) and a `FetchWorker` (downloads HTML and triggers triage). This allows better error handling and retries specifically for the fetching phase.
4.  **Implement Firestore TTL (Time-To-Live):**
    *   *Action:* Configure a Firestore TTL policy on the `createdAt` field of the `scraping_contents` collection (e.g., 24 hours) to automatically purge orphaned HTML dumps and manage storage costs.

---

## Track 2: Autonomous Matchmaker / Agentic Search ("Ostreľovač")

### Current State Architecture
The "Ostreľovač" strategy is proactive, triggering when new NGOs are onboarded or when new grants are discovered.

*   **Triggers:** Activated manually (`triggerMatchOrchestrator`, `triggerAgenticSearch`) or automatically (`onOscUpdated`, `onEditalCreated`).
*   **Agentic Search (`agenticSearchWorker`):**
    *   Uses Genkit (`generateSearchQueries`) to create 3 targeted Google-style search queries based on the OSC's profile (Location, Mission, Activities).
    *   Executes queries using the **Brave Search API** (native fetch, low latency).
    *   Extracts `{ title, url, snippet }` directly from the search results, bypassing full page scraping.
    *   Generates a vector embedding for the *search snippet* and compares it against the OSC's embedding.
    *   If Cosine Similarity > 0.60, it runs the LLM triage and enqueues for full extraction.
*   **Match Evaluation (`matchEvaluatorWorker`):**
    *   Compares OSCs against Editais.
    *   Uses vector pre-filtering (Cosine Similarity > 0.60) to avoid expensive LLM calls for obvious mismatches.
    *   If the vector check passes, invokes the heavy `scoreMatch` Genkit flow to determine eligibility, score (0-100), and generate a detailed reasoning/action plan.
    *   Implements caching (checking `updatedAt` timestamps) to avoid redundant evaluations.

### Active Bottlenecks & Vulnerabilities

1.  **The "Thundering Herd" Problem (`onEditalCreated`):** Currently, when a *single* new Edital is ingested, the `onEditalCreated` trigger iterates over *every* OSC in the database and enqueues a `matchEvaluatorWorker` task. If there are 10,000 OSCs, one new grant creates 10,000 concurrent tasks. This will immediately exhaust Cloud Tasks queues and Vertex AI quotas.
2.  **Snippet-Based Fallacy in Agentic Search:** Evaluating vector similarity and running LLM triage on a Brave Search *snippet* (typically 150 chars) is highly inaccurate. Snippets rarely contain the specific eligibility criteria or deadlines needed to determine a true match, leading to false positives (wasted extraction) or false negatives (missed opportunities).
3.  **Search Scope Limitations:** The Brave Search API is currently hardcoded to return only 3 results (`count=3`) per query. This severely limits the "Agentic" discovery capabilities.

### Architectural Recommendations

1.  **Reverse Vector Indexing for Match Orchestration:** Fix the Thundering Herd.
    *   *Action:* Modify `onEditalCreated`. Instead of enqueueing tasks for *all* OSCs, use Vertex AI Vector Search (or a lightweight nearest-neighbor query in Firestore if supported/indexed) to find the top $K$ (e.g., Top 50) most similar OSC embeddings. Only enqueue `matchEvaluatorWorker` tasks for those highly probable candidates.
2.  **Fetch Full Content for Agentic Search:** Stop evaluating snippets.
    *   *Action:* Use the Brave Search snippet *only* as an initial, extremely loose heuristic. For promising links, the `agenticSearchWorker` must fetch the full HTML content (reusing the fetch logic from the Data Lake pipeline) before generating embeddings or running the LLM triage.
3.  **Expand Search Depth & Batching:**
    *   *Action:* Increase the Brave Search result limit (e.g., `count=10`). Ensure the `matchEvaluatorWorker` Cloud Task queue has stricter `maxDispatchesPerSecond` limits to smooth out the load on the Gemini API and avoid HTTP 429 errors during bulk updates.

---

## Conclusion
The Tríade Assessoria architecture successfully implements a modern, serverless AI pipeline. However, scaling requires moving away from brute-force LLM evaluation toward a funnel approach: use fast, cheap heuristics (keywords) and vector mathematics (embeddings) to aggressively filter the data *before* invoking expensive Genkit flows. Implementing TTLs and mitigating the "Thundering Herd" orchestration issue are critical immediate steps to ensure platform stability and cost-efficiency.
