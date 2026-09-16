const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

// 1. Add X icon import
code = code.replace(
    /import \{ Search, ChevronRight, CheckCircle2, Clock, AlertCircle, RefreshCw \} from 'lucide-react';/,
    "import { Search, ChevronRight, CheckCircle2, Clock, AlertCircle, RefreshCw, X } from 'lucide-react';"
);

// 2. Add MatchDetailPanel import
code = code.replace(
    /import \{ useActiveOsc \} from '\.\.\/\.\.\/contexts\/portal\/ActiveOscContext';/,
    "import { useActiveOsc } from '../../contexts/portal/ActiveOscContext';\nimport { MatchDetailPanel } from '../matches/MatchDetailPanel';"
);

// 3. Add OpportunityDetailsModal component
const modalComponent = `
const OpportunityDetailsModal: React.FC<{ match: MatchResult; onClose: () => void }> = ({ match, onClose }) => {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card rounded-2xl border shadow-xl p-6"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>

                    <h2 className="text-2xl font-bold mb-6 pr-8">
                        Edital {match.editalId} - Detalhes
                    </h2>

                    <MatchDetailPanel
                        match={match}
                        onFeedback={(matchId, action) => {
                            toast.success(\`Feedback salvo: \${action}\`);
                            // Em produção, isso faria a chamada para a API
                        }}
                    />
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
`;

if (!code.includes('OpportunityDetailsModal')) {
    code = code + '\n' + modalComponent;
}

// 4. Update PortalDiscover to hold selected match state
code = code.replace(
    /const \[isInitializing, setIsInitializing\] = useState\(true\);/,
    "const [isInitializing, setIsInitializing] = useState(true);\n  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);"
);

// 5. Update OpportunityCard mapping to pass onClick handler
code = code.replace(
    /<OpportunityCard key=\{match.id\} match=\{match\} \/>/g,
    "<OpportunityCard key={match.id} match={match} onClick={() => setSelectedMatch(match)} />"
);

// 6. Add modal render in RESULTS state
code = code.replace(
    /\{matches\.length === 0 && \(/,
    "{selectedMatch && <OpportunityDetailsModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />}\n\n            {matches.length === 0 && ("
);

// 7. Update OpportunityCard props and toast to onClick
code = code.replace(
    /const OpportunityCard: React\.FC<\{ match: MatchResult \}> = \(\{ match \}\) => \{/,
    "const OpportunityCard: React.FC<{ match: MatchResult; onClick?: () => void }> = ({ match, onClick }) => {"
);

code = code.replace(
    /onClick=\{\(\) => toast\.success\("Abre o modal de detalhes \(OpportunityDetailsModal\) com a justificativa completa em Markdown\."\)\}/,
    "onClick={onClick}"
);

fs.writeFileSync(filepath, code);
