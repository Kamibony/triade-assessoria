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
  // Get list of changed files
  const changedFiles = execSync('git diff --name-only HEAD~1').toString().trim().split('\n');

  let functionsToDeploy = [];

  if (changedFiles.includes('functions/src/index.ts')) {
    // If index.ts changed, we grep the diff to see which function names were added/modified
    const diff = execSync('git diff HEAD~1 functions/src/index.ts').toString();
    functionsToDeploy = allFunctions.filter(fn => diff.includes(fn));
  }

  // If no specific functions were found in diff, or if other files changed, deploy all in batches
  if (functionsToDeploy.length === 0) {
    console.log('No specific functions found in diff or index.ts not changed. Deploying all functions.');
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
