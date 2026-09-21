# End-to-End Architectural Analysis Report

## 1. Ingestion Layer Failure (Chronological Filtering Bypass)
**Issue:** Scrapers pulled editais from 2018 and 2023 instead of strictly active/today's editais.
**Root Causes:**
* **Brave/Vertex AI Date Parsers:** In `VertexAIScraper` and `BraveScraper`, when the search engine API fails to provide a parseable date in the metadata for a result, the code defaults to `itemDate = new Date()`. This immediately bypasses the watermark (`lastSuccessfulScrapeTimestamp`) check because it assigns the current date to old results, falsely indicating they are "new".
* **Lack of Prompt Enforcement:** The LLM extraction prompt (`extractEditalRules`) focuses entirely on extracting constraints (location, themes, dates) but has no explicit instruction to discard or invalidate editais that are already expired or published years ago. The LLM simply extracts whatever dates it finds without validating chronologic relevance to the current day.
* **SEO vs. Chronological Relevance:** The generic search queries rely on traditional SEO rankings rather than strict chronological filtering. Without robust date filters natively passed to the LLM agent ("Evaluate if this edital is currently open based on today's date"), old top-ranking grants leak into the Data Lake.

## 2. Deduplication Failure (The UPSERT Loophole)
**Issue:** 5+ exact duplicates of the same edital (e.g., 'Águas de Ọ̀ṣun') bypassed the UPSERT logic and entered the Data Lake.
**Root Cause:**
* **Flawed Unique Identifier Strategy:** The `externalProviderId`, which serves as the Firestore document ID for deduplication, is generated dynamically based on a hash of the *source URL* or *raw text* (e.g., `brave_${hash(url)}` or `vertex_${hash(url)}`).
* **Slight URL Variations:** If the same edital is scraped via different URLs (e.g., `http` vs `https`, trailing slashes, or from a third-party aggregator vs. the official site), the hashes will be completely different.
* **Raw Text Differences:** The fallback hash in `extractionWorker` hashes the `rawText`. If the text contains slight differences (due to different parsers or page rendering differences like ads/headers), the hash changes.
* **Consequence:** Because the `externalProviderId` differs for the exact same edital, the UPSERT operation (`db.collection('editais').doc(externalProviderId)`) creates a brand new document instead of overwriting the existing one, leading to multiple duplicates.

## 3. Caçador Worker Failure (The 0/0 Bug)
**Issue:** The match results display '0/0 Ótimos/Total'.
**Root Cause:**
* **Data Persistence Flaw in `matchEvaluatorWorker`:** The `matchEvaluatorWorker` uses Genkit with `reverseMatchResultSchema` (which only contains `matchScore` and `aiRationale`).
* When persisting the result, the worker executes:
  `await db.collection('matches').doc(`${oscId}_${editalId}`).set(matchResult, { merge: true });`
* **Missing Indexable Fields:** The worker pushes ONLY the `{ matchScore, aiRationale }` object to Firestore. It **fails to include** crucial querying fields like `oscId`, `editalId`, `eligibility`, `status`, or `createdAt` inside the document body itself.
* **Frontend Breakdown:** The frontend queries the `matches` collection using filters like `where('oscId', '==', activeOscId)` or expects fields like `eligibility !== false`. Because these fields are completely missing from the newly saved documents, the queries return 0 results, causing the '0/0' state on the UI. The worker didn't crash; it succeeded but wrote incomplete "ghost" documents that the frontend cannot query or render.
