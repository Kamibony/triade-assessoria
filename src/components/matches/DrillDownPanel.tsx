import React from 'react';
import { X, ExternalLink, Target, Users, Lock } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { MatchRow } from './MatchRow';

interface DrillDownPanelProps {
  type: 'osc' | 'edital';
  id: string;
  onClose: () => void;
  matches: MatchResult[];
  oscs: Record<string, NgoProfile>;
  editais: Record<string, Edital>;
  handleFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
}

export function DrillDownPanel({ type, id, onClose, matches, oscs, editais, handleFeedback }: DrillDownPanelProps) {
  const [expandedMatch, setExpandedMatch] = React.useState<string | null>(null);

  const relatedMatches = matches.filter(m => type === 'osc' ? m.oscId === id : m.editalId === id);
  const title = type === 'osc'
      ? oscs[id]?.name || relatedMatches[0]?.oscName || id
      : editais[id]?.title || id;

  const validMatchesCount = relatedMatches.filter(m => m.eligibility !== false).length;

  const handleGlobalInvalidate = async () => {
    if (window.confirm(`ATENÇÃO: Você está prestes a rejeitar GLOBALMENTE todos os ${relatedMatches.length} matches associados a este Edital. Esta ação atualizará o status de todos eles para "Rejeitado". Deseja continuar?`)) {
      try {
        const { getFirestore, writeBatch, doc } = await import('firebase/firestore');
        const db = getFirestore();

        // Max batch size is 500 in Firestore
        // We do this purely client-side for now, to ensure all related docs are hit based on the array
        const chunks = [];
        for (let i = 0; i < relatedMatches.length; i += 500) {
            chunks.push(relatedMatches.slice(i, i + 500));
        }

        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(match => {
                if (match.id) {
                    const matchRef = doc(db, 'matches', match.id);
                    batch.update(matchRef, { actionState: 'Rejeitado' });
                    // Also fire optimistic UI update
                    handleFeedback(match.id, 'Rejeitado');
                }
            });
            await batch.commit();
        }

        alert("Edital invalidado globalmente com sucesso. Todos os matches foram rejeitados.");
        onClose(); // Optionally close the panel
      } catch (error) {
        console.error("Error invalidating edital globally:", error);
        alert("Ocorreu um erro ao invalidar o edital. Verifique o console.");
      }
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-full md:w-[600px] bg-background border-l shadow-xl z-50 overflow-y-auto flex flex-col transform transition-transform duration-300 ease-in-out">
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-center gap-2 pr-4">
             {type === 'osc' ? <Users className="w-5 h-5 text-primary" /> : <Target className="w-5 h-5 text-primary" />}
            <h2 className="font-bold text-lg line-clamp-1" title={title}>{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors shrink-0">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 flex-1 space-y-6">
            {type === 'edital' && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                        <h4 className="font-bold text-destructive text-sm flex items-center gap-1">
                            <Lock className="w-4 h-4" /> Ação Global
                        </h4>
                        <p className="text-xs text-destructive/80 mt-1">
                            Rejeitar todos os {relatedMatches.length} matches deste edital de uma só vez.
                        </p>
                    </div>
                    <button
                        onClick={handleGlobalInvalidate}
                        className="whitespace-nowrap bg-destructive hover:bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                        Invalidar Edital Globalmente
                    </button>
                </div>
            )}

            <div className="bg-card border rounded-lg p-4 shadow-sm">
                 <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Resumo</h3>
                 {type === 'osc' && oscs[id] && (
                     <div className="space-y-2 text-sm">
                         <p><span className="font-medium">Localização:</span> {oscs[id].location || 'N/A'}</p>
                         <p><span className="font-medium">Missão:</span> {oscs[id].mission || 'N/A'}</p>
                         <p><span className="font-medium">Atividades:</span> {oscs[id].coreActivities?.join(', ') || 'N/A'}</p>
                     </div>
                 )}
                 {type === 'edital' && editais[id] && (
                     <div className="space-y-2 text-sm">
                         <p><span className="font-medium">Prazo:</span> {editais[id].deadline || 'N/A'}</p>
                         <p><span className="font-medium">Emissor:</span> {editais[id].issuer || 'N/A'}</p>
                         <p className="line-clamp-3"><span className="font-medium">Atividades Permitidas:</span> {editais[id].eligibilityCriteria?.allowedActivities?.join(', ') || 'N/A'}</p>
                         {(editais[id] as any).sourceUrl && (
                             <a href={(editais[id] as any).sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline mt-2">
                                <ExternalLink className="w-3 h-3 mr-1" /> Acessar Edital
                             </a>
                         )}
                     </div>
                 )}
                 {!oscs[id] && !editais[id] && (
                     <p className="text-sm text-muted-foreground italic">Detalhes adicionais não disponíveis. {type === 'osc' ? 'Perfil da OSC não carregado.' : 'Dados do edital não carregados.'}</p>
                 )}
            </div>

            <div>
                 <h3 className="font-semibold flex items-center gap-2 mb-4">
                     Matches Relacionados
                     <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">{validMatchesCount} Elegíveis</span>
                 </h3>
                 <div className="bg-card border rounded-lg shadow-sm overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted text-muted-foreground uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">{type === 'osc' ? 'Edital' : 'OSC'}</th>
                                <th className="px-4 py-3 font-medium text-center">Burocracia (G1)</th>
                                <th className="px-4 py-3 font-medium text-center">Temática (G2)</th>
                                <th className="px-4 py-3 font-medium text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {relatedMatches.map(match => (
                                <MatchRow
                                    key={match.id}
                                    match={match}
                                    edital={editais[match.editalId]}
                                    osc={oscs[match.oscId]}
                                    isExpanded={expandedMatch === match.id}
                                    onToggleExpand={() => setExpandedMatch(expandedMatch === match.id ? null : (match.id || null))}
                                    onFeedback={handleFeedback}
                                    hideColumn={type === 'osc' ? 'osc' : 'edital'}
                                />
                            ))}
                            {relatedMatches.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-4 text-muted-foreground">Nenhum match encontrado.</td></tr>
                            )}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
      </div>
    </>
  );
}
