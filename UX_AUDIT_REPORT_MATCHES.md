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

## Deployment Plan

To ensure a smooth transition and immediate delivery of high-value UX improvements, the refactoring recommendations are broken down into three logical deployment phases based on technical dependencies and impact.

### Phase 1: High-Priority Interactions & States
*Focus: Resolving immediate pain points related to click-efficiency and basic visual feedback.*
*   **Active KPI States:** Implement clear active visual styling on the KPI cards in `MatchesDashboard` to indicate when they are acting as filters.
*   **Inline Table Actions:** Add 1-click "Approve" and "Reject" buttons directly into the `MatchRow` component to streamline individual match triage without requiring row expansion.
*   **Bulk Invalidation:** Introduce a "Reject All Pendentes" action within the group headers of `MatchesTable` (when grouping by Edital or OSC) to allow for rapid global invalidation.
*   **Enhanced Empty States:** Update `MatchesTable` to display contextual empty state messages when no matches align with the selected filters.

### Phase 2: Enhanced Feedback & Cognitive Load Reduction
*Focus: Improving the readability of AI outputs and providing robust action feedback.*
*   **Markdown Parsing:** Integrate `react-markdown` in `MatchDetailPanel` to render the AI's `reasoning` and `actionPlan` with proper formatting (bolding, lists).
*   **Highlight Tags:** Implement visual tags/badges for critical eligibility factors directly within the reasoning context.
*   **Undo Toast Notifications:** Replace standard toasts with actionable notifications that allow users to immediately revert an accidental Approve/Reject action.

### Phase 3: Information Architecture & Perceived Performance
*Focus: Deep architectural improvements for contextual consistency and loading experiences.*
*   **Slide-out Drawer Integration:** Replace the current `DrillDownPanel` and potentially the `MatchDetailPanel` expansion with a unified Slide-out Drawer component for deep dives, preserving the background table/radar context.
*   **Skeleton Loaders:** Swap the generic `Loader2` spinners in `MatchesDashboard` and `RadarOportunidades` with tailored Skeleton components to reduce layout shift and improve perceived loading speed.
