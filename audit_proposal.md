### Architectural Audit of `ManualOscIngest.tsx` and Onboarding Flow

**Current Flow & Logical Flaws:**
1. **Initial State:** User chooses between CNPJ or PDF ingestion.
2. **CNPJ Mode (Aggressive Redirect Flaw):**
   - User submits a CNPJ, calling `ingestSingleOscByCnpj`.
   - On success, it updates the state with the profile data but **immediately redirects** to `/portal/discover` (or calls `onSuccess`).
   - *Result:* The user never sees the success confirmation or the "Preview do Perfil da OSC". They are violently yanked into the Discovery page.
3. **PDF Mode (Conflated Actions Flaw):**
   - User submits PDFs, calling `ingestManualOscFunction`.
   - On success, it does *not* auto-redirect. The user sees the Profile Preview.
   - However, the CTA button is "Encontrar Editais Compatíveis", which triggers `triggerAgenticSearch` in the background before redirecting.
   - *Result:* It conflates profile creation with discovery. Furthermore, when redirected to `PortalDiscover`, the user lands in an `IDLE` state and is asked to click "Analisar Oportunidades Agora" (triggering `triggerBatchVerification`). This causes a confusing double-trigger of backend matching functions.

---

### Proposed Clean, State-Based UX/UI Flow

**1. Phase 1: Ingestion (Profile Creation)**
- The user inputs their CNPJ or uploads PDFs in `ManualOscIngest`.
- The system calls the appropriate cloud function while displaying a loading state ("Buscando dados na Receita Federal..." or "Extraindo Perfil...").

**2. Phase 2: Profile Review (Explicit Feedback - The Missing Step)**
- **Action:** Remove the immediate redirect logic from the CNPJ success block.
- Upon successful profile creation (via either mode), the UI transitions strictly to a Success State.
- The user is presented with a clear success banner ("OSC cadastrada com sucesso!") and the **Preview do Perfil da OSC**.
- **Action:** Modify the CTA button. Remove the `triggerAgenticSearch` call completely. Change the button text to a navigation-only action, such as **"Acessar Painel da OSC"** or **"Ir para o Hub"**.

**3. Phase 3: Discovery (Explicit Action)**
- The user clicks the new CTA and is navigated to `/portal/discover?oscId=XXX`.
- `PortalDiscover` mounts in its designed `IDLE` state.
- The user is presented with the prompt to "Analisar Oportunidades Agora".
- **Action:** The user explicitly triggers the matching engine from the Discovery view, launching the labor illusion animations and background processing (`triggerBatchVerification`).

This structure strictly separates Ingestion from Discovery, completely stops phantom redirects, removes redundant API calls, and ensures the user receives explicit visual feedback for every step of the journey.