import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

export function OscImporter() {
  const { t } = useTranslation();
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [activityArea, setActivityArea] = useState('');
  const [keywords, setKeywords] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

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
        keywords: keywords.trim() || undefined,
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
            <label htmlFor="keywords" className="block text-sm font-medium">Palavras-chave (Opcional)</label>
            <input
              id="keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ex: quilombolas, mulheres, agricultura (separado por vírgulas)"
              className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {isImporting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <RefreshCw className="w-5 h-5 mr-2" />}
            {t('admin.bulkImporter.button')}
          </Button>
        </form>

        {importResult && (
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
