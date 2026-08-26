import { useState, useEffect, useMemo } from 'react';
import { getFirestore, collection, onSnapshot, query, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Loader2, Search, Trash2, Edit, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import type { NgoProfile } from '../lib/types';

export function OscDirectoryView() {
  const [oscs, setOscs] = useState<NgoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFilter, setActivityFilter] = useState('');

  // Modal State
  const [selectedOsc, setSelectedOsc] = useState<NgoProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDocStatus, setEditDocStatus] = useState<string>('Pendente');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'oscs'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const oscData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NgoProfile));
      setOscs(oscData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching OSCs:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const allActivities = useMemo(() => {
    const activities = new Set<string>();
    oscs.forEach(osc => {
      if (osc.coreActivities) {
        osc.coreActivities.forEach(act => activities.add(act));
      }
    });
    return Array.from(activities).sort();
  }, [oscs]);

  const filteredOscs = useMemo(() => {
    return oscs.filter(osc => {
      const matchesSearch =
        (osc.name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (osc.id?.includes(searchTerm)); // ID is CNPJ

      const matchesActivity = activityFilter
        ? osc.coreActivities?.includes(activityFilter)
        : true;

      return matchesSearch && matchesActivity;
    });
  }, [oscs, searchTerm, activityFilter]);

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja remover a OSC "${name}"?`)) {
      try {
        const db = getFirestore();
        await deleteDoc(doc(db, 'oscs', id));
      } catch (error) {
        console.error("Erro ao deletar OSC:", error);
        alert("Falha ao deletar OSC.");
      }
    }
  };

  const navigate = useNavigate();

  const openProfile = (osc: NgoProfile) => {
    navigate(`/admin/directory/${osc.id}`);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedOsc(null);
  };

  const handleSaveModal = async () => {
    if (!selectedOsc) return;
    setIsSaving(true);
    try {
      const db = getFirestore();
      await updateDoc(doc(db, 'oscs', selectedOsc.id), {
        notes: editNotes,
        documentationStatus: editDocStatus
      });
      closeModal();
    } catch (error) {
      console.error("Erro ao atualizar OSC:", error);
      alert("Falha ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por Nome ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as Atividades</option>
            {allActivities.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">CNPJ</th>
                <th className="px-4 py-3 font-medium">Localização</th>
                <th className="px-4 py-3 font-medium">Atividades Principais</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredOscs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma OSC encontrada.
                  </td>
                </tr>
              ) : (
                filteredOscs.map(osc => (
                  <tr key={osc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{osc.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{osc.id}</td>
                    <td className="px-4 py-3">{osc.location}</td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {osc.coreActivities?.slice(0, 3).map((act, idx) => (
                          <span key={idx} className="bg-osc/10 text-osc px-2 py-0.5 rounded-full whitespace-nowrap">
                            {act}
                          </span>
                        ))}
                        {(osc.coreActivities?.length || 0) > 3 && (
                          <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full whitespace-nowrap">
                            +{(osc.coreActivities?.length || 0) - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openProfile(osc)} title="Visualizar/Editar">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(osc.id, osc.name)} className="text-destructive hover:bg-destructive/10 hover:text-destructive" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t text-xs text-muted-foreground">
          Mostrando {filteredOscs.length} de {oscs.length} organizações.
        </div>
      </div>

      {isModalOpen && selectedOsc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card text-card-foreground w-full max-w-2xl rounded-xl border shadow-lg flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold">{selectedOsc.name}</h3>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs font-semibold uppercase mb-1">CNPJ</span>
                  <span className="font-mono">{selectedOsc.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs font-semibold uppercase mb-1">Fundação</span>
                  <span>{selectedOsc.foundationDate || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs font-semibold uppercase mb-1">Localização</span>
                  <span>{selectedOsc.location || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs font-semibold uppercase mb-1">Projetos Aprovados</span>
                  <span>{selectedOsc.previousProjectsApproved ? 'Sim' : 'Não'}</span>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block text-xs font-semibold uppercase mb-2">Atividades Principais</span>
                <div className="flex flex-wrap gap-2">
                  {selectedOsc.coreActivities?.map((act, idx) => (
                    <span key={idx} className="bg-osc/10 text-osc px-2.5 py-1 rounded-md text-xs font-medium">
                      {act}
                    </span>
                  ))}
                </div>
              </div>

              <hr className="my-4" />

              <div>
                <label className="text-muted-foreground block text-xs font-semibold uppercase mb-2">Status da Documentação</label>
                <select
                  value={editDocStatus}
                  onChange={(e) => setEditDocStatus(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="Em dia">Em dia</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Irregular">Irregular</option>
                </select>
              </div>

              <div>
                <label className="text-muted-foreground block text-xs font-semibold uppercase mb-2">Notas Manuais (CRM)</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Adicione notas sobre contato, pendências, etc..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

            </div>

            <div className="p-6 border-t bg-muted/20 flex justify-end gap-3">
              <Button variant="outline" onClick={closeModal} disabled={isSaving}>Cancelar</Button>
              <Button onClick={handleSaveModal} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Salvar Alterações
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
