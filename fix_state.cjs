const fs = require('fs');
let content = fs.readFileSync('src/components/MatchesDashboard.tsx', 'utf8');

// I seem to have lost the `isRefreshingStats` state when I ran `patch_dashboard.cjs` and replaced the entire file logic earlier in plan step 1.
// Let's add it back right below statsLoading.
content = content.replace(
    'const [statsLoading, setStatsLoading] = useState(true);',
    'const [statsLoading, setStatsLoading] = useState(true);\n  const [isRefreshingStats, setIsRefreshingStats] = useState(false);'
);

// Oh wait, did I also lose the `RefreshCw` import?
if (!content.includes('RefreshCw')) {
    content = content.replace(
        "import { Activity, CheckCircle2 } from 'lucide-react';",
        "import { Activity, CheckCircle2, RefreshCw } from 'lucide-react';"
    );
}

fs.writeFileSync('src/components/MatchesDashboard.tsx', content);
