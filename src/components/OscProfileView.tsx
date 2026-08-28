import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, Search, ArrowLeft, Building2, CheckCircle2, AlertCircle, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAgenticSearchTracker } from '../lib/useAgenticSearchTracker';
import { ProgressRadar } from './ui/ProgressRadar';
import toast from 'react-hot-toast';
import type { NgoProfile, MatchResult, Edital } from '../lib/types';

export function OscProfileView() {
  const { oscId } = useParams();
  const navigate = useNavigate();
  const [osc, setOsc] = useState<NgoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAgenticRunning, setIsAgenticRunning] = useState(false);
  const [agenticResult, setAgenticResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const { activeJob } = useAgenticSearchTracker(oscId);
  const [showRadar, setShowRadar] = useState(false);

  useEffect(() => {
     if (activeJob && !showRadar) {
         setShowRadar(true);
     }
  }, [activeJob]);

  // Matches states
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [hideLowScores, setHideLowScores] = useState(false);

  useEffect(() => {
    if (!oscId) return;
    const db = getFirestore();
    const unsubscribe = onSnapshot(doc(db, 'oscs', oscId), (docSnap) => {
      if (docSnap.exists()) {
        setOsc({ id: docSnap.id, ...docSnap.data() } as NgoProfile);
      } else {
        setOsc(null);
      }
      setLoading(false);
    });

    // Fetch Matches
    const matchesQuery = query(collection(db, 'matches'), where('oscId', '==', oscId));
    const unsubscribeMatches = onSnapshot(matchesQuery, async (snapshot) => {
        const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));

        matchesData.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || (typeof a.createdAt === 'number' ? a.createdAt : 0);
            const timeB = b.createdAt?.toMillis?.() || (typeof b.createdAt === 'number' ? b.createdAt : 0);
            return timeB - timeA;
        });

        setMatches(matchesData);

        const editalIds = [...new Set(matchesData.map(m => m.editalId))];
        if (editalIds.length > 0) {
            try {
                const { documentId } = await import("firebase/firestore");
                const editaisMap: Record<string, Edital> = {};
                const chunkSize = 10;
                for (let i = 0; i < editalIds.length; i += chunkSize) {
                    const chunk = editalIds.slice(i, i + chunkSize);
                    const validChunk = chunk.filter(id => !!id);
                    if (validChunk.length > 0) {
                        const q = query(collection(db, "editais"), where(documentId(), "in", validChunk));
                        const editaisSnap = await getDocs(q);
                        editaisSnap.forEach(d => { editaisMap[d.id] = { id: d.id, ...d.data() } as Edital; });
                    }
                }
                setEditais(editaisMap);
            } catch (e) {
                console.error("Error fetching editais", e);
            }
        }
        setLoadingMatches(false);
    }, (error) => {
        console.error("Error listening to matches:", error);
        setLoadingMatches(false);
    });

    return () => {
        unsubscribe();
        unsubscribeMatches();
    };
  }, [oscId]);

  const handleRunAgenticSearch = async () => {
    if (!oscId) return;
    setIsAgenticRunning(true);
    setAgenticResult(null);
    const loadingToast = toast.loading('Iniciando Busca Agêntica...');

    try {
        const triggerAgenticSearch = httpsCallable(functions, 'triggerAgenticSearch');
        const result = await triggerAgenticSearch({ oscId });
        const data = result.data as { success: boolean; message: string };
        if (data.success) {
            toast.success(data.message || 'Busca enviada para fila de processamento.', { id: loadingToast });
            setAgenticResult({
                type: 'success',
                message: data.message || "Busca enviada para fila de processamento."
            });
        } else {
            toast.error(data.message || 'Erro ao iniciar busca.', { id: loadingToast });
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido.";
        toast.error(errorMessage, { id: loadingToast });
        setAgenticResult({
            type: 'error',
            message: errorMessage
        });
    } finally {
        setIsAgenticRunning(false);
    }
  };

  if (loading) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!osc) {
      return <div className="p-8 text-center">OSC não encontrada.</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/directory')} title="Voltar ao Diretório">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            {osc.name}
          </h1>
          <p className="text-muted-foreground font-mono text-sm">CNPJ: {osc.id}</p>
        </div>
      </div>

      {showRadar && activeJob && (
        <ProgressRadar
           job={activeJob}
           onRetry={handleRunAgenticSearch}
           onDismiss={() => setShowRadar(false)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 space-y-6">
            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6">
              <h2 className="text-xl font-bold mb-4">Perfil da Organização</h2>
              <div className="space-y-4">
                  <div>
                      <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Missão / Foco de Atuação</p>
                      <p className="font-medium text-sm leading-relaxed">{osc.mission || 'Não cadastrada'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Localização</p>
                          <p className="font-medium text-sm">{osc.location || 'Não cadastrada'}</p>
                      </div>
                      <div>
                          <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Fundação</p>
                          <p className="font-medium text-sm">{osc.foundationDate || 'Não cadastrada'}</p>
                      </div>
                  </div>
                  <div>
                      <p className="text-sm text-muted-foreground font-semibold uppercase mb-2">Atividades Principais</p>
                      <div className="flex flex-wrap gap-2">
                          {osc.coreActivities?.map((act, idx) => (
                              <span key={idx} className="bg-osc/10 text-osc px-2.5 py-1 rounded-md text-xs font-medium">
                                  {act}
                              </span>
                          ))}
                          {(!osc.coreActivities || osc.coreActivities.length === 0) && (
                              <span className="text-sm text-muted-foreground">Nenhuma atividade listada</span>
                          )}
                      </div>
                  </div>
              </div>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col items-center text-center">
                <Search className="w-12 h-12 text-brand-orange mb-4" />
                <h3 className="font-bold text-lg mb-2">Busca Autônoma (Sniper)</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    A IA criará queries otimizadas baseadas no perfil desta OSC e buscará ativamente editais na web.
                </p>
                <Button
                    onClick={handleRunAgenticSearch}
                    disabled={isAgenticRunning}
                    className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white"
                >
                    {isAgenticRunning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
                    Executar Busca Agêntica
                </Button>

                {agenticResult && (
                  <div className={`mt-4 w-full p-3 rounded-md border text-left flex items-start ${
                    agenticResult.type === 'success'
                      ? 'bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400'
                      : 'bg-destructive/10 border-destructive/50 text-destructive'
                  }`}>
                    {agenticResult.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    )}
                    <p className="text-xs font-medium leading-tight">{agenticResult.message}</p>
                  </div>
                )}
            </div>

            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg">Matches Encontrados</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">Ocultar &lt; 40%</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              id="hideLow"
                              type="checkbox"
                              className="sr-only peer"
                              checked={hideLowScores}
                              onChange={e => setHideLowScores(e.target.checked)}
                            />
                            <div className="w-7 h-4 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                        </label>
                    </div>
                </div>

                {loadingMatches ? (
                    <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : matches.filter(m => !hideLowScores || m.matchScore >= 40).length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground bg-muted/30 rounded-lg">
                        Nenhum match encontrado.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {matches.filter(m => !hideLowScores || m.matchScore >= 40).map(match => {
                            const edital = editais[match.editalId];
                            const isExpanded = expandedMatch === match.id;

                            let scoreColorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
                            if (match.matchScore >= 70) scoreColorClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
                            else if (match.matchScore >= 40) scoreColorClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

                            const matchTime = match.createdAt?.toMillis?.() || (typeof match.createdAt === 'number' ? match.createdAt : 0);
                            const isNew = matchTime > Date.now() - 24 * 60 * 60 * 1000; // 24 hours

                            return (
                                <div key={match.id} className="border rounded-lg overflow-hidden">
                                    <div
                                        className="p-3 bg-card hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                                        onClick={() => setExpandedMatch(isExpanded ? null : (match.id || null))}
                                    >
                                        <div className="flex flex-col flex-1 min-w-0 pr-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm truncate" title={edital?.title || match.editalId}>
                                                    {edital?.title || match.editalId}
                                                </span>
                                                {isNew && (
                                                    <span className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-sm font-bold shrink-0">NOVO</span>
                                                )}
                                            </div>
                                            {match.aiSummary && (
                                                <p className="text-xs text-muted-foreground mt-1 truncate" title={match.aiSummary}>
                                                    {match.aiSummary}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                <div className={`inline-flex items-center gap-1 font-medium px-2 py-0.5 rounded-full text-[10px] ${match.eligibility ? 'bg-emerald-100 text-emerald-800' : 'bg-destructive/10 text-destructive'}`}>
                                                    {match.eligibility ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {match.eligibility ? 'Elegível' : 'Inelegível'}
                                                </div>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${scoreColorClass}`}>
                                                    {match.matchScore}%
                                                </span>
                                                {match.badges && match.badges.slice(0, 2).map((badge, idx) => (
                                                    <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-muted-foreground flex-shrink-0">
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="p-4 bg-muted/20 border-t text-sm">
                                            <h4 className="font-bold mb-2 text-xs flex items-center gap-2">
                                                <FileText className="w-3 h-3" /> Justificativa
                                            </h4>
                                            <p className="text-muted-foreground leading-relaxed mb-4">
                                                {match.reasoning}
                                            </p>

                                            {match.actionPlan && match.actionPlan.length > 0 && (
                                                <div>
                                                    <h4 className="font-bold mb-2 text-xs text-destructive flex items-center gap-2">
                                                        Plano de Ação
                                                    </h4>
                                                    <ul className="space-y-1">
                                                        {match.actionPlan.map((step, idx) => (
                                                            <li key={idx} className="flex gap-2 text-xs items-start bg-destructive/5 p-2 rounded border border-destructive/10 text-foreground/90">
                                                                <span className="font-bold text-destructive shrink-0">{idx + 1}.</span>
                                                                <span>{step.replace(/^\d+\.\s*/, '')}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
