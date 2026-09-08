# Audit Report: Ingestion and Data Lake Pipeline

## 1. The Downloading & Scraping Process

### How a URL is processed
The function `fetchAndExtractText` (in `functions/src/index.ts`) handles the initial fetching and text extraction for a given URL.
-   It uses a standard `fetch` with a 15-second timeout and custom headers to mimic a browser.
-   It determines the file type by checking the `Content-Type` header or the URL extension (`.pdf`).

### PDF vs. HTML Handling
-   **PDFs:**
    - **Memory Limits:** The function explicitly enforces a 10MB maximum size limit (`MAX_PDF_SIZE`) by checking the `Content-Length` header. If the file is too large, it throws an error to prevent Out-Of-Memory (OOM) crashes. It also checks chunks while streaming.
    - **Buffer Conversion:** The response body stream is read in chunks, which are combined and converted into a Node `Buffer`, and then into a `Uint8Array`. This `Uint8Array` is passed to the `pdf-parse` constructor (v2.4.5), which requires this format to avoid initialization errors.
-   **HTML:**
    - The HTML text is fetched and loaded into `cheerio`.
    - It removes noisy elements like `script`, `style`, `nav`, `footer`, `header`, `aside`, `noscript`, `iframe`, and `svg` to isolate the core content.
    - It checks for suspiciously short text (< 150 characters), logging a warning that it might be a JS-rendered Single Page Application (SPA).

### Filtering in `routeEditalUrl`
Before URLs are queued for full extraction, `routeEditalUrl` filters them using a two-step process:
1.  **Heuristic Keyword Checks (AND-gate):** A strict pre-filter checks the extracted text for primary keywords (e.g., 'edital', 'chamada pública', 'fomento') AND secondary keywords (e.g., 'prazo', 'inscrições', 'financiamento'). If the text lacks at least one from *both* categories, it is rejected immediately with an outcome of `HEURISTIC_REJECT`.
2.  **LLM Triage (`triageEditalWebpage`):** If the heuristic check passes, the text is sent to a Gemini 2.5 Flash flow. The LLM acts as an assistant to determine if the text represents a "real and active funding opportunity." It is instructed to accept landing pages or official announcements (even if they don't contain full regulations) and reject generic news or opinion pieces. This step outputs `AI_APPROVE` or `AI_REJECT`.

---

## 2. The Data Lake Inventory (What actually gets saved)

The `extractionWorker` calls the `extractEditalRules` LLM flow to process the raw text and attempts to map it to the `editalSchema`.

### A) Successfully parsed editais (`editalSchema` matches)
If the LLM output successfully validates against the `editalSchema`:
-   A text embedding is generated based on the edital's title and allowed activities.
-   The worker saves a document to the `editais` collection containing:
    -   The structured data (title, issuer, budget, criteria, dates, etc.).
    -   `rawText`: A truncated version of the original text (up to 5000 characters).
    -   `sourceUrl`: The original link.
    -   `embedding`: The generated vector embedding.
    -   `discoverySource`: The origin of the link (e.g., 'PROSAS_AUTH', 'VERTEX_SEARCH').
    -   `createdAt`: A server timestamp.

### B) Fallback/Error editais (Parsing or Validation Fails)
If the data fails validation (e.g., missing critical fields) or a PDF parsing error occurs, the worker uses a fallback mechanism to ensure data isn't lost. It saves a document with the following characteristics:
-   **Dummy Values Injected:**
    -   `title`: "Edital Parcial/Mapeamento Incompleto"
    -   `issuer`: "Desconhecido"
    -   `publicationDate`: Current date
    -   `deadline`: "2099-12-31" (A distant future date)
    -   `totalBudget`: 0
    -   `eligibilityCriteria`: Zeroed-out fields (e.g., `minYearsActive: 0`, empty arrays for locations and activities).
-   **Error Flags:**
    -   `parseError`: `true`
    -   `originalExtractionData`: The raw (failed) LLM output is saved for debugging.
    -   `rawText`: Truncated to 5000 characters.

**Downstream Impact:**
The dummy data can cause issues with downstream agents. For example, the `bureaucracyAgentFlow` checks if the deadline has passed and checks location requirements. Because the fallback deadline is "2099-12-31", the edital will falsely pass the deadline check. However, because the locations and activities arrays are empty, the thematic matching or location matching might fail unexpectedly, leading to false positives or false negatives in the matchmaking pipeline.

---

## 3. Missing Source Information in UX

### Why is the source URL or domain not displayed to the user?

-   **Backend Storage:** The `sourceUrl` is being saved correctly.
    - The `extractionWorker` saves `sourceUrl` directly into the `editais` collection.
    - More importantly, the `processMatchEvaluation` function explicitly copies the `sourceUrl` from the original edital document and saves it directly onto the root level of the generated `matches` document: `sourceUrl: rawEditalData?.sourceUrl || null`.
-   **Frontend Bug:** The issue is in the `MatchDetailPanel.tsx` component.
    - The code currently tries to render the link using the `edital` prop:
      ```tsx
      {(edital as any)?.sourceUrl && (
          <a href={(edital as any).sourceUrl} ...>
      ```
    - In the `MatchesDashboard.tsx` and `NgoMatchView.tsx` components (which are the parents providing data), the full `edital` object is not always passed down or populated with the `sourceUrl`.
    - However, since the backend already copied `sourceUrl` directly onto the `match` document itself, the frontend *should* be checking the `match` object instead.
    - **Fix:** The component should look for the URL on the match object first: `match.sourceUrl || (edital as any)?.sourceUrl`.