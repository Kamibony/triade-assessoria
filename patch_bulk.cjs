const fs = require('fs');
let code = fs.readFileSync('src/components/BulkMatchRadar.tsx', 'utf8');

code = code.replace(/className=\{\\\`mt-8 p-6 rounded-lg border shadow-sm \\\$\\{activeJob.status === 'completed' \\? 'bg-green-500\\/5 border-green-500\\/20' : activeJob.status === 'error' \\? 'bg-red-500\\/5 border-red-500\\/20' : 'bg-card text-card-foreground'\\}\\\`\}/, 'className={`mt-8 p-6 rounded-lg border shadow-sm ${activeJob.status === \'completed\' ? \'bg-green-500/5 border-green-500/20\' : activeJob.status === \'error\' ? \'bg-red-500/5 border-red-500/20\' : \'bg-card text-card-foreground\'}`}');

code = code.replace(/style=\{\{ width: \\\`\\\$\\{Math.min\\(100, \\(activeJob.oscsProcessed \\/ Math.max\\(1, activeJob.totalOscs\\)\\) \\* 100\\)\\}%\\\` \}\}/, 'style={{ width: `${Math.min(100, (activeJob.oscsProcessed / Math.max(1, activeJob.totalOscs)) * 100)}%` }}');


fs.writeFileSync('src/components/BulkMatchRadar.tsx', code);
