1. **Task 1: Process Completion Feedback (UX)**
   - Backend modification:
     - Pass `jobId` in the task payload in `triggerBulkInternalMatch`. Add `matchesEvaluated: 0` to the initial document created for `system_jobs`. Also instead of setting status to `completed` in `triggerBulkInternalMatch`, let's set it to `dispatching_completed` or something similar, and then the worker will set it to `completed` when all evaluations are done. Actually, let's keep it simpler: leave the dispatch logic mostly the same but initialize `matchesEvaluated: 0` and pass `jobId` to worker.
     - Modify `matchEvaluatorWorker` to accept `jobId`, process the match, and finally increment `matchesEvaluated` on the `system_jobs` doc.
     - Also in `matchEvaluatorWorker`, check if `matchesEvaluated >= matchesTriggered`. If yes, mark a flag `evaluationsCompleted: true` on the job document. Wait, how to avoid race conditions with multiple workers? Can use a Firestore transaction or `FieldValue.increment(1)`. Then we need to check if `matchesEvaluated >= matchesTriggered`.
   - Frontend Modification (`MatchesDashboard.tsx`):
     - Query `system_jobs` where `type == 'bulk_match'` and maybe match the `importBatchId` if available, or just the latest one running.
     - Display a Badge: "Processando Avaliações..." or "Avaliação Concluída".
     - Toast notification (e.g., using `react-hot-toast` or similar, check what library they use or simple state) when state transitions to completed.

2. **Task 2: Fix Frontend Crash**
   - In `IngestionRadar.tsx`, `run?.startTime?.toDate` is checked, but maybe `run` is undefined? Or maybe it's accessed somewhere else? Wait, `run?.startTime` can be undefined, and `?.toDate` checks if `toDate` exists. If `run` is undefined, `run.startTime` crashes. I'll add `run?.startTime?.toDate` everywhere `startTime` is read.

3. **Task 3: 'Radar de Oportunidades'**
   - Create `src/components/RadarOportunidades.tsx`.
   - Fetch matches and group them.
   - Hot Leads (Ranking de OSCs): Group matches by OSC where score > 0.8, sort by count.
   - Top Grants: Group matches by Edital, sort by match count.
   - Funil de Conversão: Total Imported (need to know this or assume from matches?), Generated Vectors, AI Approved, Manually Approved.
   - Nuvem de Insights: Extract frequent keywords from AI-approved matches (we can extract from `justification` or tags if they exist).

4. **Pre Commit**
   - Call `pre_commit_instructions` before submitting.
