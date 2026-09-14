import { useEffect, useState } from 'react';
import { X, ExternalLink, Target, Users, Lock, Loader2, CheckCircle2, Activity } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { MatchRow } from './MatchRow';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface DrillDownPanelProps {
  type: 'osc' | 'edital';
  id: string;
  onClose: () => void;
  handleFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
  handleGlobalInvalidate?: (editalId: string) => void;
}

export function DrillDownPanel({ type, id, onClose, handleFeedback, handleGlobalInvalidate }: DrillDownPanelProps) {
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  const [relatedMatches, setRelatedMatches] = useState<MatchResult[]>([]);
  const [oscs, setOscs] = useState<Record<string, NgoProfile>>({});
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(id);
  const [activeVerificationJob, setActiveVerificationJob] = useState<any>(null);

  useEffect(() => {
    const db = getFirestore();
    const verifyJobQuery = query(
      collection(db, 'system_jobs'),
      where('type', '==', 'batch_verification'),
      where('status', 'in', ['running', 'completed'])
    );

    const unsubscribeVerifyJob = onSnapshot(verifyJobQuery, (snapshot) => {
      const jobs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      jobs.sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      const currentActive = jobs[0];

      setActiveVerificationJob((prev: any) => {
        if (prev && prev.status !== 'completed' && (currentActive as any)?.status === 'completed') {
          toast.success('Verificação em lote concluída com sucesso');
        }
        return currentActive || null;
      });
    });

    return () => {
      unsubscribeVerifyJob();
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const db = getFirestore();

      try {
        // Fetch specific OSC or Edital to get the title and details
        if (type === 'osc') {
          const oscDoc = await getDoc(doc(db, 'oscs', id));
          if (oscDoc.exists()) {
            const oscData = oscDoc.data() as NgoProfile;
            setOscs({ [id]: oscData });
            setTitle(oscData.name || id);
          }
        } else {
          const editalDoc = await getDoc(doc(db, 'editais', id));
          if (editalDoc.exists()) {
            const editalData = editalDoc.data() as Edital;
            setEditais({ [id]: editalData });
            setTitle(editalData.title || id);
          }
        }

        // Fetch all related matches
        const matchesQuery = query(
          collection(db, 'matches'),
          where(type === 'osc' ? 'oscId' : 'editalId', '==', id)
        );
        const matchesSnap = await getDocs(matchesQuery);
        const fetchedMatches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as MatchResult));

        // Exclude completely globally inactive editais if we are looking at an OSC
        let activeMatches = fetchedMatches.filter(m => m.eligibility !== false && m.actionState !== 'Rejeitado');

        setRelatedMatches(activeMatches);

        // Fetch associated editais/oscs for the matches
        if (activeMatches.length > 0) {
            if (type === 'osc') {
                const editalIds = [...new Set(activeMatches.map(m => m.editalId))];
                const editaisMap: Record<string, Edital> = {};
                for (let i = 0; i < editalIds.length; i += 10) {
                    const chunk = editalIds.slice(i, i + 10);
                    const q = query(collection(db, 'editais'), where('__name__', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.docs.forEach(d => {
                        editaisMap[d.id] = d.data() as Edital;
                    });
                }
                setEditais(prev => ({ ...prev, ...editaisMap }));

                // Now filter out inactive editais
                activeMatches = activeMatches.filter(m => editaisMap[m.editalId]?.ativo !== false);
                setRelatedMatches(activeMatches);

            } else {
                const oscIds = [...new Set(activeMatches.map(m => m.oscId))];
                const oscsMap: Record<string, NgoProfile> = {};
                for (let i = 0; i < oscIds.length; i += 10) {
                    const chunk = oscIds.slice(i, i + 10);
                    const q = query(collection(db, 'oscs'), where('__name__', 'in', chunk));
                    const snap = await getDocs(q);
                    snap.docs.forEach(d => {
                        oscsMap[d.id] = d.data() as NgoProfile;
                    });
                }
                setOscs(prev => ({ ...prev, ...oscsMap }));
            }
        }

      } catch (error) {
        console.error("Error fetching drilldown data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [type, id]);

  const validMatchesCount = relatedMatches.filter(m => m.eligibility !== false && m.actionState !== 'Rejeitado').length;

  const handleVerifyPending = async () => {
    try {
      const functionsLib = await import('firebase/functions');
      const triggerBatchVerification = functionsLib.httpsCallable(functionsLib.getFunctions(), 'triggerBatchVerification');
      toast.success('Iniciando verificação em lote...');
      await triggerBatchVerification({ targetId: id, targetType: 'osc' });
    } catch (error: any) {
      console.error('Error triggering batch verification:', error);
      toast.error(`Erro: ${error.message || 'Falha ao iniciar verificação'}`);
    }
  };

  const onGlobalInvalidateClick = () => {
      if (handleGlobalInvalidate) {
          handleGlobalInvalidate(id);
          onClose();
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
            {loading ? (
                <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <>
            {type === 'osc' && (
                <div className="bg-secondary/10 border border-secondary/20 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div>
                        <h4 className="font-bold text-secondary-foreground text-sm flex items-center gap-1">
                            <Target className="w-4 h-4" /> Verificação em Lote
                        </h4>
                        <p className="text-xs text-secondary-foreground/80 mt-1">
                            Verificar todos os matches pendentes para esta OSC.
                        </p>
                        {activeVerificationJob && (
                          <div className="mt-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${activeVerificationJob.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {activeVerificationJob.status === 'completed' ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Verificação Concluída ({activeVerificationJob.completedTasks}/{activeVerificationJob.totalTasks})
                                </>
                              ) : (
                                <>
                                  <Activity className="w-3 h-3 mr-1 animate-pulse" />
                                  Verificando ({activeVerificationJob.completedTasks + activeVerificationJob.failedTasks}/{activeVerificationJob.totalTasks})...
                                </>
                              )}
                            </span>
                          </div>
                        )}
                    </div>
                    <button
                        onClick={handleVerifyPending}
                        disabled={!!activeVerificationJob && activeVerificationJob.status !== 'completed'}
                        className="whitespace-nowrap inline-flex items-center gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <CheckCircle2 className={`w-4 h-4 ${activeVerificationJob && activeVerificationJob.status !== 'completed' ? 'animate-pulse' : ''}`} />
                        Verificar Todos
                    </button>
                </div>
            )}

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
                        onClick={onGlobalInvalidateClick}
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
                </>
            )}
        </div>
      </div>
    </>
  );
}
