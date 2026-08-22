import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Button } from './ui/Button';
import { Database, Plus, Trash2, Edit2, Check, X, Link as LinkIcon, Code } from 'lucide-react';

interface ScrapingTarget {
  id: string;
  name: string;
  url: string;
  strategy: 'RSS' | 'API' | 'HTML';
  cssSelector?: string;
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
  const [strategy, setStrategy] = useState<'RSS' | 'API' | 'HTML'>('RSS');
  const [cssSelector, setCssSelector] = useState('');

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
    setStrategy('RSS');
    setCssSelector('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEdit = (target: ScrapingTarget) => {
    setName(target.name);
    setUrl(target.url);
    setStrategy(target.strategy);
    setCssSelector(target.cssSelector || '');
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

    try {
      if (editingId) {
        await updateDoc(doc(db, 'scraping_targets', editingId), targetData);
      } else {
        targetData.createdAt = serverTimestamp();
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Estratégia de Extração</label>
                <select
                  value={strategy}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onChange={(e) => setStrategy(e.target.value as any)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="RSS">RSS (Feed)</option>
                  <option value="HTML">HTML (Scraping de Página)</option>
                  <option value="API">API (JSON)</option>
                </select>
              </div>

              {strategy === 'HTML' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Seletor CSS para Links</label>
                  <input
                    type="text"
                    required
                    value={cssSelector}
                    onChange={(e) => setCssSelector(e.target.value)}
                    placeholder="Ex: .article-list a.title"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
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
                  <th className="px-6 py-3 font-medium">Estratégia</th>
                  <th className="px-6 py-3 font-medium">Detalhes</th>
                  <th className="px-6 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <tr key={target.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-6 py-4 font-medium">{target.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                        ${target.strategy === 'RSS' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                          target.strategy === 'HTML' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}>
                        {target.strategy}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-muted-foreground mb-1" title={target.url}>
                        <LinkIcon className="w-3 h-3 mr-1 shrink-0" />
                        <span className="truncate max-w-[200px]">{target.url}</span>
                      </div>
                      {target.strategy === 'HTML' && target.cssSelector && (
                        <div className="flex items-center text-muted-foreground text-xs">
                          <Code className="w-3 h-3 mr-1 shrink-0" />
                          <span>Seletor: {target.cssSelector}</span>
                        </div>
                      )}
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
