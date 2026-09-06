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
## 4. The Orchestrator (`globalIngestionOrchestrator`)
A central Cloud Function will serve as the conductor for all ingestion activities. It can be triggered both by a nightly Cloud Scheduler (cron) and via an HTTP `onCall` function for manual admin overrides.

### The Three Phases
The orchestrator will trigger the following phases asynchronously to avoid timeouts, using a tracking document to monitor progress.

**Phase 1: Prosas Bulk Discovery**
*   **Mechanism:** Enqueue the existing `prosasBulkDiscoveryWorker`.
*   **Safety Control:** Introduce a strict `maxPages` parameter (e.g., 5 or 10) to the worker payload to prevent runaway infinite pagination during daily runs.

**Phase 2: Internal Fontes (Data Lake)**
*   **Mechanism:** Query `scraping_targets` where `status == 'active'`.
*   **Action:** Iterate through active targets and enqueue the `processScrapingTargetWorker` for each.

**Phase 3: Vertex AI & RSS Predefined Queries**
*   **Mechanism:** Trigger the `processRssFeeds` logic and potentially a predefined set of high-value Agentic Search queries that aren't tied to a specific OSC but run globally (e.g., general "fomento cultura 2024" searches).

### Architecture Flow
1.  Admin clicks "Force Run Now" OR Cron triggers at 02:00 AM.
2.  Orchestrator creates a new `ingestion_runs` document in Firestore with status `running`.
3.  Orchestrator dispatches Cloud Tasks for Phase 1, 2, and 3, passing the `runId`.
4.  Workers execute, and update the `ingestion_runs` document with their specific metrics (upserting into a subcollection or array).
5.  When all queues drain (or timeout), a sweeper or the final task updates the status to `completed`.

---

## 5. The Analytical Radar (Database Schema)
To provide the "Receipt" of execution, we need a durable log of every run. We will create a new root collection: `ingestion_runs`.

**Collection:** `ingestion_runs`
**Document ID:** Auto-generated (or timestamp-based `YYYYMMDD-HHMMSS`)

```typescript
interface IngestionRun {
  id: string; // Document ID
  triggerSource: 'CRON' | 'MANUAL_ADMIN';
  triggeredBy: string | null; // Admin UID if manual
  startTime: Timestamp;
  endTime: Timestamp | null;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PARTIAL_SUCCESS';

  // High-level Aggregates
  totalUrlsScanned: number;
  totalValidEditaisFound: number;
  totalErrors: number;

  // Granular Metrics per Phase
  phases: {
    prosas: {
      status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      pagesScanned: number;
      urlsDiscovered: number;
      newEditaisEnqueued: number;
      errors: string[];
    },
    internalFontes: {
      status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      targetsProcessed: number;
      urlsDiscovered: number;
      newEditaisEnqueued: number;
      errors: string[]; // e.g., "Target ABCR failed: Timeout"
    },
    rssAndQueries: {
      status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
      feedsProcessed: number;
      urlsDiscovered: number;
      newEditaisEnqueued: number;
      errors: string[];
    }
  }
}
```
*Note: To avoid the 1MB Firestore limit, we will not store every single URL in this document. We track counts here. If granular URL tracing is required, we can link to the `scraping_contents` collection via a `runId` field.*

---

## 6. Admin Control Center UI
A new dashboard view will be created at `/admin/ingestion-radar` (or integrated into the existing Data Sources page).

### Components
1.  **Status & Control Header:**
    *   Current Status Indicator (e.g., 🟢 Idle, 🔵 Running Phase 2...).
    *   **"Forçar Sincronização Global" Button:** A prominent button that calls the orchestrator `onCall` function. It disables while a run is active.
    *   Next Scheduled Run countdown.

2.  **Live Radar (Active Run):**
    *   If a run is active, display a live progress interface (listening via `onSnapshot` to the active `ingestion_runs` document).
    *   Show progress bars or spinners for each of the 3 phases.

3.  **Historical Receipts (Data Table):**
    *   A paginated table listing historical runs from `ingestion_runs`.
    *   Columns: Date, Trigger (Manual/Cron), URLs Scanned, Valid Found, Errors, Status.
    *   Clicking a row expands a detailed view showing the breakdown per phase (Prosas vs. Fontes vs. RSS).

### Future Enhancements
*   Visual charts showing ingestion volume over the last 30 days.
*   Error highlighting to quickly identify if a specific target in "Internal Fontes" is chronically failing and needs a Circuit Breaker reset.
