1. **Fix Parser Crash in RSS Phase:**
   - The RSS phase immediately crashes because of an initialization error. The `rss-parser` import `import Parser from 'rss-parser';` is likely resulting in `Parser is not a constructor` at runtime.
   - I will change it to `const Parser = require('rss-parser');` in `functions/src/index.ts` to ensure the correct commonjs construction.

2. **Fix Async Leaks in Internal Fontes (Zombie Fontes Internas):**
   - The UI shows "Concluído" but URLs keep climbing. This happens because in `processScrapingTargetWorker`, `targetsProcessed` is incorrectly incremented at the *beginning* of processing a target (when `page === 1` and `candidateLinks.length === 0`).
   - I will remove the `FieldValue.increment(1)` for `targetsProcessed` at the beginning of the worker in `functions/src/index.ts`. It should only be incremented when the target finishes entirely (when `remainingLinks.length === 0` and there are no more pages to fetch).
   - This prevents the `checkAndUpdateGlobalRunStatus` from prematurely marking the phase as `COMPLETED`.

3. **Enhance Global Status Synchronization:**
   - With the leaks fixed, `checkAndUpdateGlobalRunStatus` will correctly detect when all phases (`prosas`, `internalFontes`, `rssAndQueries`) are fully finished (`targetsProcessed >= totalTargets`).
   - I will also double-check the RSS worker to ensure it cleanly triggers `checkAndUpdateGlobalRunStatus(runId)`. The worker code already has this at the end of `rssWorker`.
   - The frontend's `IngestionRadar.tsx` will naturally behave correctly: numbers will freeze when a phase is complete, and the global status will transition to "Concluído" or "Falhou" (stopping the infinite pulse) when the DB updates. No frontend UX changes are needed beyond ensuring the database state correctly reflects reality.

4. **Ensure Verification and Tests:**
   - Complete pre-commit steps to make sure proper testing, verifications, reviews, and reflections are done.

5. **Submit changes.**
