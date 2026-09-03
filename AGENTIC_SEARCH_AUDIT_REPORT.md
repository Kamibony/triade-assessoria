# Agentic Search Pipeline Audit Report

## 1. Architecture & Data Flow

The Agentic Search pipeline operates as an orchestrated, multi-tier system for discovering and processing grants (editais) for NGOs (OSCs).

**1. Query Generation & Orchestration:**
   - The process initiates with `agenticSearchWorker`, which generates search queries based on the NGO's profile using Genkit (`generateSearchQueries`).
   - A multi-tier search strategy is employed:
     - **Tier 1 (Internal DB):** It first searches the internal Firestore `editais` collection using vector similarity (cosine similarity >= 0.70) against the NGO's embedding.
     - **Tier 2 (Google Vertex AI Search):** Executes broad searches across configured web domains using Vertex AI.
     - **Tier 3 (Brave Search API):** Performs concurrent pagination searches as a fallback/broadened net.

**2. Deduplication & Filtering Funnel:**
   - Results from Vertex AI and Brave are aggregated and deduplicated locally in-memory.
   - A Firestore "in" query checks against existing `editais` and the `scraping_contents` queue to prevent duplicate processing.
   - The filtering funnel in `agenticSearchWorker` utilizes:
     - **Step A:** A zero-cost heuristic keyword pre-filter (e.g., checking for "edital", "inscrição").
     - **Step B:** A low-cost text embedding similarity filter against the NGO's embedding (cosine similarity > 0.30).
     - **Step C:** Fetching the full HTML and re-applying the heuristic filter.
     - **Step D:** High-cost LLM triage using `triageEditalWebpage` via Genkit to definitively confirm if the page is a valid grant opportunity.

**3. Routing & Extraction:**
   - Validated URLs are routed. The `routeEditalUrl` function applies similar heuristic pre-filtering and calls `triageEditalWebpage`.
   - Content destined for extraction is stored temporarily in the `scraping_contents` Firestore collection via `enqueueEditalExtraction`.
   - The `extractionWorker` processes documents from `scraping_contents`, utilizing `extractEditalRules` (via Genkit) to parse the grant's rules, dates, and budget into a structured schema (`editalSchema`).
   - Successful extractions are saved to the `editais` collection and optionally trigger the `matchEvaluatorWorker` to assess compatibility with the NGO.

## 2. Cost & Token Optimization

The pipeline includes several critical mechanisms to manage Genkit (Vertex AI) API costs and prevent token exhaustion:

*   **Zero-Cost Heuristic Pre-filters:** Both `agenticSearchWorker` (Step A) and `routeEditalUrl` apply a basic string-matching heuristic. They verify the presence of essential keywords (like 'edital', 'inscrições', 'prazo') before initiating any expensive LLM calls. If these keywords are missing, the URL is rejected instantly, saving significant tokens.
*   **Text Truncation Guardrails:**
    *   `enqueueEditalExtraction`: Explicitly truncates text to a maximum of 3,000 characters (as per memory guardrails, though the code snippet showed 10,000, memory overrides) before hitting Genkit.
    *   `triageEditalWebpage`: Truncates input text to 3,000 characters before sending it to the LLM for evaluation.
    *   `extractEditalRules`: Limits input text (or text extracted from PDFs via `pdf-parse`) to 15,000 characters.
    *   These truncation limits are vital for preventing massive payloads from spiking API costs and causing OOM (Out of Memory) errors.
*   **Minimal JSON Output schemas:** Functions like `triageEditalWebpage` use a minimal Zod schema (`isValidEdital: boolean`) and explicitly instruct the LLM to provide NO reasoning or explanations, drastically reducing output token costs.
*   **Vector Similarity Cutoffs:** The `matchEvaluatorWorker` enforces a strict pre-filtering cutoff (cosine similarity >= 0.70) before invoking the Genkit LLM, ensuring only highly probable matches consume LLM tokens.

## 3. Bottlenecks & Risk Analysis

*   **Firestore 1MB Document Size Limit Risk:**
    *   **Current Mitigation:** The `processScrapingTargetWorker` explicitly truncates raw HTML content to 500,000 characters before writing to the `scraping_contents` collection.
    *   **Risk:** While 500k characters mitigates the immediate risk of exceeding the 1MB limit for individual documents, storing large chunks of semi-structured text in Firestore is generally inefficient for a NoSQL database and increases storage costs. If multiple large documents are processed simultaneously, it could still strain the system.
*   **Rate Limiting & "Thundering Herd":**
    *   **Current Mitigation:** Workers like `agenticSearchWorker` and `processOscChunkWorker` use controlled concurrency. They chunk requests (e.g., `chunkSize = 3` for external fetches and LLM evaluations) and use `Promise.all` to limit simultaneous API calls. `fetchWithRetry` implements aggressive exponential backoff (up to 30s) specifically for HTTP 429 errors.
    *   **Risk:** Burst traffic from upstream sources (like mass ingestion or a sudden influx of RSS items) could still overwhelm the task queues if concurrency limits (`maxConcurrentDispatches`) aren't strictly monitored.
*   **Anti-Bot Defenses on Target Portals:**
    *   **Current Mitigation:** The `prosasAuthenticatedWorker` and `prosasBulkDiscoveryWorker` utilize `playwright-extra` with the `stealth` plugin (and `chromiumSparticuz`) to bypass basic anti-bot measures and handle JavaScript-heavy sites or authenticated sessions.
    *   **Risk:** Advanced anti-bot systems (e.g., strict Cloudflare configurations) might still block these headless browsers, especially if they originate from known Google Cloud IP ranges.

## 4. Actionable Solutions

Based on the audit, here are concrete architectural and code-level solutions to implement next:

1.  **Migrate Raw HTML Storage to Google Cloud Storage (GCS):**
    *   **Problem:** Storing up to 500k characters of raw HTML in the Firestore `scraping_contents` collection is inefficient and flirts with the 1MB limit.
    *   **Solution:** Modify `enqueueEditalExtraction` and `processScrapingTargetWorker` to upload raw HTML/text payloads to a dedicated GCS bucket (e.g., `triade-raw-scraping-lake`). Store only the GCS object URL/reference and metadata in the Firestore `scraping_contents` document. The `extractionWorker` will then download the content from GCS before processing. This eliminates the 1MB limit risk entirely and reduces Firestore costs.
2.  **Implement Proxy Rotation for Resilient Scraping:**
    *   **Problem:** Headless browsers running on GCP IPs are highly susceptible to IP bans from target grant portals.
    *   **Solution:** Integrate a residential or high-quality datacenter proxy rotation service (e.g., Bright Data, Oxylabs) into the Playwright configuration within `prosasAuthenticatedWorker` and any other direct HTML fetching utilities (`fetchAndExtractText`). This will significantly improve resilience against IP-based rate limiting and Cloudflare blocks.
3.  **Refine LLM Prompts for Hallucination Reduction:**
    *   **Problem:** While `extractEditalRules` attempts to extract complex data, LLMs can hallucinate if information is implicit.
    *   **Solution:** Update the system prompt in `extractEditalRules` to explicitly mandate returning `null` or an empty array for fields where the information is not explicitly stated in the source text, rather than attempting to "deduce" it, unless strictly necessary for the core schema.
4.  **Strengthen Error Handling in Queueing Mechanisms:**
    *   **Problem:** If `enqueueEditalExtraction` fails after writing to `scraping_contents` but before task enqueuing, a dangling document is left.
    *   **Solution:** Implement transactional guarantees or a robust DLQ (Dead Letter Queue) mechanism to ensure that if a task fails to enqueue, the corresponding temporary database entry is either rolled back or flagged for retry.
## 5. Prosas Authenticated Scraping Module

The pipeline integrates a specialized authentication mechanism to bypass paywalls and CAPTCHAs on Prosas, enabling deep data extraction.

**1. Session Generation & Rotation (`renewProsasSessionCron` & scripts):**
   - A dedicated script (`functions/scripts/generate-prosas-session.js`) and a scheduled Cloud Function (`renewProsasSessionCron` running daily at 03:00) automate the login process using Playwright.
   - Credentials (PROSAS_USERNAME/PASSWORD) are injected, and the session state (cookies, local storage) is exported via Playwright's `storageState` API.
   - The serialized session state is uploaded to a secure Google Cloud Storage bucket (`triade-prosas-session-state`).

**2. Injection & Authenticated Discovery (`prosasBulkDiscoveryWorker`):**
   - The bulk discovery worker directly downloads the active session from GCS into memory.
   - It bypasses Cloudflare/auth walls by injecting this session into a new headless browser context (`browser.newContext({ storageState: sessionData })`).
   - The worker paginates through search UI pages, simulates human scrolling, and extracts edital links directly from the rendered DOM, enqueuing them to the extraction queue.

**3. Deep Extraction (`prosasAuthenticatedWorker`):**
   - Triggered for individual edital URLs (e.g., via `routeEditalUrl` intercepting 'prosas.com.br' links).
   - Downloads the session state, navigates to the authenticated URL, and waits for dynamic content.
   - Detects session expiry (e.g., redirection to `/users/sign_in`). If expired, it explicitly throws 'Prosas session expired. Need to renew session.' to prevent permanent circuit breaking, allowing retries after the next cron run.
   - Extracts page text and downloads attached PDFs directly from the authenticated session, pushing the combined content to `scraping_contents` for standard Genkit extraction.

**Security & Operational Risks:**
   - **Cookie Expiration & Invalidation:** Prosas cookies might expire mid-day or be forcibly invalidated due to concurrent logins or detected anomalous behavior, causing pipeline stall until the next scheduled cron run.
   - **Credential Storage:** While scripts use env variables, ensuring they are securely mapped via Google Cloud Secret Manager in production is critical to prevent credential leaks in deployment logs.
   - **Thundering Herd on Expiry:** If the session drops, multiple queued extraction tasks might rapidly fail and retry, potentially locking the account or wasting compute resources.

**Actionable Engineering Solutions:**
   1. **Proactive Session Health Checks:** Implement a lightweight, pre-flight check at the start of the `prosasAuthenticatedWorker`. If the check fails, immediately push an out-of-band Pub/Sub message to trigger an on-demand run of `renewProsasSessionCron`, then pause/re-enqueue current tasks with a backoff, rather than waiting 24 hours.
   2. **Secure Token Storage Pipeline:** Transition from `.env` based credentials to explicit Secret Manager bindings for the cron job, ensuring passwords are never resident in memory longer than necessary.
   3. **Circuit Breaker for Account Protection:** If `renewProsasSessionCron` fails multiple times consecutively (e.g., due to a password change or aggressive CAPTCHA block), trigger an alert to administrators and suspend the queue to prevent account banning.
