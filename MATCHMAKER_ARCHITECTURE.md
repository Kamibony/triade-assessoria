# Autonomous Matchmaker Architecture

## Overview
The "Autonomous Matchmaker" is a core system for the Tríade Assessoria platform, designed to automatically match published Grants/Tenders (Editais) with suitable Brazilian NGOs (OSCs). This document outlines the event-driven architecture, database schemas, AI workflows, and implementation plan.

## Event-Driven Architecture
The system leverages Firebase, Firestore, and Genkit for a scalable, event-driven approach.

1. **Event Sources**:
   - **New Edital Registration**: When a new Edital is added to Firestore, a Cloud Function (trigger) is activated.
   - **NGO Profile Update**: When an NGO updates its profile or uploads new documentation, another Cloud Function triggers.
2. **Processing (Genkit via Cloud Functions)**:
   - **Edital Processing**: The trigger invokes an AI workflow (Genkit) to extract rules, eligibility criteria, and scoring metrics from the Edital text/PDF.
   - **NGO Processing**: A Genkit flow updates the NGO's capabilities based on its documents (using the existing `parsePdfToProfile`).
3. **Matchmaking Engine**:
   - A scheduled job (Cloud Scheduler) or an event-driven trigger (on new Edital/NGO update) runs the Match Scoring flow.
   - The flow evaluates NGOs against Edital criteria and generates a match score and recommendations.
4. **Data Storage & Notification**:
   - Match results are stored in a `matches` Firestore collection.
   - Alerts (e.g., email or in-app notifications) are sent to NGOs with high match scores.

## Proposed Firestore NoSQL Schemas

### 1. `oscs` Collection (NGOs)
Stores data about the NGOs.
```json
{
  "id": "string",
  "name": "string",
  "cnpj": "string",
  "foundationDate": "timestamp",
  "location": {
    "city": "string",
    "state": "string"
  },
  "documentationStatus": "string", // 'Em dia', 'Pendente', 'Irregular'
  "previousProjectsApproved": "boolean",
  "coreActivities": ["string"],
  "budgetCapacity": "number",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### 2. `editais` Collection (Grants/Tenders)
Stores extracted and structured data from Editais.
```json
{
  "id": "string",
  "title": "string",
  "issuer": "string",
  "publicationDate": "timestamp",
  "deadline": "timestamp",
  "totalBudget": "number",
  "eligibilityCriteria": {
    "minYearsActive": "number",
    "requiredLocations": ["string"], // e.g., ["PB", "PE"]
    "requiredDocumentation": ["string"],
    "allowedActivities": ["string"]
  },
  "rawText": "string", // Original text or reference to PDF in Cloud Storage
  "status": "string", // 'Open', 'Closed', 'Under Evaluation'
  "createdAt": "timestamp"
}
```

### 3. `matches` Collection (Results)
Stores the generated matches between NGOs and Editais.
```json
{
  "id": "string",
  "editalId": "string (ref)",
  "oscId": "string (ref)",
  "matchScore": "number (0-100)",
  "eligibility": "boolean",
  "reasoning": "string",
  "actionPlan": ["string"], // if ineligible or score is low
  "createdAt": "timestamp"
}
```

## AI Workflows (Genkit)

### 1. Edital Rule Extraction Flow
- **Trigger**: File upload (PDF) or raw text submission to the `editais` collection.
- **Input**: Raw text or PDF base64.
- **Model**: `vertexai/gemini-2.5-pro` (or flash for speed/cost).
- **Task**: Extract structured data (title, deadline, budget, eligibility criteria) based on a Zod schema.
- **Output**: Populates the `editais` document structure.

### 2. Match Scoring Flow
- **Trigger**: Scheduled or event-driven (new Edital or NGO update).
- **Input**: `oscs` document and `editais` document.
- **Model**: `vertexai/gemini-2.5-flash` (optimized for repetitive scoring tasks).
- **Task**: Compare the NGO's capabilities with the Edital's requirements. Calculate a match score (0-100), determine boolean eligibility, and generate a brief explanation and recommendations.
- **Output**: Saves a new record in the `matches` collection.

## Implementation Plan & Architecture Critique

### Architect's Critique of the Original 5-Phase Plan
The original 5-phase plan is overly fragmented and creates unnecessary silos between dependent components.
- **Separating Schemas and Extraction (Phases 1 & 2):** Building Zod schemas in isolation without actively testing them against the actual Gemini extraction outputs risks creating theoretical schemas that fail when exposed to real-world Edital PDFs. These must be built and tested concurrently.
- **Isolating Frontend Integration (Phase 4):** Delaying UI integration until the entire backend is built means we lose the opportunity for early user feedback. Stakeholders won't be able to visualize the Matchmaking Engine's output until late in the cycle, which risks misalignment on the "Action Plan" and scoring criteria.

### Optimized 3-Milestone Roadmap
To streamline implementation, ensure end-to-end context continuity, and accelerate feedback, I propose the following consolidated roadmap:

#### Milestone 1: Data Models & Edital Extraction Pipeline (Combines Old Phases 1 & 2)
**Rationale:** Schemas dictate the AI's output; therefore, defining schemas and building the extraction flow are inseparable tasks.
- Define Zod schemas for `editais` in `functions/src/index.ts`.
- Immediately build the `extractEditalRules` Genkit flow and test it against sample Editais.
- Deploy the flow as an `onCall` Cloud Function and implement the `onDocumentCreated` trigger.
- Configure basic Firestore security rules.

#### Milestone 2: Matchmaking Engine & Initial Frontend MVP (Combines Old Phases 3 & 4)
**Rationale:** Scoring matches has no value if users cannot see the results. Building the UI alongside the Matchmaking Engine allows immediate validation of the AI's reasoning and scoring logic.
- Define the `matches` Zod schema and implement the `scoreMatch` Genkit flow.
- Build the orchestrator function to batch matches.
- Develop the React (`src/`) dashboards concurrently to display:
  - The list of available Editais.
  - The NGO's match scores and the AI-generated "Action Plan".

#### Milestone 3: Optimization, Automation & Cost-Reduction (Expands Old Phase 5)
**Rationale:** Optimization should occur once the baseline system is proven to work end-to-end.
- Evaluate AI outputs and downgrade to `gemini-2.5-flash` for flows where complex reasoning is not strictly required.
- Implement caching for match scores to avoid redundant Genkit runs.
- Set up Cloud Scheduler jobs for automated, periodic match recalculations as new Editais are ingested or NGO profiles change.
