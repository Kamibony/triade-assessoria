const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

const replacement = `
const OpportunityCard: React.FC<{ match: MatchResult; onClick?: () => void }> = ({ match, onClick }) => {
    const isPendingInfo = match.verificationResult?.some(r => r.status === 'Pendente de Informação') || match.actionState === 'Pendente de Informação';

    return (
        <div className="bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
            <div className="p-6 flex-grow space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        {match.badges?.map(badge => (
                            <span key={badge} className="inline-block px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-md mr-2 mb-2">
                                {badge}
                            </span>
                        ))}
                        {isPendingInfo && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-md mr-2 mb-2">
                                <AlertCircle className="w-3 h-3" />
                                Pendente de Informação
                            </span>
                        )}
                    </div>
`;

code = code.replace(
    /const OpportunityCard: React\.FC<\{ match: MatchResult; onClick\?: \(\) => void \}> = \(\{ match, onClick \}\) => \{\s+return \(\s+<div className="bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">\s+<div className="p-6 flex-grow space-y-4">\s+<div className="flex justify-between items-start">\s+<div className="space-y-1">\s+\{match\.badges\?\.map\(badge => \(\s+<span key=\{badge\} className="inline-block px-2 py-1 bg-primary\/10 text-primary text-xs font-semibold rounded-md mr-2 mb-2">\s+\{badge\}\s+<\/span>\s+\)\)\}\s+<\/div>/,
    replacement
);

fs.writeFileSync(filepath, code);
