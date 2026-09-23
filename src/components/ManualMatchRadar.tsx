import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Activity, CheckCircle2, AlertCircle, RefreshCw, BarChart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ManualMatchJob {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'error' | 'dismissed';
  totalEditais: number;
  editaisProcessed: number;
  matchesTriggered: number;
  matchesEvaluated: number;
  searchCompleted?: boolean;
  evaluationsCompleted?: boolean;
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface MatchSummary {
  otimo: number;
  bom: number;
  foraDoPerfil: number;
  total: number;
}

export function ManualMatchRadar({ onComplete }: { onComplete?: () => void }) {
  const [activeJob, setActiveJob] = useState<ManualMatchJob | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'system_jobs'),
      where('type', '==', 'manual_edital_matches'),
      where('status', 'in', ['running', 'completed', 'error'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ManualMatchJob));

        // Find a running job first
        let currentJob = jobs.find(j => j.status === 'running');

        // If no running job, find a completed or error job
        if (!currentJob) {
          const finishedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'error');
          // Sort by latest if multiple
          finishedJobs.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
          if (finishedJobs.length > 0) {
            currentJob = finishedJobs[0];
          }
        }

        setActiveJob(currentJob || null);
      } else {
        setActiveJob(null);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeJob && activeJob.status === 'completed' && activeJob.evaluationsCompleted && !summary) {
      fetchSummary(activeJob.id);
    } else if (!activeJob || activeJob.status === 'running') {
      setSummary(null);
    }
  }, [activeJob]);

  const fetchSummary = async (jobId: string) => {
    setLoadingSummary(true);
    try {
      const q = query(collection(db, 'matches'), where('jobId', '==', jobId));
      const snapshot = await getDocs(q);

      const newSummary: MatchSummary = { otimo: 0, bom: 0, foraDoPerfil: 0, total: snapshot.docs.length };

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const score = data.matchScore || 0;
        if (score >= 80) newSummary.otimo++;
        else if (score >= 50) newSummary.bom++;
        else newSummary.foraDoPerfil++;
      });

      setSummary(newSummary);
    } catch (error) {
      console.error("Failed to fetch match summary:", error);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleDismiss = async () => {
    if (!activeJob) return;
    try {
      await updateDoc(doc(db, 'system_jobs', activeJob.id), { status: 'dismissed' });
      setActiveJob(null);
      if (onComplete) onComplete();
    } catch (error) {
      console.error("Failed to dismiss job", error);
    }
  };

  if (!activeJob) return null;

  const searchProgress = Math.min(100, Math.round((activeJob.editaisProcessed / Math.max(1, activeJob.totalEditais)) * 100));
  const evalProgress = activeJob.matchesTriggered > 0 ? Math.min(100, Math.round(((activeJob.matchesEvaluated || 0) / activeJob.matchesTriggered) * 100)) : (activeJob.searchCompleted ? 100 : 0);
  const totalProgress = activeJob.searchCompleted ? (50 + (evalProgress / 2)) : (searchProgress / 2);

  const durationStr = activeJob.status === 'completed' && activeJob.createdAt && activeJob.updatedAt
    ? formatDistanceToNow(activeJob.createdAt.toDate(), { locale: ptBR })
    : null;

  return (
    <div className={`mt-8 p-6 rounded-lg border shadow-sm ${activeJob.status === 'completed' ? 'bg-emerald-50/50 border-emerald-200' : activeJob.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-card text-card-foreground'}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center">
          {activeJob.status === 'completed' ? (
            <>
              <CheckCircle2 className="w-6 h-6 mr-3 text-emerald-600" />
              <span className="text-emerald-900">Geração de Matches Concluída</span>
            </>
          ) : activeJob.status === 'error' ? (
            <>
              <AlertCircle className="w-6 h-6 mr-3 text-red-600" />
              <span className="text-red-900">Erro na Geração de Matches</span>
            </>
          ) : (
            <>
              <Activity className="w-6 h-6 mr-3 text-primary animate-pulse" />
              Processando Matches em Segundo Plano...
            </>
          )}
        </h3>

        {activeJob.status === 'running' && (
          <span className="text-sm font-bold bg-primary/10 text-primary px-4 py-1.5 rounded-full border border-primary/20">
            {Math.round(totalProgress)}%
          </span>
        )}
      </div>

      {activeJob.status === 'running' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">1. Buscando OSCs (Vector Search)</span>
              <span className="font-semibold">{activeJob.editaisProcessed} / {activeJob.totalEditais} Editais</span>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${searchProgress}%` }}
              ></div>
            </div>
          </div>

          <div className={`space-y-2 transition-opacity duration-500 ${activeJob.searchCompleted || activeJob.matchesTriggered > 0 ? 'opacity-100' : 'opacity-40'}`}>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground font-medium">2. Avaliando Perfil (IA Generativa)</span>
              <span className="font-semibold">{activeJob.matchesEvaluated || 0} / {activeJob.matchesTriggered} Matches</span>
            </div>
            <div className="w-full bg-secondary/50 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${evalProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {activeJob.status === 'completed' && summary && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center text-center">
                 <p className="text-sm text-muted-foreground mb-1 font-medium">Total Analisado</p>
                 <p className="text-3xl font-bold text-slate-800">{summary.total}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex flex-col items-center justify-center text-center">
                 <p className="text-sm text-emerald-700 mb-1 font-medium">Ótimo (≥80%)</p>
                 <p className="text-3xl font-bold text-emerald-600">{summary.otimo}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex flex-col items-center justify-center text-center">
                 <p className="text-sm text-amber-700 mb-1 font-medium">Bom (50-79%)</p>
                 <p className="text-3xl font-bold text-amber-500">{summary.bom}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex flex-col items-center justify-center text-center">
                 <p className="text-sm text-red-700 mb-1 font-medium">Fora do Perfil</p>
                 <p className="text-3xl font-bold text-red-500">{summary.foraDoPerfil}</p>
              </div>
           </div>

           <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border">
              <div className="flex items-center text-sm text-muted-foreground">
                 <BarChart className="w-4 h-4 mr-2" />
                 {durationStr ? `Processamento durou aprox. ${durationStr}` : 'Processamento concluído'}
              </div>

              <button
                onClick={handleDismiss}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Ver Resultados
              </button>
           </div>
        </div>
      )}

      {activeJob.status === 'completed' && !summary && loadingSummary && (
         <div className="animate-in fade-in duration-500">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center text-center space-y-2">
                 <div className="h-4 bg-muted/50 rounded w-24 animate-pulse"></div>
                 <div className="h-8 bg-muted/50 rounded w-16 animate-pulse"></div>
              </div>
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col items-center justify-center text-center space-y-2">
                 <div className="h-4 bg-emerald-100 rounded w-24 animate-pulse"></div>
                 <div className="h-8 bg-emerald-100 rounded w-16 animate-pulse"></div>
              </div>
              <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex flex-col items-center justify-center text-center space-y-2">
                 <div className="h-4 bg-amber-100 rounded w-24 animate-pulse"></div>
                 <div className="h-8 bg-amber-100 rounded w-16 animate-pulse"></div>
              </div>
              <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 flex flex-col items-center justify-center text-center space-y-2">
                 <div className="h-4 bg-red-100 rounded w-24 animate-pulse"></div>
                 <div className="h-8 bg-red-100 rounded w-16 animate-pulse"></div>
              </div>
           </div>

           <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border opacity-50 pointer-events-none">
              <div className="flex items-center text-sm text-muted-foreground">
                 <BarChart className="w-4 h-4 mr-2" />
                 Carregando sumário...
              </div>

              <div className="w-full sm:w-auto h-10 bg-muted/50 rounded-lg w-32 animate-pulse"></div>
           </div>
         </div>
      )}

      {activeJob.error && (
        <div className="bg-red-50 p-4 rounded-xl border border-red-200 mt-4">
           <p className="text-red-700 font-medium">Erro: {activeJob.error}</p>
           <button onClick={handleDismiss} className="mt-3 text-sm text-red-600 underline hover:text-red-800">
             Dispensar
           </button>
        </div>
      )}
    </div>
  );
}
