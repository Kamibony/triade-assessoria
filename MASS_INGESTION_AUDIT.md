# Architectural Audit & Orchestration Strategy: Mass Ingestion vs Agentic Search

## 1. Current State Analysis

When a batch of 100 new OSCs is ingested via the Mass Importer (`ingestOscDataFunction` -> `processOscChunkWorker`), the following sequence of events occurs:

1. **Mass Ingestion:** `processOscChunkWorker` fetches data from IPEA and BrasilAPI, and upserts the data into the `oscs` Firestore collection.
2. **Trigger Activation:** This upsert operation triggers the `onOscUpdated` Cloud Function (because critical fields like `location`, `coreActivities`, etc., change).
3. **The Thundering Herd:** Inside `onOscUpdated`, two very dangerous actions are taken:
   - **Internal Matches Fan-out:** It fetches **all** open `editais` and enqueues a `matchEvaluatorWorker` task for every single Edital-OSC combination. For 100 OSCs and 1,000 editais, this is 100,000 tasks instantly queued.
   - **Full External Search:** It directly enqueues an `agenticSearchWorker` task for the updated OSC.

**Conclusion:** It does **not** only trigger a Tier 1 match. It blindly triggers the **full** Agentic Search (including Vertex AI, Brave API, and Genkit LLM) for *every* updated OSC, leading to severe API rate limits (HTTP 429), massive LLM token waste, and potential queue exhaustion.

## 2. Proposed Architectural Changes

To safely decouple Mass Ingestion from Agentic Search and ensure cost-effective scaling, I propose the following orchestration strategy:

### A. Remove Automated Cascades from `onOscUpdated`

- **Action:** Delete the logic inside `onOscUpdated` that automatically fans out to `matchEvaluatorWorker` and `agenticSearchWorker`.
- **Rationale:** Mass ingestion should only focus on data synchronization. Post-processing should be decoupled and tightly controlled.

### B. Implement a "Slow-Burn" Cron Orchestrator

- **Action:** Create a scheduled Cloud Function (e.g., `scheduleAgenticSearchCron` running hourly or daily).
- **Mechanism:**
  - This job queries the `oscs` collection for a small, controlled batch (e.g., 5-10 OSCs) sorted by a `lastSearchAt` timestamp (or `null` for new ones).
  - It then enqueues these few OSCs to `agenticSearchWorker`.
- **Rationale:** This ensures we continuously process our OSC database without ever spiking API requests to Vertex AI or incurring sudden LLM costs.

### C. Manual & VIP Triggers

- **Action:** Retain and rely on the `autonomousSearchWorker` or a dedicated HTTP callable function to allow manual triggers from the frontend dashboard.
- **Rationale:** Users who want instant results for their specific OSC can explicitly request it, providing a natural rate-limit and allowing for future VIP/Premium tiering.

### D. Optimize Internal Matching (Tier 1)

- **Action:** Since we are removing the `onOscUpdated` fan-out, internal matching will now be handled natively by Tier 1 of the `agenticSearchWorker` when it is executed (either via the Cron job or Manually).
- **Rationale:** The Agentic Search already contains an efficient Tier 1 step that uses vector similarity to evaluate the top 100 internal editais. Relying on this is far more efficient than enqueuing 1-to-1 tasks for every edital in the database.

By implementing this architecture, we neutralize the Thundering Herd risk, control our Vertex/LLM spend precisely, and establish a scalable pipeline for infinite OSC ingestion.
