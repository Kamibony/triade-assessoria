# Deep Architectural Audit: Ingestion/Scraping Pipeline

Here is the comprehensive architectural audit of the current ingestion and scraping pipeline across the repository, evaluating the four requested pillars.

## A. Delta Scraping Capability

**Assessment: Weak / Incomplete Delta Strategy**

The system attempts to minimize workload, but relies on a brittle "consecutive zero hits" pagination stop condition rather than a true stateful delta or watermark tracking system.

*   **Implementation:** In `processScrapingTargetWorker` and `prosasBulkDiscoveryWorker`, the system uses a `consecutiveZeroNewCount` variable. If the scraper encounters a set number of consecutive pages (e.g., 2 or 3) where *zero* new, unique editais are enqueued, it stops paginating.
*   **The Flaw:** This approach assumes that platforms always order opportunities perfectly chronologically by publication date. If an older edital is updated and bumped, but sits on page 5, the scraper will never reach it because it hits a wall of duplicate URLs on pages 1-3 and aborts early.
*   **Lack of Watermarking:** There is no concept of a `lastScrapedTimestamp` or `highestSeenId` per target. The scraper starts blindly from Page 1 every night (via `scheduledGlobalIngestion`) and relies on hitting existing URLs to eventually stop.

## B. Robust Deduplication

**Assessment: Moderate, but vulnerable to missing updates and duplicates from URL drift**

Deduplication exists at the ingest boundary, but it is strictly URL-based, meaning it completely ignores content updates and is vulnerable to URL variations.

*   **Implementation:** Deduplication is strictly based on the `sourceUrl` field.
    *   In `prosasBulkDiscoveryWorker`: `const querySnapshot = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();`
    *   In `processScrapingTargetWorker`: `const existingRef = await db.collection('editais').where('sourceUrl', '==', link).limit(1).get();`
*   **The Flaw (No Updates):** If a source (like Prosas) updates a typo in the title or changes a deadline, but the URL remains the same, `existingRef` is not empty. The system completely ignores the link and skips it. We never update existing editais to reflect upstream changes; they become stale.
*   **The Flaw (Duplicates):** If the upstream platform appends a new query parameter (e.g., `?source=newsletter`) or slightly alters the slug, our system treats it as a brand new edital. It will fetch it, spend AI tokens extracting it, generate new vector embeddings, and save a duplicate record into the database, triggering the matchmaker twice.
*   **Missing Features:** There is no UPSERT capability based on a deterministic hash of the content or an explicit `externalProviderId`.

## C. Multi-Source Aggregation Readiness

**Assessment: Low Modularity / High Coupling**

The architecture is tightly coupled to Prosas and lacks a generalized adapter pattern for adding new sources cleanly.

*   **Implementation:** The code is heavily monolithic within `functions/src/index.ts`. The central routing logic (`routeEditalUrl`) contains hardcoded conditions specifically for Prosas: `if (url.toLowerCase().includes('prosas.com.br')) { ... }` which diverts to a highly specialized `prosasAuthenticatedWorker`.
*   **The Flaw:** Adding a new, complex spider (e.g., Diário Oficial) requires modifying the core router, creating new specialized workers, and updating the global orchestration function (`scheduledGlobalIngestion`), which explicitly hardcodes telemetry phases like `prosas: { status: 'RUNNING'... }`.
*   **Missing Interfaces:** The system uses generic `target.strategy` strings (`'AUTO'`, `'RSS'`, `'API'`), but handles them via giant `if/else` blocks rather than utilizing a clean Strategy Pattern with standardized Scraper Interfaces that feed into a unified ingestion queue.

## D. Health Monitoring & Fallbacks

**Assessment: Fragile, with significant single points of failure and database pollution risks**

While basic telemetry exists, the error handling and fallback strategies introduce significant risks to data integrity.

*   **Monitoring Implementation:** The system tracks bulk runs via an `ingestion_runs` collection, updating statuses (`RUNNING`, `COMPLETED`, `FAILED`) and maintaining error arrays.
*   **The Auth Flaw:** The Prosas workers rely entirely on a Playwright session state JSON file stored in GCS (`triade-prosas-session-state`). If this session expires, `renewProsasSessionInternal` attempts to spin up a headless browser, navigate to the login page, and inject credentials. If Prosas introduces a CAPTCHA or slightly alters their login DOM, this silent inline renewal will crash, cascading failures across the entire pipeline. There are no dead-letter queues, only retries that will inevitably fail.
*   **Database Pollution (The "Fallback" Record):** In `extractionWorker`, if the AI extraction fails Zod schema validation, the system executes a catastrophic fallback: it inserts a dummy document into the production `editais` collection.
    ```typescript
    const fallbackDocData = {
        title: "Edital Parcial/Mapeamento Incompleto",
        deadline: "1970-01-01",
        // ... dummy zeros and empty arrays
    };
    ```
    This actively pollutes the Data Lake with garbage records rather than parking the failed extraction in a dedicated review queue.

## Conclusion

Before opening the floodgates to the Reverse Matchmaker, the Data Supply pipeline must be hardened. The reliance on URL-only deduplication and the lack of UPSERT capability guarantees either stale data or duplicates. Furthermore, the practice of inserting "Fallback" dummy records upon extraction failure compromises the integrity of the Data Lake, which will severely degrade the accuracy of downstream matching agents.
