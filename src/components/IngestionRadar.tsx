import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Activity, Play, CheckCircle2, XCircle, Clock, Database, Globe, Rss } from 'lucide-react';
// Assuming a custom Button component isn't available at that path, let's use standard HTML button styled like other components or a more likely path
import toast from 'react-hot-toast';

export function IngestionRadar() {
  const [runs, setRuns] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const db = getFirestore();
  const functions = getFunctions();

  useEffect(() => {
    const q = query(
      collection(db, 'ingestion_runs'),
      orderBy('startTime', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const runsData = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      setRuns(runsData);

      const activeRun = runsData.find((run: any) => run.status === 'RUNNING');
      setIsRunning(!!activeRun);
    });

    return () => unsubscribe();
  }, [db]);

  const handleForceRun = async () => {
    if (isRunning) return;

    setIsRunning(true);
    const toastId = toast.loading('Iniciando sincronização global...');

    try {
      const triggerGlobalIngestion = httpsCallable(functions, 'triggerGlobalIngestion');
      await triggerGlobalIngestion();
      toast.success('Sincronização global iniciada em background!', { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao iniciar sincronização: ${error.message}`, { id: toastId });
      setIsRunning(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'RUNNING':
        return <span className="flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full dark:bg-blue-900/30 dark:text-blue-300"><Activity className="w-3 h-3 mr-1 animate-pulse" /> Em Execução</span>;
      case 'COMPLETED':
        return <span className="flex items-center px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full dark:bg-green-900/30 dark:text-green-300"><CheckCircle2 className="w-3 h-3 mr-1" /> Concluído</span>;
      case 'FAILED':
        return <span className="flex items-center px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full dark:bg-red-900/30 dark:text-red-300"><XCircle className="w-3 h-3 mr-1" /> Falhou</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full dark:bg-gray-800 dark:text-gray-300">{status}</span>;
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            Radar de Ingestão (Global)
          </h1>
          <p className="text-muted-foreground mt-1">Monitore e controle a esteira unificada de descoberta de editais (Prosas, Fontes Internas e RSS).</p>
        </div>

        <button onClick={handleForceRun} disabled={isRunning} className="flex items-center justify-center px-4 py-2 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-md font-medium text-sm transition-colors">
          {isRunning ? <Activity className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Forçar Sincronização Global
        </button>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-medium">ID / Data</th>
                <th className="px-6 py-4 font-medium">Gatilho</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-center">URLs Analisadas</th>
                <th className="px-6 py-4 font-medium text-center text-green-600">Novos Editais (Fila)</th>
                <th className="px-6 py-4 font-medium">Erros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{run.startTime?.toDate ? run.startTime.toDate().toLocaleString() : 'Iniciando...'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-secondary text-secondary-foreground">
                      {run.triggerSource}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(run.status)}
                  </td>
                  <td className="px-6 py-4 text-center font-semibold">
                    {run.totalUrlsScanned || 0}
                  </td>
                  <td className="px-6 py-4 text-center font-bold text-green-600 dark:text-green-400">
                     {(run.phases?.prosas?.newEditaisEnqueued || 0) + (run.phases?.internalFontes?.newEditaisEnqueued || 0) + (run.phases?.rssAndQueries?.newEditaisEnqueued || 0)}
                  </td>
                  <td className="px-6 py-4">
                    {run.status === 'FAILED' || (run.phases?.internalFontes?.errors?.length > 0) ? (
                       <span className="text-red-500 font-medium">{run.phases?.internalFontes?.errors?.length || 1} Erros</span>
                    ) : (
                       <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}

              {runs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    Nenhuma execução registrada no radar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail View of Latest Run if Running */}
      {runs.length > 0 && runs[0].status === 'RUNNING' && (
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card border rounded-lg p-6 space-y-4">
               <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><Globe className="w-5 h-5 text-blue-500"/> Prosas Crawler</h3>
                  {getStatusBadge(runs[0].phases?.prosas?.status || 'PENDING')}
               </div>
               <div className="space-y-1 text-sm">
                  <p className="flex justify-between"><span>Páginas:</span> <strong>{runs[0].phases?.prosas?.pagesScanned || 0}</strong></p>
                  <p className="flex justify-between"><span>URLs:</span> <strong>{runs[0].phases?.prosas?.urlsDiscovered || 0}</strong></p>
               </div>
            </div>

            <div className="bg-card border rounded-lg p-6 space-y-4">
               <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><Database className="w-5 h-5 text-purple-500"/> Fontes Internas</h3>
                  {getStatusBadge(runs[0].phases?.internalFontes?.status || 'PENDING')}
               </div>
               <div className="space-y-1 text-sm">
                  <p className="flex justify-between"><span>Targets:</span> <strong>{runs[0].phases?.internalFontes?.targetsProcessed || 0}</strong></p>
                  <p className="flex justify-between"><span>URLs:</span> <strong>{runs[0].phases?.internalFontes?.urlsDiscovered || 0}</strong></p>
               </div>
            </div>

            <div className="bg-card border rounded-lg p-6 space-y-4">
               <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2"><Rss className="w-5 h-5 text-orange-500"/> RSS & AI Queries</h3>
                  {getStatusBadge(runs[0].phases?.rssAndQueries?.status || 'PENDING')}
               </div>
               <div className="space-y-1 text-sm">
                  <p className="flex justify-between"><span>Feeds/Queries:</span> <strong>{runs[0].phases?.rssAndQueries?.feedsProcessed || 0}</strong></p>
                  <p className="flex justify-between"><span>URLs:</span> <strong>{runs[0].phases?.rssAndQueries?.urlsDiscovered || 0}</strong></p>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
