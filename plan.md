1. **Apply missing Backend fixes**
   - After the `git reset --hard HEAD` I lost the `functions/src/index.ts` changes. I need to re-apply the changes to `triggerBulkInternalMatch` and `matchEvaluatorWorker` so that the frontend can read the `evaluationsCompleted` state.
2. **Apply missing Frontend fixes**
   - The crash fix for `IngestionRadar.tsx` was also wiped out by the git reset. I need to re-apply `run?.startTime?.toDate` check.
3. **Commit and Submit**
   - Once all fixes are correctly in place and tested, submit the changes.
