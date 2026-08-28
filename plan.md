1.  **Understand the Request:**
    *   Update `agenticSearchWorker` in `functions/src/index.ts`.
    *   Implement a **Dual-Engine Search Strategy**.
    *   **Primary Search:** Google Custom Search API (`https://customsearch.googleapis.com/customsearch/v1`).
        *   Credentials: `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` (`82611de35b22b48dd`).
        *   Pagination: `start` parameter, up to 40-50 links.
    *   **Secondary Fallback:** Brave Search API (current implementation).
        *   Trigger: Error, timeout, or quota limit from Google Custom Search API.
    *   **Result Normalization:** Both should output an array of objects with `{ url: string, title: string, description: string }` (mapped to `link`, `title`, `snippet` conceptually, but the code currently uses `r.url`, `r.title`, `r.description` for Brave). Let's unify it to `{ url, title, description }`.

2.  **Define Environment Variables:**
    *   Add `defineString('GOOGLE_SEARCH_API_KEY')` and `defineString('GOOGLE_SEARCH_ENGINE_ID')` at the top of `functions/src/index.ts`.

3.  **Refactor `agenticSearchWorker`:**
    *   Inside the `for (const query of queries)` loop, implement the Google Custom Search logic first.
    *   **Google Custom Search logic:**
        *   Try to fetch from `https://customsearch.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleEngineId}&q=${encodeURIComponent(query)}&start=${start}`.
        *   Loop for `start` values (e.g., `start=1` and `start=21` since it returns 20 per page? No, Google Custom Search returns max 10 per page. So `start=1, 11, 21, 31` to get 40 results).
        *   If successful, parse the response. The results are in `data.items`. Map them to `{ url: item.link, title: item.title, description: item.snippet }`.
        *   If there's an error (e.g., status not 200, or network error), set a flag `googleSearchFailed = true` and break out of the Google search loop.
    *   **Brave Search Fallback logic:**
        *   If `googleSearchFailed` is true, or if `!googleApiKey` or `!googleEngineId`, execute the existing Brave search logic.
        *   Map Brave results to the same structure (already `{ url, title, description }` roughly, though Brave uses `description`).
    *   **Result Processing:**
        *   The rest of the code (processing the `allSearchResults` chunk by chunk) remains the same, just operating on the normalized results.

4.  **Steps in Execution:**
    1.  Modify `functions/src/index.ts` to include the dual-engine strategy.
    2.  Build functions (`cd functions && npm run build`) to check for TS errors.
    3.  Complete pre commit steps.
    4.  Submit the change.
