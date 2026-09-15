# Client Portal Architecture & UX/UI Audit Report

## Part 1: Root Cause Analysis of the Current Crash (Error 400)

**Symptom:**
After a successful onboarding, the user is redirected to `/portal/discover?oscId=...`. The UI displays "Analisando o cenário...", but the console throws a `400 Bad Request: FirebaseError: targetId e targetType são obrigatórios`. The UI then falls back to mock data ('Edital e-1').

**Root Cause:**
The crash is caused by a payload mismatch between the frontend API call and the backend Cloud Function schema for `triggerBatchVerification`.

*   **Frontend Trace:** In `src/components/portal/PortalDiscover.tsx`, the function is called with only the `oscId`:
    ```typescript
    const triggerBatchVerification = httpsCallable(functions, 'triggerBatchVerification');
    triggerBatchVerification({ oscId }).catch(...)
    ```
*   **Backend Trace:** In `functions/src/index.ts`, `triggerBatchVerification` expects a strictly typed payload:
    ```typescript
    const { targetId, targetType } = request.data as { targetId?: string, targetType?: 'osc' | 'edital' };
    if (!targetId || !targetType) {
        throw new HttpsError('invalid-argument', 'targetId e targetType são obrigatórios.');
    }
    ```
Because the frontend sends `{ oscId: ... }` instead of `{ targetId: ..., targetType: 'osc' }`, the validation fails and throws the 400 error.

---

## Part 2: Comprehensive UX/UI & Routing Audit

Here is the architectural proposal to fix the identified routing, UI layouts, and state management issues.

*   **The Entry Point (Black Screen on `/portal/`):**
    *   *Issue:* Accessing the root namespace `/portal` directly results in a black screen because there is no default index route defined for it in `App.tsx`.
    *   *Proposal:* Add an index route to the `/portal` route block that explicitly redirects to the default discovery view: `<Route index element={<Navigate to="discover" replace />} />`.

*   **Context Awareness & Routing (`oscId` usage):**
    *   *Issue:* `PortalLayout.tsx` correctly queries the user's document for their linked `oscId` and conditionally redirects to onboarding if it's missing. However, `PortalDiscover.tsx` completely ignores this pre-fetched context. Instead, it attempts to derive it manually with a fragile fallback: `const oscId = user?.uid || 'mock-osc-id';`.
    *   *Proposal:* `PortalLayout.tsx` already passes `oscId` via `<Outlet context={{ oscId }} />`. `PortalDiscover.tsx` must be updated to consume it using `const { oscId } = useOutletContext<{ oscId: string }>();` (from `react-router-dom`), establishing a single source of truth for state management.

*   **Navigation & Escapability (`/portal/onboarding` Traps):**
    *   *Issue:* The client onboarding flow (`<ManualOscIngest />`) at `/portal/onboarding` is rendered completely outside of `PortalLayout` in `App.tsx`. As a result, the user is trapped on a standalone page lacking the standard application Header, a 'Back' button, or crucially, a 'Sair' (Logout) button.
    *   *Proposal:* Create a dedicated `PortalOnboardingLayout.tsx` component that includes a minimal, safe Header (displaying the TRÍADE logo and a functional Logout button). Wrap the `/portal/onboarding` route with this new layout in `App.tsx` to ensure escapability without breaking the linear onboarding UX.

*   **Mock Data Removal:**
    *   *Issue:* `PortalDiscover.tsx` contains hardcoded mock data for an "Edital e-1" that is injected whenever the `matches` collection returns empty results.
    *   *Proposal:* Delete the `if (fetchedMatches.length === 0)` block pushing mock data inside the `fetchResults` function. The UI already has a well-designed empty state ("Nenhum edital elegível no momento" with an `AlertCircle` icon) that should be rendered instead when no legitimate data exists in the Data Lake.
