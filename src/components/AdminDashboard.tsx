import React, { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, onSnapshot, query, updateDoc, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, Plus, RefreshCw, Power, CheckCircle2, AlertCircle } from 'lucide-react';
import { TriadeCopilot } from './TriadeCopilot';

interface RssSource {
  id: string;
  url: string;
  keywords: string;
  isActive: boolean;
}

export function AdminDashboard() {
  // RSS State
  const [rssSources, setRssSources] = useState<RssSource[]>([]);
  const [rssUrl, setRssUrl] = useState('');
  const [rssKeywords, setRssKeywords] = useState('');
  const [isAddingRss, setIsAddingRss] = useState(false);
  const [rssLoading, setRssLoading] = useState(true);
  const [isSyncingRss, setIsSyncingRss] = useState(false);
  const [syncResult, setSyncResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // OSC Importer State
  const [uf, setUf] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Manual Edital Ingestion State
  const [manualUrl, setManualUrl] = useState('');
  const [isIngestingManual, setIsIngestingManual] = useState(false);
  const [manualIngestResult, setManualIngestResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'ingestion' | 'directory'>('ingestion');

  const db = getFirestore();

  useEffect(() => {
    const q = query(collection(db, 'rss_sources'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sources: RssSource[] = [];
      snapshot.forEach((doc) => {
        sources.push({ id: doc.id, ...doc.data() } as RssSource);
      });
      setRssSources(sources);
      setRssLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  const handleAddRss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rssUrl.trim()) return;

    setIsAddingRss(true);
    try {
      await addDoc(collection(db, 'rss_sources'), {
        url: rssUrl,
        keywords: rssKeywords,
        isActive: true,
      });
      setRssUrl('');
      setRssKeywords('');
    } catch (error) {
      console.error("Error adding RSS source:", error);
      alert("Failed to add RSS source.");
    } finally {
      setIsAddingRss(false);
    }
  };

  const toggleRssActive = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'rss_sources', id), {
        isActive: !currentStatus
      });
    } catch (error) {
      console.error("Error toggling RSS status:", error);
      alert("Failed to update status.");
    }
  };

  const handleForceSyncRss = async () => {
    setIsSyncingRss(true);
    setSyncResult(null);

    try {
      const manualTriggerRssSync = httpsCallable(functions, 'manualTriggerRssSyncFunction');
      const result = await manualTriggerRssSync();

      const data = result.data as { processedCount?: number; savedCount?: number };
      setSyncResult({
        type: 'success',
        message: `Sync completed successfully. Processed ${data.processedCount || 0} links, saved ${data.savedCount || 0} editais.`
      });
    } catch (error: unknown) {
      console.error("Error forcing RSS sync:", error);
      setSyncResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || 'Failed to sync RSS.'
      });
    } finally {
      setIsSyncingRss(false);
    }
  };

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
          message: `Edital ingested successfully! ID: ${data.editalId}`
        });
        setManualUrl('');
      } else {
        setManualIngestResult({
          type: 'error',
          message: data.message || 'Failed to ingest edital.'
        });
      }
    } catch (error: unknown) {
      console.error("Error ingesting manual edital:", error);
      setManualIngestResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || 'Internal error during manual ingestion.'
      });
    } finally {
      setIsIngestingManual(false);
    }
  };

  const handleImportOsc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uf.trim() && !municipio.trim()) {
      setImportResult({ type: 'error', message: 'Please provide at least UF or Municipio.' });
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const ingestOscData = httpsCallable(functions, 'ingestOscDataFunction');
      const result = await ingestOscData({
        uf: uf.trim() || undefined,
        municipio: municipio.trim() || undefined,
        limit: 50
      });

      const data = result.data as { processedCount?: number };
      setImportResult({
        type: 'success',
        message: `Import triggered successfully. ${data.processedCount !== undefined ? `Processed ${data.processedCount} organizations.` : 'Check backend logs for progress.'}`
      });

      setUf('');
      setMunicipio('');
    } catch (error: unknown) {
      console.error("Error triggering OSC import:", error);
      setImportResult({
        type: 'error',
        message: error instanceof Error ? error.message : String(error) || 'Failed to trigger import. Check console for details.'
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex bg-muted/50 p-1 rounded-lg border">
          <button
            onClick={() => setActiveTab('ingestion')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'ingestion' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Ingestão & Pipelines
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'directory' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="w-4 h-4" />
            Diretório OSC
          </button>
        </div>
      </div>

      {activeTab === 'directory' ? (
        <OscDirectoryView />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* RSS Source Management Panel */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col h-[600px]">
          <h2 className="text-xl font-semibold mb-4">RSS Source Management</h2>
          <p className="text-muted-foreground text-sm mb-6">Manage RSS feeds used for edital discovery.</p>

          <form onSubmit={handleAddRss} className="space-y-4 mb-6">
            <div>
              <label htmlFor="rssUrl" className="block text-sm font-medium mb-1">RSS URL</label>
              <input
                id="rssUrl"
                type="url"
                required
                value={rssUrl}
                onChange={(e) => setRssUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor="rssKeywords" className="block text-sm font-medium mb-1">Keywords (optional)</label>
              <input
                id="rssKeywords"
                type="text"
                value={rssKeywords}
                onChange={(e) => setRssKeywords(e.target.value)}
                placeholder="cultura, esporte, educação"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button type="submit" disabled={isAddingRss} className="w-full">
              {isAddingRss ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add RSS Source
            </Button>
          </form>

          <div className="flex-grow overflow-auto border rounded-md">
            {rssLoading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : rssSources.length === 0 ? (
              <div className="flex justify-center items-center h-full text-muted-foreground text-sm">
                No RSS sources added yet.
              </div>
            ) : (
              <ul className="divide-y">
                {rssSources.map((source) => (
                  <li key={source.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-medium truncate" title={source.url}>{source.url}</p>
                      {source.keywords && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">Keywords: {source.keywords}</p>
                      )}
                    </div>
                    <Button
                      variant={source.isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleRssActive(source.id, source.isActive)}
                      className="shrink-0"
                    >
                      <Power className="w-4 h-4 mr-2" />
                      {source.isActive ? 'Active' : 'Inactive'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6 border-t pt-4">
            <Button
              variant="outline"
              onClick={handleForceSyncRss}
              disabled={isSyncingRss}
              className="w-full"
            >
              {isSyncingRss ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Force Sync RSS
            </Button>
            {syncResult && (
              <div className={`mt-4 p-3 rounded-md border flex items-start ${
                syncResult.type === 'success'
                  ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
                  : 'bg-destructive/10 border-destructive/50 text-destructive'
              }`}>
                {syncResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                )}
                <p className="text-xs">{syncResult.message}</p>
              </div>
            )}
          </div>
        </div>

        {/* Manual Edital Ingestion Panel */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col h-[600px]">
          <h2 className="text-xl font-semibold mb-4">Manual Edital Ingestion</h2>
          <p className="text-muted-foreground text-sm mb-6">Directly ingest an edital from a URL (e.g. Prosas).</p>

          <form onSubmit={handleManualIngest} className="space-y-4">
            <div>
              <label htmlFor="manualUrl" className="block text-sm font-medium mb-1">Edital URL</label>
              <input
                id="manualUrl"
                type="url"
                required
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://prosas.com.br/editais/..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <Button type="submit" disabled={isIngestingManual} className="w-full">
              {isIngestingManual ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Fetch & Ingest
            </Button>
          </form>

          {manualIngestResult && (
            <div className={`mt-6 p-4 rounded-md border flex items-start ${
              manualIngestResult.type === 'success'
                ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 border-destructive/50 text-destructive'
            }`}>
              {manualIngestResult.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
              )}
              <p className="text-sm">{manualIngestResult.message}</p>
            </div>
          )}
        </div>

        {/* OSC Bulk Importer Panel */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col">
          <h2 className="text-xl font-semibold mb-4">OSC Bulk Importer</h2>
          <p className="text-muted-foreground text-sm mb-6">Trigger the hybrid ingestion pipeline to discover and enrich NGO data from IPEA and BrasilAPI.</p>

          <form onSubmit={handleImportOsc} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="uf" className="block text-sm font-medium mb-1">State (UF)</label>
                <select
                  id="uf"
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">All States</option>
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
              <div>
                <label htmlFor="municipio" className="block text-sm font-medium mb-1">City</label>
                <input
                  id="municipio"
                  type="text"
                  value={municipio}
                  onChange={(e) => setMunicipio(e.target.value)}
                  placeholder="e.g. São Paulo"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Note: You must provide at least one filter (State or City). Limit is fixed to 50 for safety.</p>

            <Button type="submit" disabled={isImporting} className="w-full">
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Trigger Import
            </Button>
          </form>

          {importResult && (
            <div className={`mt-6 p-4 rounded-md border flex items-start ${
              importResult.type === 'success'
                ? 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400'
                : 'bg-destructive/10 border-destructive/50 text-destructive'
            }`}>
              {importResult.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
              )}
              <p className="text-sm">{importResult.message}</p>
            </div>
          )}
        </div>
      </div>
      <TriadeCopilot />
    </div>
  );
}
