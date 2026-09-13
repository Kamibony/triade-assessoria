const fs = require('fs');
const file = 'src/components/MatchesDashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

const urlFetchCode = `
  const handleRefreshStats = async () => {
    setIsRefreshingStats(true);
    try {
        const functions = await import('firebase/functions');
        const func = functions.httpsCallable(functions.getFunctions(), 'recalculateDashboardStats');
        await func();
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
    /const handleRefreshStats = async \(\) => {[\s\S]*?};/,
    urlFetchCode.trim()
);

fs.writeFileSync(file, content);
