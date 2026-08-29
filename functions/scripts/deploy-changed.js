const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const allFunctions = [
  'parsePdfProfileFunction', 'extractEditalRulesFunction', 'agenticSearchWorker',
  'matchEvaluatorWorker', 'processOscChunkWorker', 'ingestOscDataFunction',
  'triggerMatchOrchestrator', 'onOscUpdated', 'ingestGoogleAlertsRss',
  'ingestManualOscFunction', 'ingestManualEditalFunction', 'askCopilotFunction',
  'manualTriggerRssSyncFunction', 'scheduledMatchSweeper', 'onMatchGenerated',
  'triggerAgenticSearch', 'autonomousSearchWorker', 'triggerScrapingWorker',
  'seedScrapingTargets', 'extractionWorker', 'processScrapingTargetWorker',
  'onSearchCreated'
];

try {
  let functionsToDeploy = [];

  try {
    // Determine the commits to compare
    const commitBefore = process.env.COMMIT_BEFORE;
    const commitSha = process.env.COMMIT_SHA;

    // Construct the git diff command based on available environment variables or fallback to HEAD~1 HEAD
    let diffCommand = 'git diff HEAD~1 HEAD';
    if (commitBefore && commitSha && commitBefore !== '0000000000000000000000000000000000000000') {
      diffCommand = `git diff ${commitBefore} ${commitSha}`;
    }

    console.log(`Using diff command: ${diffCommand}`);

    // Get list of changed files between current commit and previous commit
    const changedFiles = execSync(`${diffCommand} --name-only`).toString().trim().split('\n');

    if (changedFiles.includes('functions/src/index.ts')) {
      // If index.ts changed, check which function exports were modified.
      // We use word boundaries to avoid partial matches
      const diff = execSync(`${diffCommand} functions/src/index.ts`).toString();
      functionsToDeploy = allFunctions.filter(fn => {
        // Simple heuristic: if the function name appears in the diff output (which includes context and changes)
        // Check if there is any modification related to it.
        // A better approach is to check if the diff actually contains the function name.
        const regex = new RegExp(`\\b${fn}\\b`);
        return regex.test(diff);
      });
    }
  } catch (gitError) {
    console.warn('Git diff failed (possibly no previous commit or missing history). Falling back to deploy all.', gitError.message);
  }

  // If no specific functions were found in diff, or if other files changed, deploy all in batches
  if (functionsToDeploy.length === 0) {
    console.log('No specific functions found in diff, index.ts not changed, or git diff failed. Deploying all functions.');
    functionsToDeploy = [...allFunctions];
  }

  console.log('Deploying functions:', functionsToDeploy);

  // Batch deployments (5 at a time)
  for (let i = 0; i < functionsToDeploy.length; i += 5) {
    const batch = functionsToDeploy.slice(i, i + 5);
    const deployString = batch.map(f => `functions:${f}`).join(',');
    console.log(`Deploying batch: ${deployString}`);
    execSync(`npx firebase-tools deploy --only ${deployString} --project triade-assessoria --force`, { stdio: 'inherit' });
  }

} catch (error) {
  console.error('Deployment script failed:', error);
  process.exit(1);
}
