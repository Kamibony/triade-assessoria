# Portal Layout Architectural Audit & Refactoring Plan

## 1. Current State & Issues Identified

### Unpredictable Auto-Redirects
- **`PortalDiscover.tsx`**: Uses a `useEffect` hook to aggressively auto-redirect users to `/portal` if `oscId` is missing from the query params or not found in the user's `oscIds` array. This disrupts the user experience, especially if they navigate to `/portal/discover` directly or if state initialization is delayed.
- **`PortalWelcome.tsx`**: Has conditional rendering that forces the user to the onboarding flow visually. Though it requires a click, the flow lacks global navigation to escape if needed.

### Lack of Persistent Navigation Structure
- **`PortalLayout.tsx`**: Currently implements a top header (`<header>`) but lacks a persistent side navigation (Left Sidebar). Once users dive into routes like `/portal/onboarding` or `/portal/discover`, they lose quick access to other portal areas. The navigation relies heavily on "Back" buttons or clicking the logo to return to the hub.
- **Context passing**: `PortalLayout` passes `oscIds` via `useOutletContext`, which is good, but without a sidebar, managing global state (like selecting the active OSC) is cumbersome.

### State Transitions
- **`ManualOscIngest.tsx` (Onboarding)**: After successful ingestion, the user is presented with a button that explicitly navigates them. However, if they want to cancel or switch contexts mid-ingestion, they must rely on browser navigation because there's no sidebar.

---

## 2. Proposed Architectural Overhaul

### Persistent Layout & Left Sidebar (App Shell)
We will refactor `PortalLayout.tsx` into a robust App Shell consisting of:
1. **Left Sidebar (Navigation)**:
   - **Hub / Dashboard**: Links to `/portal` (Home/Portfolio).
   - **Descobrir Oportunidades**: Links to `/portal/discover`. We will remove the query parameter requirement for initial navigation. If an `oscId` is needed but not selected, the page will present a clean "Select an OSC" UI rather than redirecting.
   - **Adicionar Nova OSC**: Links to `/portal/onboarding` (Fast-Track).
2. **Top Header**: Keeps the user profile, active OSC selector (optional global context), and logout functionality.
3. **Main Content Area**: Displays the `Outlet` content.

### Elimination of Aggressive Auto-Redirects
- **`PortalDiscover.tsx`**:
  - **Action**: Remove the `useEffect` that triggers `navigate('/portal')`.
  - **Replacement**: Introduce a clear "Missing OSC" state. If `oscId` is absent or invalid, render a user-friendly prompt: *"Por favor, selecione uma OSC para descobrir oportunidades"* with a dropdown or list to select from, or a button to go to Onboarding.
- **Global Rule**: All route transitions must be triggered by explicit user actions (e.g., clicking a sidebar link, clicking "Acessar Painel" in `PortalWelcome.tsx`, or clicking "Acessar Painel da OSC" in `ManualOscIngest.tsx`).

### Predictable State-Machine Approach
- **Discovery Flow (`PortalDiscover.tsx`)**: Ensure the IDLE, PROCESSING, and RESULTS states are strictly driven by user intent. The user must manually click "Analisar Oportunidades Agora" to transition from IDLE to PROCESSING.
- **Onboarding Flow (`ManualOscIngest.tsx`)**:
  - Ensure the 3 phases (Ingestion, Review, Action) are preserved.
  - Users can exit the flow at any time via the new Left Sidebar without being trapped.

---

## 3. Implementation Steps

1. **Refactor `PortalLayout.tsx`**: Add the Sidebar component with `lucide-react` icons (`Home`, `Search`, `PlusCircle`). Use a responsive design (hidden on mobile, toggleable, or bottom bar on small screens).
2. **Update `PortalDiscover.tsx`**: Rip out the `useEffect` redirect. Add a fallback UI for when `oscId` is not provided.
3. **Audit other files**: Ensure no other hidden redirects exist in the `/portal` namespace (except standard Auth guards in `ProtectedRoute.tsx` and `Login.tsx`).
4. **CSS/Styling**: Use existing Tailwind/shadcn-like utility classes (`flex`, `min-h-screen`, `w-64`, `bg-card`, etc.) to build the sidebar seamlessly into the existing theme.
