const fs = require('fs');
let content = fs.readFileSync('src/components/MatchesDashboard.tsx', 'utf8');

content = content.replace(
    'const [globalStats, setGlobalStats] = useState<any>(null);',
    'const [globalStats, setGlobalStats] = useState<any>(null);\n  const [statsLoading, setStatsLoading] = useState(true);\n  const [isRefreshingStats, setIsRefreshingStats] = useState(false);'
);

// We also need to add statsLoading back to the snapshot because it looks like I completely reverted to the base file when I ran `git restore`!
content = content.replace(
    'setGlobalStats(docSnap.data());',
    'setGlobalStats(docSnap.data());\n        setStatsLoading(false);'
);
content = content.replace(
    'setGlobalStats(null);',
    'setGlobalStats(null);\n        setStatsLoading(false);'
);
content = content.replace(
    'console.error("Error fetching global stats:", error);',
    'console.error("Error fetching global stats:", error);\n      setStatsLoading(false);'
);

// We need to restore the skeleton logic
content = content.replace(
    '<p className="text-3xl font-bold mt-1">{globalStats?.total || 0}</p>',
    '<p className="text-3xl font-bold mt-1">{statsLoading ? <Skeleton className="h-8 w-16" /> : (globalStats?.total ?? "-")}</p>'
);

content = content.replace(
    '{globalStats?.pendentes || 0}',
    '{statsLoading ? <Skeleton className="h-8 w-16" /> : (globalStats?.pendentes ?? "-")}'
);

content = content.replace(
    '{globalStats?.manuallyApproved || 0}',
    '{statsLoading ? <Skeleton className="h-8 w-16" /> : (globalStats?.manuallyApproved ?? "-")}'
);

content = content.replace(
    '{globalStats?.reprovados || 0}',
    '{statsLoading ? <Skeleton className="h-8 w-16" /> : (globalStats?.reprovados ?? "-")}'
);

if (!content.includes('RefreshCw')) {
    content = content.replace(
        "import { Activity, CheckCircle2 } from 'lucide-react';",
        "import { Activity, CheckCircle2, RefreshCw } from 'lucide-react';"
    );
}

fs.writeFileSync('src/components/MatchesDashboard.tsx', content);
