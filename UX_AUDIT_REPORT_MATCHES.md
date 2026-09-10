# UX/UI Audit Report: Matches Triage Flow

## Executive Summary
This audit evaluates the frontend components responsible for the matches triage process within the application, specifically focusing on `MatchesDashboard`, `RadarOportunidades`, `MatchDetailPanel`, and `MatchesTable`. The review assesses the current implementation against key UX heuristics: Click-Efficiency, Cognitive Load, Feedback & States, and Information Architecture. A series of structured recommendations is provided for the impending refactoring phase.

## 1. Click-Efficiency (Triage Flow)

**Current State:**
*   Feedback actions (Approve, Reject, Review) are currently nested within a `MatchDetailPanel` that must be expanded via a "Detalhes" button on each row in `MatchesTable`.
*   Users must perform at least two clicks (expand row -> click action) to triage a single match.
*   There are no bulk actions available to invalidate an entire `Edital` or `OSC` across multiple matches simultaneously.
*   Feedback actions lack immediate undo capabilities, forcing manual reversion if a mistake is made.

**Refactoring Recommendations:**
*   **Inline Table Actions:** Introduce 1-click "Approve" and "Reject" buttons directly within the `MatchRow` component (e.g., replacing or supplementing the "Ações" column). The "Detalhes" expand action should remain for deep dives.
*   **Bulk Invalidation:** Implement global invalidation actions. For instance, when grouping by Edital or OSC, provide a "Reject All Pending" action for that specific group header in `MatchesTable`.
*   **Undo Toast Notifications:** When an action (Approve/Reject) is taken, immediately show a toast notification with a clear "Undo" action. This allows users to quickly correct accidental clicks without navigating away.
*   *Constraint:* Keyboard shortcuts are explicitly excluded from this proposal per requirements.

## 2. Cognitive Load

**Current State:**
*   The AI Justification (`reasoning`) and Suggested Action Plan (`actionPlan`) are rendered as plain text or simple lists in `MatchDetailPanel`.
*   Dense blocks of text can make it difficult for users to quickly scan and understand the AI's rationale, increasing cognitive load during high-volume triage.
*   The Gate 1 and Gate 2 scores in `MatchRow` use color coding, but the detailed reasoning lacks visual hierarchy.

**Refactoring Recommendations:**
*   **Markdown Parsing:** Implement a markdown parser (e.g., `react-markdown`) for the `reasoning` field in `MatchDetailPanel` to support rich text formatting (bolding key terms, lists).
*   **Scannable Structure:** If markdown is not provided by the AI, enforce a structured presentation using bullet points for key findings.
*   **Highlight Tags:** Use color-coded highlight tags within the text or as supplementary badges to draw attention to critical eligibility factors (e.g., "Prazo", "Localização"). The current implementation uses simple tags, but they should be integrated more closely with the reasoning text.
*   **Visual Hierarchy:** Clearly separate the AI's reasoning into "Strengths" and "Weaknesses" or "Eligibility Factors" for instant scannability.

## 3. Feedback & States

**Current State:**
*   Filters in `MatchesDashboard` and `MatchFilters` may lack prominent active visual states, making it unclear what filters are currently applied.
*   KPI cards (Total, Pendentes, Aprovados, Reprovados) show data but their interactive state (as filters) might not be immediately obvious without hovering.
*   The loading state uses a simple spinner (`Loader2`).
*   Empty states (when no matches are found) are generic ("Nenhum match encontrado.").

**Refactoring Recommendations:**
*   **Active Visual States:** Enhance the visual distinction of active filters and KPI cards. When a KPI card is selected as a filter, it should have a clear active styling (e.g., a solid border, distinct background color, or an active indicator icon).
*   **Clear Empty States:** Implement contextual empty states. For example, if no matches are found due to applied filters, provide a message like "Nenhum match encontrado para os filtros selecionados" along with a "Limpar Filtros" button.
*   **Skeleton Loaders:** Replace the generic spinner in `MatchesDashboard` with Skeleton loaders that mimic the structure of the `MatchesTable` or `RadarOportunidades`. This improves perceived performance and reduces layout shift when data arrives.

## 4. Information Architecture

**Current State:**
*   Deep dives into OSC or Edital details from `RadarOportunidades` trigger a `DrillDownPanel`.
*   The `MatchesTable` uses an expandable row model (`MatchDetailPanel`) for match-specific details.
*   Navigation context can be lost if a user drills down deeply and then attempts to return or perform actions.

**Refactoring Recommendations:**
*   **Slide-out Drawer Flow:** Standardize deep dives using a Slide-out Drawer (Side Panel) component instead of full-page navigation or simple modals. This allows users to view detailed information about an OSC or Edital while maintaining the context of the underlying table or radar view.
*   **Contextual Preservation:** Ensure that applying filters, sorting, or pagination state is preserved when opening and closing the Slide-out Drawer or expanding/collapsing table rows. Users should not be forced to reload the page or reset their state after a deep dive.
*   **Actionable Context:** Within the Slide-out Drawer (e.g., viewing an Edital), allow users to perform actions related to that entity (like the proposed bulk invalidation) directly from the drawer, seamlessly updating the underlying dashboard state.
