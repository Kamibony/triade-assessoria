# Prosas Authenticated Scraping Module Proposal

## 1. Context & Objectives

The current public scraping of Prosas misses deep data and PDF attachments that are only available to authenticated users. The goal is to build a dedicated, authenticated scraping module using the client's registered account to extract full edital details and PDFs, feeding them into the existing Data Lake (Lake of Editais).

## 2. Feasibility Analysis & Potential Blockers

**Feasibility:** High. Playwright is well-suited for automating authenticated sessions, downloading files, and extracting complex DOM structures.

**Potential Blockers:**
*   **CAPTCHAs:** Prosas might employ CAPTCHAs during the login flow or if anomalous activity is detected. *Mitigation:* Use Playwright Stealth. If CAPTCHA is unavoidable during login, consider a manual login process that exports the session state, which the worker then consumes.
*   **Strict IP Filtering/Bot Protection (Cloudflare):** Cloudflare or similar WAFs might block headless browsers. *Mitigation:* Utilize `playwright-extra` and `puppeteer-extra-plugin-stealth` (already present in the current architecture). If Cloudflare is aggressive, residential proxies might be required.
*   **Rate Limiting & Account Bans:** Aggressive scraping might trigger temporary or permanent account bans. *Mitigation:* Implement human-like delays, randomized sleep intervals, and limit concurrent requests.
*   **Dynamic DOM Changes:** Prosas might update their internal HTML structure, breaking extraction logic. *Mitigation:* Use robust CSS selectors, fallback extraction mechanisms, and robust error logging for quick updates.
*   **File Downloads in Headless Mode:** Downloading files in headless Playwright requires specific configuration and handling of the download event stream to save files to a temporary disk before uploading them to Cloud Storage.

## 3. Architecture & Implementation Plan

### 3.1. Authentication State Management

We will separate the login process from the extraction process to minimize login attempts and reduce the risk of account locking.

1.  **Session Generation:** A dedicated script or Cloud Function (triggered manually or on a schedule) will use Playwright to navigate to Prosas, perform the login using provided credentials, and extract the session state (cookies and `localStorage`).
2.  **State Persistence:** The extracted session state will be securely stored in Google Cloud Secret Manager or a dedicated secure Firestore collection (encrypted).
3.  **Session Injection:** The extraction worker will retrieve the saved session state, inject it into the Playwright browser context, and navigate directly to the authenticated pages, bypassing the login screen.

### 3.2. Extraction Pipeline

The pipeline will integrate with the existing Data Lake infrastructure.

1.  **Trigger:** The worker will be triggered by a Cloud Task or Scheduler, similar to `processScrapingTargetWorker`.
2.  **Navigation & Discovery:** Navigate to the authenticated dashboard/listing pages. Paginate through the listings, extracting URLs for individual editais.
3.  **Detailed Extraction:** For each edital URL:
    *   Navigate to the page.
    *   Extract structured metadata (title, deadlines, funding amounts, criteria) using cheerio or Playwright DOM evaluation.
    *   Locate PDF attachment links.
4.  **PDF Download & Upload:**
    *   Trigger the download via Playwright.
    *   Wait for the download to complete in the worker's temporary directory (`/tmp` in Cloud Functions/Run).
    *   Upload the downloaded PDF to Google Cloud Storage (e.g., `prosas-pdfs` bucket).
    *   Store the public GCS URL in the structured metadata.
5.  **Data Lake Integration:** Push the combined metadata and GCS links to the `scraping_contents` Firestore collection (Claim Check pattern) for downstream processing by the existing `extractionWorker`.

### 3.3. Infrastructure & Security

*   **Compute:** Deploy as a dedicated **Google Cloud Run** service or a Gen 2 Cloud Function. Cloud Run is preferred if PDF processing requires significant memory or extended execution times beyond typical function limits. We will configure it with sufficient memory (e.g., 2GB-4GB) and timeout.
*   **Credentials:** Store Prosas username/password in **Google Cloud Secret Manager**.
*   **Network:** (Optional but recommended) Route traffic through a **Residential Proxy** or a NAT Gateway with rotating IPs if IP blocking becomes an issue.

### 3.4. Evasion & Rate Limiting Strategies

1.  **Playwright Stealth:** Continue using `puppeteer-extra-plugin-stealth` to mask headless browser signatures.
2.  **Human-like Delays:** Inject randomized delays (`setTimeout`) between navigation events and clicks.
    ```typescript
    // Example: random delay between 2 and 5 seconds
    const delay = Math.floor(Math.random() * 3000) + 2000;
    await page.waitForTimeout(delay);
    ```
3.  **Rate Limiting:** Throttle the processing loop to limit the number of pages scraped per hour.
4.  **User-Agent Rotation:** Periodically rotate common desktop User-Agents.
5.  **Viewport Randomization:** Slightly randomize the viewport size.

## 4. Recommended Technical Implementation Steps

1.  **Phase 1: Proof of Concept (Local)**
    *   Write a local Node.js script using Playwright to successfully log into Prosas.
    *   Export the session state to a local JSON file.
    *   Write a second script that reads the JSON file, injects the state, and successfully loads an authenticated edital page and downloads a PDF.
2.  **Phase 2: Infrastructure Setup**
    *   Create secrets in Google Cloud Secret Manager for Prosas credentials.
    *   Set up a Google Cloud Storage bucket for PDF storage.
3.  **Phase 3: Worker Development**
    *   Develop the `prosasAuthenticatedWorker` (Cloud Run or Function).
    *   Implement the session retrieval and injection logic.
    *   Implement the extraction and PDF download/upload logic.
    *   Integrate with the `scraping_contents` collection.
4.  **Phase 4: Deployment & Monitoring**
    *   Deploy the worker.
    *   Set up comprehensive logging to monitor login failures, extraction errors, and bot detection events.
    *   Schedule the worker to run at an appropriate frequency (e.g., nightly).
