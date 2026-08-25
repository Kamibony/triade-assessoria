# Technical Analysis & Architectural Blueprint: Tríade Assessoria AI Pivot

## 1. Audit of Existing Codebase & Repository Structure

**Current State Analysis:**
The current repository is a single-page application (SPA) built with React, Vite, and Tailwind CSS. It is structured purely as a marketing landing page.

- **Frontend Framework:** React + Vite + TypeScript.
- **Styling:** Tailwind CSS (v3) using a strict semantic token system (HSL CSS variables defined in `src/index.css`).
- **Architecture:** Monolithic frontend component structure, with a heavy emphasis on static marketing sections (`Hero`, `Problem`, `Solution`, `Comparison`, etc.) inside `src/components/sections/`.
- **Deployment:** Configured for Firebase Hosting (`firebase.json`).

## 2. Reusability Assessment

### What to Reuse (Keep):
- **Design System & Styling Foundation:** The global stylesheet (`src/index.css`) defining HSL variables and Tailwind configuration should be strictly maintained. It provides an excellent, scalable foundation for the new UI.
- **Base UI Components:** The modular components in `src/components/ui/` (e.g., `Button.tsx`, inputs, modals) are highly reusable for building the interactive pipeline dashboard.
- **Build & Deployment Tooling:** The Vite build process (`tsconfig`, `vite.config.ts`) and Firebase Hosting pipeline (`firebase.json`, `.firebaserc`) are robust and should be kept as the foundation for the frontend deployment.

### What to Discard or Refactor (Pivot):
- **Marketing Sections:** The entire `src/components/sections/` directory is obsolete for the core product. These should either be discarded or migrated to a separate marketing site (or a strict `/about` route).
- **Routing & State Management:** `src/App.tsx` currently renders a static vertical flow. It must be completely refactored to incorporate a robust router (e.g., React Router) to handle complex state transitions across the multi-agent pipeline stages.

## 3. Proposed AI-Native Architectural Blueprint

To support the automated multi-agent workflow (Eligibility -> Proposal Builder -> Budgeting -> Scoring), we propose a **Serverless Event-Driven Architecture** built entirely on Google Cloud and Firebase.

### System Components:

1.  **Client Application (Frontend)**
    - **Tech:** React + Vite (reusing current setup).
    - **Hosting:** Firebase Hosting.
    - **Role:** Provides the user interface for NGOs to interact with the pipeline. It handles authentication, data input, and real-time visualization of agent progress. All copy and UI text must remain strictly in pt-BR.

2.  **Authentication & Identity**
    - **Tech:** Firebase Authentication.
    - **Role:** Secures the platform, managing role-based access for NGOs and corporate sponsors.

3.  **State Management & Database**
    - **Tech:** Cloud Firestore.
    - **Role:** Acts as the central nervous system. It stores user profiles, proposal drafts, budgets, and the real-time *state* of the workflow. The AI agents react to changes in Firestore documents.

4.  **Multi-Agent Backend (The "Brain")**
    - **Tech:** Cloud Functions for Firebase (Node.js/TypeScript) + Firebase Genkit + Gemini API.
    - **Architecture:** We will implement an event-driven pipeline where specific Cloud Functions act as independent "Agents".

### The Agentic Workflow (Pipeline):

-   **Agent 1: Eligibility Checker**
    - *Trigger:* NGO submits initial profile data to Firestore.
    - *Action:* Cloud Function triggers, calls the Gemini API to compare the NGO's profile against structured rules (e.g., Paraíba's ICMS Cultural Edital guidelines stored in the system).
    - *Output:* Updates the Firestore document with a boolean eligibility status and reasoning.

-   **Agent 2: Proposal Builder**
    - *Trigger:* NGO submits project ideas (raw text/audio).
    - *Action:* Cloud Function utilizes Genkit to orchestrate a complex prompt, instructing Gemini to structure the raw input into formal technical proposal sections required by the specific Edital.
    - *Output:* Saves the drafted sections back to Firestore for user review.

-   **Agent 3: Budgeting Assistant**
    - *Trigger:* NGO inputs line items and costs.
    - *Action:* Cloud Function analyzes the budget against the Edital's strict financial caps and allowed categories using Gemini's reasoning capabilities.
    - *Output:* Flags violations and suggests corrections directly in the UI.

-   **Agent 4: Final Scoring & Feedback**
    - *Trigger:* NGO requests final review.
    - *Action:* A final orchestration function synthesizes the proposal and budget, scoring the package against historical success criteria and Edital requirements.
    - *Output:* Generates a final readiness score and actionable feedback report in pt-BR.

This architecture ensures high scalability, leverages existing Google Cloud tooling, and strictly separates the presentation layer from the complex AI orchestration logic.

## 4. The Hybrid Engine: Scaling the Platform

As the platform evolves, we are implementing a **Hybrid Engine** combining two core philosophies for matching NGOs with grants:

### A. Ostreľovač (Agentic OSC-First Search)

The **Ostreľovač** strategy is proactive and precision-driven. It focuses on finding grants tailored to a specific NGO (OSC).

*   **Mechanism:** When a new OSC profile is imported (e.g., via the `ingestOscDataFunction` orchestrator or manual creation) or updated, the `onOscUpdated` Firestore trigger activates.
*   **Orchestration:** This trigger, or a manual request via `triggerMatchOrchestrator`, enqueues match evaluation tasks using Google Cloud Tasks.
*   **Evaluation:** The `processMatchEvaluation` function compares the OSC's profile against existing editais in the database, leveraging Genkit (`scoreMatch` flow with `gemini-2.5-flash`) to generate a match score, eligibility status, and reasoning.
*   **Benefits:** Ensures immediate, highly relevant opportunities are identified for NGOs as soon as they join the platform or update their details, creating a personalized experience.

### B. Široká sieť (Mass Data Lake Ingestion)

The **Široká sieť** strategy focuses on breadth and volume. It aims to continuously ingest and catalog a massive array of public and private funding opportunities.

*   **Mechanism:** A robust scraping pipeline, driven by dynamic configuration in the `scraping_targets` Firestore collection.
*   **Scrapers:** The `processScrapingTargetWorker` Cloud Function handles concurrent scraping of various sources (RSS, API, HTML, and a hybrid 'AUTO' strategy). It utilizes an asynchronous fan-out pipeline initiated by `autonomousSearchWorker`.
*   **AI Pre-filtering (Triage):** To ensure data quality, the `triageEditalWebpage` Genkit flow acts as an intelligent pre-filter. It uses `gemini-2.5-flash` to analyze scraped text and determine if it represents a valid, active funding opportunity (including landing pages), preventing the database from being flooded with irrelevant content.
*   **Extraction:** Valid editais are then processed by the `extractEditalRules` flow to structure the data (eligibility criteria, financial rules) before saving it to Firestore.

### Integration within the Architecture

These two philosophies work synergistically within the existing Firebase/Cloud Run/Genkit ecosystem:

1.  **Event-Driven Synergy:** The "Široká sieť" continuously populates the `editais` collection. When a new edital is created (`onEditalCreated` trigger), it enqueues tasks to evaluate it against all existing OSCs, acting as a reverse "Ostreľovač".
2.  **Cloud Tasks Decoupling:** Both scraping (`processScrapingTargetWorker`) and match evaluation (`matchEvaluatorWorker`) rely heavily on Cloud Tasks. This decouples the work from synchronous triggers, prevents timeouts, manages rate limits (vital for external APIs and Vertex AI), and ensures scalability.
3.  **Caching for Efficiency:** The `processMatchEvaluation` function implements a robust caching layer (comparing `updatedAt` timestamps) to avoid redundant AI calls for unchanged data, optimizing costs.

### Proposed Architectural Improvements

While the current implementation is solid, scaling this Hybrid Engine requires some refinements:

1.  **Decouple Genkit Extraction from Scraping:** Currently, `processScrapingTargetWorker` performs scraping, triage, and full extraction synchronously for each link. At high volumes, this can lead to timeouts or Vertex AI quota limits.
    *   *Proposal:* Split this. The scraping worker should only perform the fetch and triage. Valid raw content should be saved to a staging collection or enqueued to a separate `extractionWorker`. This allows independent scaling and retry mechanisms for the expensive LLM extraction phase.
2.  **Unified Generic Ingestion API:** The platform relies on various sources (manual URLs, RSS, automatic scraping).
    *   *Proposal:* Create a unified `ingestEdital` API endpoint/function that accepts raw text, HTML, or URLs. This centralizes the triage, extraction, and validation logic, making it easier to add new data sources (e.g., email forwarding, PDF uploads) without duplicating pipeline logic.
3.  **Robust Error Handling & Circuit Breakers for Scrapers:** Scraping external sites is inherently fragile.
    *   *Proposal:* Implement circuit breakers in the `processScrapingTargetWorker`. If a specific target (e.g., an HTML source) fails consecutively (e.g., due to DOM changes), the system should automatically disable the target (`active: false`) and alert an administrator, rather than endlessly retrying and wasting resources.
4.  **Vector Search for Initial Filtering:** As the database grows, running Genkit evaluations on every Edital-OSC combination becomes cost-prohibitive.
    *   *Proposal:* Introduce Firebase Extension for Vector Search with Vertex AI. Generate embeddings for OSC profiles and Edital criteria. Before enqueuing a full Genkit match evaluation, perform a fast, cheap vector similarity search to pre-filter candidates, only sending high-probability pairs to the expensive `scoreMatch` flow.