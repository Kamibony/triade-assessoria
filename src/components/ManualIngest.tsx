import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function ManualIngest() {
  const { t } = useTranslation();
  const [manualUrl, setManualUrl] = useState('');
  const [isIngestingManual, setIsIngestingManual] = useState(false);
  const [manualIngestResult, setManualIngestResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const handleManualIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;

    setIsIngestingManual(true);
    setManualIngestResult(null);

    try {
      const ingestManualEdital = httpsCallable(functions, 'ingestManualEditalFunction');
      const result = await ingestManualEdital({ url: manualUrl });

      const data = result.data as { success: boolean; editalId?: string; message?: string };

      if (data.success) {
        setManualIngestResult({
          type: 'success',
          message: t('admin.manualIngest.success', { id: data.editalId })
        });
      } else {
        setManualIngestResult({
          type: 'error',
          message: data.message || t('admin.manualIngest.error')
        });
      }
    } catch (error: unknown) {
      console.error("Error ingesting manual edital:", error);
      setManualIngestResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.manualIngest.internalError')
      });
    } finally {
      setIsIngestingManual(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('admin.manualIngest.title')}</h1>
        <p className="text-muted-foreground">{t('admin.manualIngest.description')}</p>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col">
        <form onSubmit={handleManualIngest} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="manualUrl" className="block text-sm font-medium">{t('admin.manualIngest.urlLabel')}</label>
            <input
              id="manualUrl"
              type="url"
              required
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://prosas.com.br/editais/..."
              className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button type="submit" disabled={isIngestingManual} className="w-full py-6 text-lg">
            {isIngestingManual ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <RefreshCw className="w-5 h-5 mr-2" />}
            {t('admin.manualIngest.button')}
          </Button>
        </form>

        {manualIngestResult && (
          <div className={`mt-6 p-4 rounded-md border flex items-start ${
            manualIngestResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }`}>
            {manualIngestResult.type === 'success' ? (
              <CheckCircle2 className="w-6 h-6 mr-3 shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 mr-3 shrink-0" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold">{manualIngestResult.type === 'success' ? 'Sucesso' : 'Erro'}</h4>
              <p className="text-sm mt-1">{manualIngestResult.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
