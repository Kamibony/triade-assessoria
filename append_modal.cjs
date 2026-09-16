const fs = require('fs');
const filepath = 'src/components/portal/PortalDiscover.tsx';
let code = fs.readFileSync(filepath, 'utf8');

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

if (!code.includes('const OpportunityDetailsModal:')) {
    code = code + '\n' + modalComponent;
    fs.writeFileSync(filepath, code);
}
