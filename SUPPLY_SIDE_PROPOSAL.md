# Supply Side: Edital Ingestion Pipeline Architecture Proposal

## 1. Data Provenance & Analytics

**Current State:**
Editais are currently stored in the `editais` collection. The main field tracking origin is `sourceUrl`. There is no structured field specifically tracking the *discovery method* (e.g., "Vertex", "Prosas Auth", "Prosas RSS", "Manual", etc.). The `searchId` is sometimes used, but it's overloaded (sometimes an `oscId`, sometimes a manual string).

**Proposed Solution:**
*   **Structured Discovery Field:** Add a required `discoverySource` field to the `editalSchema` in `functions/src/shared/schemas.ts`. Values should be an enum: `PROSAS_AUTH`, `PROSAS_RSS`, `VERTEX_SEARCH`, `BRAVE_API`, `MANUAL`, `OTHER`.
*   **Propagate Source:** Update all discovery mechanisms (`routeEditalUrl`, `prosasBulkDiscoveryWorker`, `enqueueEditalExtraction`, `processScrapingTargetWorker`) to explicitly pass this `discoverySource` through the pipeline (into the `scraping_contents` payload and eventually to `extractionWorker`).
*   **UI Analytics Dashboard:** Build a new route in the admin frontend (e.g., `/admin/supply-analytics`). This dashboard will query the `editais` collection and aggregate counts by `discoverySource`. It should also show conversion rates (e.g., number of URLs discovered vs. number of valid `editais` successfully parsed and saved).

## 2. Lifecycle Management (Expiration Handling)

**Current State:**
Editais have a `deadline` field (YYYY-MM-DD), but there is no active mechanism to sweep the database and mark them as expired or remove them from active matchmaking queues.

**Proposed Solution:**
*   **Status Field:** Add a `status` field to the `editalSchema`: `ACTIVE`, `EXPIRED`. Default to `ACTIVE`.
*   **Nightly Sweeper Job:** Create a new scheduled Cloud Function (e.g., `sweepExpiredEditaisCron`) running nightly at 00:00.
    *   It will query `editais` where `status == 'ACTIVE'` and `deadline < today`.
    *   It will update the status of these documents to `EXPIRED`.
*   **Matchmaker Queue Cleanup:** The sweeper job should also query the `matches` collection to find pending/active matches linked to the expired edital and update their `status` to a terminal state (e.g., `Inelegível (Edital Expirado)`).
*   **Vector Search Exclusion:** Ensure that any vector search queries (like `findNearest` in `scheduledMatchSweeper`) explicitly filter for `status == 'ACTIVE'`. Expired editais remain in the DB for historical data but won't be matched.

## 3. Auditing & Scaling the Dedicated Scrapers

### Audit: Prosas Scraper
**Current Implementation:**
The Prosas scraper (`prosasAuthenticatedWorker` and `prosasBulkDiscoveryWorker`) uses a highly resilient architecture. It attempts to download a pre-warmed session state (`prosas_session.json`) from a GCS bucket. If the session is invalid or missing, it falls back to `renewProsasSessionInternal()`, which launches Playwright inline, logs in using `PROSAS_USERNAME` and `PROSAS_PASSWORD` environment variables, and uploads the new session back to GCS. There is also a cron job (`renewProsasSessionCron`) that attempts to keep the session fresh weekly.

**Vulnerabilities & Fixes:**
*   **Silent Authentication Failure:** If the Prosas password changes, or if Prosas implements a CAPTCHA that Playwright cannot bypass, `renewProsasSessionInternal()` will fail. While it logs an error and throws, there is no active alerting mechanism.
*   **Alerting Mechanism:** We need to implement an alert (e.g., via Email, Slack webhook, or a specialized Firestore collection `system_alerts` that the UI listens to) specifically inside the `catch` block of `renewProsasSessionInternal()`. This notifies the admin that the manual GitHub Secrets/Environment variables need updating or that the scraping strategy is fundamentally blocked.

### Scale: Replicating the Strategy
Based on the current architecture, the Prosas integration is complex because Prosas requires authentication.
**Recommendations:**
1.  **Analyze Provenance First:** Before building more dedicated scrapers, implement the Data Provenance (Section 1) changes and let it run for a few weeks. Identify which *other* portals (currently being caught by Vertex/Brave) yield the highest number of *valid* editais.
2.  **Evaluate Target Complexity:** If a high-yield portal does *not* require authentication (e.g., a standard government Diário Oficial or open grant portal), rely on the existing Agentic RSS or Brave API strategies, perhaps tweaking prompts for better extraction. Do not build a dedicated Playwright scraper unless absolutely necessary due to heavy JS rendering.
3.  **Authentication-gated Portals:** If a major source *does* require authentication (similar to Prosas), then yes, the Prosas architecture (GCS session state + inline Playwright renewal) should be generalized into a reusable `AuthenticatedScraperBase` class/module to support new targets easily.