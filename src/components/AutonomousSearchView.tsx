import React, { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, Search, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function AutonomousSearchView() {
  const { t } = useTranslation();
  const db = getFirestore();

  // Autonomous Edital Search State
  const [autonomousQuery, setAutonomousQuery] = useState(() => sessionStorage.getItem('autonomousQuery') || '');
  const [isRunningAutonomous, setIsRunningAutonomous] = useState(false);
  const [autonomousResult, setAutonomousResult] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(() => sessionStorage.getItem('activeSearchId') || null);

  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [searchLogs, setSearchLogs] = useState<Array<{link: string, status: string, reason: string}>>([]);
  const [searchProgress, setSearchProgress] = useState<{totalTargets: number, completedTargets: number, processedCount: number, savedCount: number} | null>(null);

  useEffect(() => {
    sessionStorage.setItem('autonomousQuery', autonomousQuery);
  }, [autonomousQuery]);

  useEffect(() => {
    if (activeSearchId) {
      sessionStorage.setItem('activeSearchId', activeSearchId);
    } else {
      sessionStorage.removeItem('activeSearchId');
    }
  }, [activeSearchId]);

  useEffect(() => {
    if (!activeSearchId) return;

    const unsubscribe = onSnapshot(doc(db, 'searches', activeSearchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.logs) setSearchLogs(data.logs);
        if (data.totalTargets !== undefined) {
          setSearchProgress({
            totalTargets: data.totalTargets,
            completedTargets: data.completedTargets || 0,
            processedCount: data.processedCount || 0,
            savedCount: data.savedCount || 0
          });
        }
      }
    });

    return () => unsubscribe();
  }, [activeSearchId, db]);

  const handleSeedTargets = async () => {
    setIsSeeding(true);
    setSeedResult(null);
    try {
      const seedScrapingTargets = httpsCallable(functions, 'seedScrapingTargets');
      const result = await seedScrapingTargets();
      const data = result.data as { success: boolean; message: string };
      if (data.success) {
        setSeedResult({ type: 'success', message: data.message });
      } else {
        setSeedResult({ type: 'error', message: data.message });
      }
    } catch (error: unknown) {
      console.error("Error seeding targets:", error);
      setSeedResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleRunAutonomousSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!autonomousQuery.trim()) return;

    setIsRunningAutonomous(true);
    setAutonomousResult(null);

    try {
      setSearchLogs([]);
      setSearchProgress(null);
      const runAutonomousSearch = httpsCallable(functions, 'autonomousSearchWorker');
      const result = await runAutonomousSearch({ query: autonomousQuery });
      const data = result.data as { success: boolean; searchId?: string; message?: string };

      if (data.success) {
         if (data.searchId) {
            setActiveSearchId(data.searchId);
         }
         setAutonomousResult({
           type: 'success',
           message: "Agente Autônomo enviado para execução em segundo plano."
         });
      } else {
         setAutonomousResult({
             type: 'error',
             message: data.message || t('admin.autonomousSearch.triggerError')
         });
      }
    } catch (error: unknown) {
      console.error("Error triggering autonomous search:", error);
      setAutonomousResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.autonomousSearch.internalError')
      });
    } finally {
      setIsRunningAutonomous(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('admin.autonomousSearch.title')}</h1>
          <p className="text-muted-foreground">{t('admin.autonomousSearch.description')}</p>
        </div>
        <Button variant="outline" onClick={handleSeedTargets} disabled={isSeeding}>
          {isSeeding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
          Seed Target Sources
        </Button>
      </div>

      {seedResult && (
        <div className={`mb-6 p-4 rounded-md border flex items-start ${
          seedResult.type === 'success'
            ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
            : 'bg-destructive/10 border-destructive/50 text-destructive'
        }`}>
          {seedResult.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
          )}
          <p className="text-sm font-medium">{seedResult.message}</p>
        </div>
      )}

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col">
        <form onSubmit={handleRunAutonomousSearch} className="space-y-4">
          <div>
            <label htmlFor="autonomousQuery" className="block text-sm font-medium mb-2">{t('admin.autonomousSearch.queryLabel')}</label>
            <input
              id="autonomousQuery"
              type="text"
              required
              value={autonomousQuery}
              onChange={(e) => setAutonomousQuery(e.target.value)}
              placeholder={t('admin.autonomousSearch.queryPlaceholder')}
              className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button type="submit" disabled={isRunningAutonomous} className="w-full py-6 text-lg">
            {isRunningAutonomous ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
            {t('admin.autonomousSearch.button')}
          </Button>
        </form>

        {autonomousResult && (
          <div className={`mt-6 p-4 rounded-md border flex items-start ${
            autonomousResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }`}>
            {autonomousResult.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            )}
            <p className="text-sm font-medium">{autonomousResult.message}</p>
          </div>
        )}

        {searchProgress && (
          <div className="mt-6 border rounded-lg overflow-hidden p-4">
            <div className="flex justify-between text-sm mb-2 font-medium">
              <span>Progresso (Fontes processadas)</span>
              <span>{searchProgress.completedTargets} / {searchProgress.totalTargets}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 mb-4">
              <div
                className="bg-primary h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, searchProgress.totalTargets ? (searchProgress.completedTargets / searchProgress.totalTargets) * 100 : 0))}%` }}
              ></div>
            </div>

            {searchProgress.completedTargets >= searchProgress.totalTargets && searchProgress.totalTargets > 0 && (
              <div className="mt-4 p-4 rounded-md border bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400 flex flex-col items-center justify-center">
                <CheckCircle2 className="w-8 h-8 mb-2" />
                <p className="font-bold text-lg">Busca Finalizada!</p>
                <p className="text-sm">Processados {searchProgress.processedCount} links.</p>
                <p className="text-sm">Importados {searchProgress.savedCount} editais.</p>
              </div>
            )}
          </div>
        )}

        {searchLogs.length > 0 && (
          <div className="mt-6 border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">Transparência da Triagem ({searchLogs.length} links processados)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/30 uppercase border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Link</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Motivo (IA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {searchLogs.map((log, index) => (
                    <tr key={index} className="hover:bg-muted/10">
                      <td className="px-4 py-3">
                        <div className="max-w-[200px] truncate" title={log.link}>
                          <a href={log.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {log.link}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${log.status === 'Importado' ? 'bg-green-100 text-green-800' :
                            log.status === 'Rejeitado' ? 'bg-orange-100 text-orange-800' :
                            log.status === 'Erro' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs leading-relaxed max-w-md">
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
