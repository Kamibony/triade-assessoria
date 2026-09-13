const fs = require('fs');
const file = 'src/components/MatchesDashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add RefreshCw import from lucide-react
content = content.replace(
    "import { Activity, CheckCircle2 } from 'lucide-react';",
    "import { Activity, CheckCircle2, RefreshCw } from 'lucide-react';"
);

// Add isRefreshingStats state
content = content.replace(
    'const [statsLoading, setStatsLoading] = useState(true);',
    'const [statsLoading, setStatsLoading] = useState(true);\n  const [isRefreshingStats, setIsRefreshingStats] = useState(false);'
);

// Add the refresh function
const refreshCode = `
  const handleRefreshStats = async () => {
    setIsRefreshingStats(true);
    try {
        const response = await fetch('http://127.0.0.1:5001/ai-para-ongs/us-central1/recalculateDashboardStats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) throw new Error('Falha ao atualizar dados');
        toast.success('Dados atualizados com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar stats:', error);
        toast.error('Erro ao atualizar os dados.');
    } finally {
        setIsRefreshingStats(false);
    }
  };
`;

content = content.replace(
    'const handleLoadMore = () => {',
    refreshCode + '\n  const handleLoadMore = () => {'
);

// Add the button to the UI
const buttonUI = `
         <div className="flex items-center gap-4">
           <h2 className="text-2xl font-bold tracking-tight">Dashboard de Matches (V2)</h2>
           <button
             onClick={handleRefreshStats}
             disabled={isRefreshingStats}
             className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
           >
             <RefreshCw className={\`w-4 h-4 \${isRefreshingStats ? 'animate-spin' : ''}\`} />
             Atualizar Dados
           </button>
`;

content = content.replace(
    '<div className="flex items-center gap-4">\n           <h2 className="text-2xl font-bold tracking-tight">Dashboard de Matches (V2)</h2>',
    buttonUI
);

fs.writeFileSync(file, content);
