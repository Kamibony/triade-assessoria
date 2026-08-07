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