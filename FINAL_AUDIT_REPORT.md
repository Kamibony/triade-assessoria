# Final Architectural Audit Report

## 1. Concurrency Bottlenecks (PDF Parsing)
**Analysis:**
The PDF parsing endpoints (`parsePdfProfileFunction` and `extractEditalRulesFunction`) are implemented as synchronous `onCall` HTTPS functions with a strict `concurrency: 2` limit. Because these are direct client-to-server HTTP invocations rather than asynchronous background tasks (like `onTaskDispatched`), there is no persistent queue managing excess load.
When the 3rd or 10th concurrent request arrives, Cloud Run for Gen 2 Functions will attempt to spin up new container instances (cold starts). If the influx of requests outpaces the platform's ability to provision new instances, or if a `maxInstances` cap is reached, the surplus requests will hang and eventually terminate with HTTP 429 (Too Many Requests) or a timeout error (HTTP 504/500).
**UX Impact:** The UI does not have a reliable queue for this. Users uploading multiple PDFs simultaneously will experience abrupt failures and error messages instead of graceful background processing.

## 2. Silent Failure UX (`matchEvaluatorWorker` & Sparse OSCs)
**Analysis:**
To prevent infinite retry loops in Cloud Tasks, the `processMatchEvaluation` function now catches schema validation failures (for sparse mass-imported OSCs) and safely returns `null`. Consequently, no match document is written to the Firestore `matches` collection.
On the frontend (`MatchesDashboard.tsx` and `OscProfileView.tsx`), the UI relies entirely on real-time listeners (`onSnapshot`) querying the `matches` collection.
**UX Impact:** The frontend handles this state gracefully in the sense that it will not crash, nor will it display infinite loaders or broken components. However, it results in a **Silent Omission**. Users will simply see no match results for that OSC. There is no visual feedback, such as an "Inelegível (Dados Incompletos)" badge, leaving users blind as to why an OSC is failing to match with any opportunities.

## 3. Long-Term Storage Costs (`scraping_contents` Truncation)
**Analysis:**
The Data Lake workers truncate raw HTML to 500KB and store it in the `scraping_contents` collection. A review of the codebase confirms that an `expireAt` timestamp is explicitly injected into every document (set to 24 hours in the future). Crucially, the `firestore.indexes.json` file configures a native Firestore TTL (Time-To-Live) policy targeting this `expireAt` field.
**UX Impact:** Storage costs will **not** bloat indefinitely. Firestore's managed TTL service will automatically delete these heavy claim-check documents after 24 hours, keeping database storage lean and costs strictly bounded.

## 4. Remaining Blind Spots
**A. Prosas Session Expiry Cascades:**
The `prosasAuthenticatedWorker` relies on a session cookie (`prosas_session.json`) renewed by a daily cron job (`renewProsasSessionCron`) at 3 AM. If the session expires or is invalidated by Cloudflare mid-day, the worker throws a hard error. This will trigger the task retry mechanism and rapidly hit the 3-strike circuit breaker, disabling the scraping target entirely until the next day.
**B. Cross-Collection Pollution Bug:**
As noted in the system's memory, `agenticSearchWorker` incorrectly passes `oscId` as the `searchId` parameter to `enqueueEditalExtraction`. This causes the `extractionWorker` to mistakenly write tracking logs and increment counts in the `searches` collection using an OSC ID. This pollutes the autonomous searches dashboard with orphaned documents.
**C. Direct HTTP Orchestration Null Returns:**
The `triggerMatchOrchestrator` (`onCall` function) explicitly returns the result of `processMatchEvaluation`. If a user manually triggers a match calculation for a sparse OSC, the backend will return a raw `null` payload. If the frontend is not explicitly expecting a `null` response from this direct RPC call, it could lead to unhandled promise rejections or silent UI non-responses.