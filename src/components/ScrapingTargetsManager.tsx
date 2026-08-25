import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Button } from './ui/Button';
import { Database, Plus, Trash2, Edit2, Check, X, Link as LinkIcon } from 'lucide-react';

interface ScrapingTarget {
  id: string;
  name: string;
  url: string;
  strategy: 'RSS' | 'API' | 'HTML' | 'AUTO';
  cssSelector?: string;
  keywords?: string;
  active?: boolean;
  failureCount?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastFailedAt?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt?: any;
}

export function ScrapingTargetsManager() {
  const db = getFirestore();
  const [targets, setTargets] = useState<ScrapingTarget[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for new/edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [strategy, setStrategy] = useState<'RSS' | 'API' | 'HTML' | 'AUTO'>('AUTO');
  const [cssSelector, setCssSelector] = useState('');
  const [keywords, setKeywords] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'scraping_targets'), (snapshot) => {
      const data: ScrapingTarget[] = [];
      snapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as ScrapingTarget);
      });
      // Sort by name
      data.sort((a, b) => a.name.localeCompare(b.name));
      setTargets(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  const resetForm = () => {
    setName('');
    setUrl('');
    setStrategy('AUTO');
    setCssSelector('');
    setKeywords('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleToggleActive = async (target: ScrapingTarget) => {
    try {
      const newStatus = target.active === false ? true : false;
      await updateDoc(doc(db, 'scraping_targets', target.id), {
        active: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error toggling status:", error);
      alert("Erro ao alterar status da fonte.");
    }
  };

  const handleEdit = (target: ScrapingTarget) => {
    setName(target.name);
    setUrl(target.url);
    setStrategy(target.strategy);
    setCssSelector(target.cssSelector || '');
    setKeywords(target.keywords || '');
    setEditingId(target.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover esta fonte?')) {
      await deleteDoc(doc(db, 'scraping_targets', id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const targetData: any = {
      name,
      url,
      strategy,
      updatedAt: serverTimestamp()
    };

    if (strategy === 'HTML' && cssSelector.trim()) {
      targetData.cssSelector = cssSelector;
    }
    if (strategy === 'RSS' && keywords.trim()) {
      targetData.keywords = keywords;
    }

    try {
      if (editingId) {
        await updateDoc(doc(db, 'scraping_targets', editingId), targetData);
      } else {
        targetData.createdAt = serverTimestamp();
        targetData.active = true;
        await addDoc(collection(db, 'scraping_targets'), targetData);
      }
      resetForm();
    } catch (error) {
      console.error("Error saving target:", error);
      alert("Erro ao salvar a fonte.");
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center">
            <Database className="w-8 h-8 mr-3 text-primary" />
            Gerenciador de Fontes (Scraping)
          </h1>
          <p className="text-muted-foreground">
            Configure as fontes de dados para o buscador autônomo (RSS, API, ou HTML).
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} disabled={isFormOpen}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Fonte
        </Button>
      </div>

      {isFormOpen && (
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {editingId ? 'Editar Fonte' : 'Nova Fonte'}
            </h2>
            <Button variant="ghost" size="icon" onClick={resetForm}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Estratégia</label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as "RSS" | "API" | "HTML" | "AUTO")}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="AUTO">AUTO (Inteligência Artificial)</option>
                  <option value="RSS">RSS Feed</option>
                  <option value="HTML">HTML Seletor</option>
                  <option value="API">API</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome da Fonte</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Prosas, TransfereGov"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">URL</label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>


            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={resetForm} className="mr-2">
                Cancelar
              </Button>
              <Button type="submit">
                <Check className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card rounded-lg border shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando fontes...</div>
        ) : targets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhuma fonte configurada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-muted/50 uppercase border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">Nome</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Estratégia</th>
                  <th className="px-6 py-3 font-medium">Detalhes</th>
                  <th className="px-6 py-3 font-medium">Falhas</th>
                  <th className="px-6 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className={`border-b last:border-0 hover:bg-muted/20 ${target.active === false && target.failureCount && target.failureCount >= 3 ? 'bg-red-50/50 dark:bg-red-950/20' : ''}`}>
                    <td className="px-6 py-4 font-medium">{target.name}</td>
                    <td className="px-6 py-4">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={target.active !== false}
                          onChange={() => handleToggleActive(target)}
                        />
                        <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                        <span className={`ml-3 text-xs font-medium ${target.active !== false ? 'text-primary' : 'text-muted-foreground'}`}>
                          {target.active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </label>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                        ${target.strategy === 'RSS' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                          target.strategy === 'HTML' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                          target.strategy === 'AUTO' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                        {target.strategy}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-muted-foreground mb-1" title={target.url}>
                        <LinkIcon className="w-3 h-3 mr-1 shrink-0" />
                        <span className="truncate max-w-[200px]">{target.url}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span>{target.failureCount || 0}</span>
                        {target.failureCount !== undefined && target.failureCount > 0 && target.lastFailedAt && (
                          <span className="text-[10px] text-red-500 mt-1">
                            {target.lastFailedAt?.toDate?.()?.toLocaleString() || 'Erro recente'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Button variant="outline" size="icon" onClick={() => handleEdit(target)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" onClick={() => handleDelete(target.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
