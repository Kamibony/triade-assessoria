1. **Fix RSS Crash:** The error is `Parser is not a constructor`. `rss-parser` imports might need a workaround for commonjs vs esm. It is currently imported as `import Parser from 'rss-parser';`. In `index.ts`, change it to `import * as Parser from 'rss-parser';` or if we're using require style change it to `const Parser = require('rss-parser');`. Or we can investigate the import of `rss-parser`. I will update the import of `rss-parser` in `index.ts`. Wait, currently it's imported as `import Parser from 'rss-parser';`. In TS `const Parser = require('rss-parser');` might be better or `import Parser = require('rss-parser');`.

2. **Fix Async Leaks in Internal Fontes:** The `processScrapingTargetWorker` marks the global phase as `COMPLETED` asynchronously inside child task processing which runs concurrently per link enqueue (batch of 10). It only marks COMPLETED when `remainingLinks === 0` and `runData.phases.internalFontes.targetsProcessed >= runData.phases.internalFontes.totalTargets`. BUT `targetsProcessed` is incremented for EACH page of a target. Wait!
In `processScrapingTargetWorker`:
```typescript
            await searchRef.update({
                completedTargets: FieldValue.increment(1)
            });
            if (runId) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
                });
```
This is incremented when a target finishes all pages.
Wait, another place in the same worker:
```typescript
        if (candidateLinks.length === 0) {
            isNewFetch = true;
            if (runId && page === 1) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.internalFontes.targetsProcessed': FieldValue.increment(1) // THIS IS WRONG!!! It's incrementing it right when the page starts processing, not when it finishes! And wait, if it increments it at the start, then later it checks if targetsProcessed >= totalTargets...
                });
            }
```
Wait, if it increments it at the start AND at the end, it increments twice!
Wait, actually it shouldn't increment at the start. I will remove `targetsProcessed` increment from the start of the worker.
Let's see where it increments.
In `processScrapingTargetWorker`:
Line 3241:
```typescript
            if (runId && page === 1) {
                await db.collection('ingestion_runs').doc(runId).update({
                    'phases.internalFontes.targetsProcessed': FieldValue.increment(1)
                });
            }
```
If we increment it here, it marks a target as processed immediately! Which means the `checkAndUpdateGlobalRunStatus` could be triggered before all pages/links are processed! It explains why Fontes Internas is marked 'Concluído' while URLs are still climbing! It shouldn't increment `targetsProcessed` at the beginning of `page === 1`!

3. **Global Status Hangs:** The global status relies on `checkAndUpdateGlobalRunStatus` which checks if all 3 phases are `COMPLETED`. If RSS fails and we fix it, RSS will complete/fail. If Prosas completes. If Internal Fontes completes. Then `checkAndUpdateGlobalRunStatus` will run and finalize. The frontend has a pulsing "Em Execução" which will stop once status changes to `COMPLETED` or `FAILED`. However, the frontend currently loops forever because the status in Firestore never updates.
Additionally, I will ensure the frontend handles the transition well, maybe updating `IngestionRadar.tsx` if necessary. Actually the frontend is just observing the DB.

4. **Frontend UX:** "If a phase is 'Concluído', its numbers must be frozen." The numbers keep climbing because the backend is still running. Once we fix the async leak, the numbers won't climb after completion.

I will formulate a specific plan.
