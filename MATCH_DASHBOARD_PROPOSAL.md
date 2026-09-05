# Match Dashboard UX & Architectural Proposal

## Overview
This document outlines the UX design and frontend architectural strategy for refactoring the existing `MatchesDashboard` to visualize the new V2 Agentic Search (Multi-Agent architecture with Vector Embeddings). The goal is to provide Tríade Assessoria consultants with actionable, explainable insights (XAI) and human-in-the-loop feedback mechanisms.

## 1. Dual-Agent Visualization
The current system combines everything into a single "Elegibilidade" pass/fail and a score. The V2 architecture uses two distinct gates:
1.  **Gate 1 (Bureaucracy Agent):** Hard constraints (Deadlines, Location, Status, Documentation).
2.  **Gate 2 (Thematic Agent):** Nuanced semantic alignment (Vector match, Mission alignment).

### UI Strategy:
*   **Split the "Elegibilidade" Column:** Instead of one column, have two visual indicators.
    *   *Burocracia:* Status icon (Green Check, Red X, Yellow Warning for missing data). A tooltip or small sub-text should indicate the specific hard constraint if it fails (e.g., "Prazo Vencido", "Localização Incompatível").
    *   *Aderência Temática:* The Match Score percentage (0-100%). Use a color gradient (e.g., Red < 40, Yellow 40-70, Green > 70).
*   **Immediate clarity:** If Gate 1 fails, the Thematic Score should either be grayed out (with a lock icon) or show "N/A", as the multi-agent flow skips Gate 2 if Gate 1 fails.

## 2. AI Explainability (XAI)
Consultants must understand *why* the AI made a decision.

### UI Strategy (Drill-Down Detail View):
*   **Thematic Reasoning:** When expanding a match row (or opening a modal), present the `reasoning` field prominently.
*   **Vector Context (Visual Aid):** Display a radar chart or simple bar graphs showing the alignment between the Edital's requirements and the OSC's core activities/mission.
*   **Highlighted Keywords:** If possible, highlight key terms in the reasoning that match the Edital's criteria.

## 3. Human-in-the-Loop Feedback
This is critical for future RAG/few-shot learning. We need to capture consultant feedback on the AI's predictions.

### UI Strategy (Action Panel):
*   Add a new column or an action bar in the detail view: "Feedback do Consultor".
*   **Options:**
    *   ✅ Aprovar (Match faz sentido)
    *   ❌ Rejeitar (Match ruim/falso positivo)
    *   ⚠️ Precisa de Revisão (IA incerta ou dados conflitantes)
*   **Firestore Integration:** Clicking these buttons should immediately update a new field (e.g., `consultantFeedback` or `status`) in the `matches` Firestore document.

## 4. Information Architecture & Component Hierarchy

### Current State
`MatchesDashboard.tsx` is a monolithic file handling data fetching, grouping, filtering, and rendering of a complex table and expandable rows.

### Proposed Hierarchy
Move towards a modular structure, favoring a master-detail pattern.

1.  **`MatchesDashboard` (Container/Page):**
    *   Handles data fetching (Firestore subscriptions), global state (search, filters, grouping), and pagination/infinite scroll logic.
2.  **`MatchFilters` (Component):**
    *   Search bar, group by dropdown, and new filters (e.g., "Apenas Aprovados", "Falta Feedback").
3.  **`MatchesTable` (Component):**
    *   Renders the tabular view.
    *   Columns: OSC, Edital, Burocracia (Gate 1), Temática (Gate 2), Ações.
4.  **`MatchRow` (Component):**
    *   Renders a single row. Handles local expand/collapse state.
5.  **`MatchDetailPanel` (Component - Expansion or Modal):**
    *   **Tabs:**
        *   *Justificativa (XAI):* The text reasoning and vector context.
        *   *Plano de Ação:* The existing `actionPlan` array.
        *   *Comparativo:* Side-by-side view of Edital criteria vs. OSC profile.
6.  **`FeedbackActionBar` (Component):**
    *   The Approved/Reject/Review buttons. Handles the `updateDoc` call to Firestore.

### Data-Fetching Strategy
*   **Optimistic UI:** When a consultant clicks "Aprovar", update the UI immediately, then sync with Firestore to prevent UI lag.
*   **Pagination/Virtualization:** The current `onSnapshot` fetching all matches will scale poorly. Implement pagination (`limit()`, `startAfter()`) or virtualization (e.g., `react-window`) if the list grows large.
*   **Batching Edital/OSC Data:** The current approach of fetching related Editais and OSCs in chunks of 10 is okay, but consider caching or using a normalized Redux/Zustand store to prevent redundant fetches across different matches referencing the same Edital/OSC.
