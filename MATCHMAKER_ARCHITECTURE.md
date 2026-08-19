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

## Implementation Plan

1. **Phase 1: Foundation (Backend Schemas)**
   - Define Zod schemas for `editais` and `matches` in `functions/src/index.ts`.
   - Ensure Firestore rules are updated (if applicable) to secure the new collections.

2. **Phase 2: Edital Extraction Workflow**
   - Create a Genkit flow `extractEditalRules` in `functions/src/index.ts`.
   - Expose it as an `onCall` Cloud Function.
   - (Optional) Set up an event-driven `onDocumentCreated` trigger for the `editais` collection to run extraction automatically when a raw document is uploaded.

3. **Phase 3: Matchmaking Engine**
   - Create a Genkit flow `scoreMatch` in `functions/src/index.ts` that takes an NGO profile and an Edital profile as input.
   - Implement an orchestrator function that fetches active Editais and relevant NGOs from Firestore, and batches calls to `scoreMatch`.

4. **Phase 4: Frontend Integration**
   - Update the React application (`src/`) to include dashboards for:
     - Viewing available Editais.
     - Viewing an NGO's match scores for different Editais.
     - Displaying the AI-generated "Action Plan" for ineligible Editais.

5. **Phase 5: Refinement & Cost Optimization**
   - Switch Genkit models to `gemini-2.5-flash` where complex reasoning isn't required to save costs.
   - Implement caching strategies for match scores to prevent redundant AI invocations.
