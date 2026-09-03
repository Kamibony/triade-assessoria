import React, { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Activity, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

interface SystemJob {
  id: string;
  type: string;
  status: 'running' | 'completed' | 'error' | 'dismissed';
  totalOscsFetched: number;
  totalChunks: number;
  chunksProcessed: number;
  validOscsSaved: number;
  createdAt?: any;
}

export function OscImporter() {
  const { t } = useTranslation();
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [activityArea, setActivityArea] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [activeJob, setActiveJob] = useState<SystemJob | null>(null);
  const wasJobRunningRef = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, 'system_jobs'),
      where('type', '==', 'osc_ingestion'),
      where('status', 'in', ['running', 'completed'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemJob));

        // Find a running job first
        let currentJob = jobs.find(j => j.status === 'running');

        // If no running job, find the most recent completed job that hasn't been dismissed
        if (!currentJob) {
          const completedJobs = jobs.filter(j => j.status === 'completed');
          if (completedJobs.length > 0) {
            // Sort by createdAt descending if available
            completedJobs.sort((a, b) => {
              const timeA = a.createdAt?.toMillis?.() || 0;
              const timeB = b.createdAt?.toMillis?.() || 0;
              return timeB - timeA;
            });
            currentJob = completedJobs[0];
          }
        }

        if (currentJob) {
          setActiveJob(currentJob);
          if (currentJob.status === 'running') {
            setIsImporting(true);
            wasJobRunningRef.current = true;
          } else {
            setIsImporting(false);
            if (wasJobRunningRef.current) {
              setImportResult({
                type: 'success',
                message: 'Importação concluída. As OSCs validadas já estão no Diretório.'
              });
              wasJobRunningRef.current = false;
            }
          }
        } else {
          // No running or completed jobs found
          if (wasJobRunningRef.current) {
            setIsImporting(false);
            setImportResult({
              type: 'success',
              message: 'Importação concluída. As OSCs validadas já estão no Diretório.'
            });
            wasJobRunningRef.current = false;
          }
          setActiveJob(null);
        }
      } else {
        if (wasJobRunningRef.current) {
          // If we had a job and now we don't, it means it completed
          setIsImporting(false);
          setImportResult({
            type: 'success',
            message: 'Importação concluída. As OSCs validadas já estão no Diretório.'
          });
          wasJobRunningRef.current = false;
        }
        setActiveJob(null);
      }
    }, (error) => {
      console.error("Error listening to system jobs:", error);
    });

    return () => unsubscribe();
  }, []);

  const handleImportOsc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uf.trim() && !municipio.trim()) {
      toast.error('Por favor, forneça pelo menos Estado (UF) ou Cidade.');
      setImportResult({ type: 'error', message: 'Por favor, forneça pelo menos Estado (UF) ou Cidade.' });
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    const loadingToast = toast.loading('Acionando importação...');

    try {
      const ingestOscData = httpsCallable(functions, 'ingestOscDataFunction');
      await ingestOscData({
        uf: uf.trim() || undefined,
        municipio: municipio.trim() || undefined,
        activityArea: activityArea || undefined,
        aiPrompt: aiPrompt.trim() || undefined,
        onlyActive: onlyActive
      });

      toast.success('Importação iniciada em segundo plano.', { id: loadingToast });
      setImportResult({
        type: 'success',
        message: 'Importação iniciada em segundo plano. As OSCs ativas e validadas aparecerão no Diretório em breve.'
      });
    } catch (error: unknown) {
      console.error("Error triggering OSC import:", error);
      toast.error('Falha ao acionar a importação.', { id: loadingToast });
      setImportResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || t('admin.bulkImporter.triggerError')
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('admin.bulkImporter.title')}</h1>
        <p className="text-muted-foreground">{t('admin.bulkImporter.description')}</p>
      </div>

      <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col">
        <form onSubmit={handleImportOsc} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="uf" className="block text-sm font-medium">{t('admin.bulkImporter.stateLabel')}</label>
              <select
                id="uf"
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('admin.bulkImporter.allStates')}</option>
                <option value="AC">Acre</option>
                <option value="AL">Alagoas</option>
                <option value="AP">Amapá</option>
                <option value="AM">Amazonas</option>
                <option value="BA">Bahia</option>
                <option value="CE">Ceará</option>
                <option value="DF">Distrito Federal</option>
                <option value="ES">Espírito Santo</option>
                <option value="GO">Goiás</option>
                <option value="MA">Maranhão</option>
                <option value="MT">Mato Grosso</option>
                <option value="MS">Mato Grosso do Sul</option>
                <option value="MG">Minas Gerais</option>
                <option value="PA">Pará</option>
                <option value="PB">Paraíba</option>
                <option value="PR">Paraná</option>
                <option value="PE">Pernambuco</option>
                <option value="PI">Piauí</option>
                <option value="RJ">Rio de Janeiro</option>
                <option value="RN">Rio Grande do Norte</option>
                <option value="RS">Rio Grande do Sul</option>
                <option value="RO">Rondônia</option>
                <option value="RR">Roraima</option>
                <option value="SC">Santa Catarina</option>
                <option value="SP">São Paulo</option>
                <option value="SE">Sergipe</option>
                <option value="TO">Tocantins</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="municipio" className="block text-sm font-medium">{t('admin.bulkImporter.cityLabel')}</label>
              <input
                id="municipio"
                type="text"
                value={municipio}
                onChange={(e) => setMunicipio(e.target.value)}
                placeholder={t('admin.bulkImporter.cityPlaceholder')}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="aiPrompt" className="block text-sm font-medium">Descreva o perfil da OSC que você procura (Opcional - Busca IA)</label>
            <textarea
              id="aiPrompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder='ex: "Encontre ONGs ajudando mulheres indígenas, quilombolas, ou trabalhando na agricultura"'
              rows={3}
              className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="activityArea" className="block text-sm font-medium">Área de Atuação (Filtro)</label>
              <select
                id="activityArea"
                value={activityArea}
                onChange={(e) => setActivityArea(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todas as Áreas</option>
                <option value="Saúde">Saúde</option>
                <option value="Educação">Educação</option>
                <option value="Cultura">Cultura</option>
                <option value="Meio Ambiente">Meio Ambiente</option>
                <option value="Assistência Social">Assistência Social</option>
                <option value="Esporte">Esporte</option>
                <option value="Direitos Humanos">Direitos Humanos</option>
              </select>
            </div>

            <div className="space-y-2 flex flex-col justify-center pt-6">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium">Importar apenas OSCs Ativas</span>
              </label>
            </div>
          </div>

          <div className="bg-muted/50 p-4 rounded-md border">
            <p className="text-sm text-muted-foreground flex items-center">
              <AlertCircle className="w-4 h-4 mr-2 text-primary" />
              {t('admin.bulkImporter.note')}
            </p>
          </div>

          <Button type="submit" disabled={isImporting} className="w-full py-6 text-lg">
            {isImporting && !activeJob ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <RefreshCw className="w-5 h-5 mr-2" />}
            {t('admin.bulkImporter.button')}
          </Button>
        </form>

        {activeJob && (
          <div className={`mt-8 p-6 rounded-lg border shadow-sm ${activeJob.status === 'completed' ? 'bg-green-500/5 border-green-500/20' : 'bg-card text-card-foreground'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center">
                {activeJob.status === 'completed' ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2 text-green-500" />
                    Resumo da Importação
                  </>
                ) : (
                  <>
                    <Activity className="w-5 h-5 mr-2 text-primary animate-pulse" />
                    Importação em Andamento
                  </>
                )}
              </h3>
              {activeJob.status === 'completed' ? (
                <button
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'system_jobs', activeJob.id), { status: 'dismissed' });
                      setActiveJob(null);
                    } catch (error) {
                      console.error("Failed to dismiss job", error);
                    }
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  title="Fechar resumo"
                >
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
                  {Math.round((activeJob.chunksProcessed / activeJob.totalChunks) * 100)}%
                </span>
              )}
            </div>

            <div className="space-y-4">
              {activeJob.status !== 'completed' && (
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (activeJob.chunksProcessed / Math.max(1, activeJob.totalChunks)) * 100)}%` }}
                  ></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">OSCs Descobertas</p>
                  <p className="text-xl font-bold">{activeJob.totalOscsFetched.toLocaleString()}</p>
                </div>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-muted-foreground mb-1">OSCs Salvas (Válidas)</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{activeJob.validOscsSaved.toLocaleString()}</p>
                </div>

                {activeJob.status === 'completed' && (
                  <div className="bg-muted p-3 rounded-md col-span-2 flex justify-between items-center">
                     <p className="text-muted-foreground">Taxa de Sucesso (Validadas / Descobertas)</p>
                     <p className="font-semibold text-primary">
                       {activeJob.totalOscsFetched > 0 ? Math.round((activeJob.validOscsSaved / activeJob.totalOscsFetched) * 100) : 0}%
                     </p>
                  </div>
                )}

                <div className="bg-muted p-3 rounded-md col-span-2 flex justify-between items-center">
                  <p className="text-muted-foreground">Lotes Processados (Chunks)</p>
                  <p className="font-semibold">{activeJob.chunksProcessed} de {activeJob.totalChunks}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {importResult && !activeJob && (
          <div className={`mt-6 p-4 rounded-md border flex items-start ${
            importResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
              : 'bg-destructive/10 border-destructive/50 text-destructive'
          }`}>
            {importResult.type === 'success' ? (
              <CheckCircle2 className="w-6 h-6 mr-3 shrink-0" />
            ) : (
              <AlertCircle className="w-6 h-6 mr-3 shrink-0" />
            )}
            <div className="flex-1">
              <h4 className="font-semibold">{importResult.type === 'success' ? 'Sucesso' : 'Erro'}</h4>
              <p className="text-sm mt-1">{importResult.message}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
