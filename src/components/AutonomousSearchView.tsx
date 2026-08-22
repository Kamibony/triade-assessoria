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
  const [autonomousQuery, setAutonomousQuery] = useState('');
  const [isRunningAutonomous, setIsRunningAutonomous] = useState(false);
  const [autonomousResult, setAutonomousResult] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [searchProgressMessage, setSearchProgressMessage] = useState<string>('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    if (!activeSearchId) return;

    const unsubscribe = onSnapshot(doc(db, 'searches', activeSearchId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'running') {
          setSearchProgressMessage(data.message || t('admin.autonomousSearch.processing'));
        } else if (data.status === 'completed' || data.status === 'error') {
          setAutonomousResult({
            type: data.status === 'success' || data.status === 'completed' ? 'success' : 'error',
            message: data.message || (data.status === 'completed' ? t('admin.autonomousSearch.completed') : t('admin.autonomousSearch.error'))
          });
          setIsRunningAutonomous(false);
          setActiveSearchId(null);
          setSearchProgressMessage('');
        }
      }
    });

    return () => unsubscribe();
  }, [activeSearchId, db, t]);

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
      const runAutonomousSearch = httpsCallable(functions, 'autonomousSearchWorker');
      const result = await runAutonomousSearch({ query: autonomousQuery });
      const data = result.data as { success: boolean; searchId?: string; message?: string };

      if (data.success) {
         if (data.searchId) {
            setActiveSearchId(data.searchId);
            setSearchProgressMessage(t('admin.autonomousSearch.triggerSuccess'));
         } else {
            setAutonomousResult({
              type: 'success',
              message: data.message || t('admin.autonomousSearch.triggerSuccess')
            });
            setIsRunningAutonomous(false);
         }
         setAutonomousQuery('');
      } else {
         setAutonomousResult({
             type: 'error',
             message: data.message || t('admin.autonomousSearch.triggerError')
         });
         setIsRunningAutonomous(false);
      }
    } catch (error: unknown) {
      console.error("Error triggering autonomous search:", error);
      setAutonomousResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.autonomousSearch.internalError')
      });
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

        {activeSearchId && (
          <div className="mt-6 p-4 rounded-md border flex items-center bg-muted/50 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-3 shrink-0" />
            <p className="text-sm font-medium">{searchProgressMessage}</p>
          </div>
        )}
        {!activeSearchId && autonomousResult && (
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
      </div>
    </div>
  );
}
