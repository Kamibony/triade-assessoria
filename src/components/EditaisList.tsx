import { useEffect, useState } from 'react';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Button } from './ui/Button';

interface Edital {
    id: string;
    title: string;
    issuer: string;
    publicationDate: string;
    deadline: string;
    totalBudget: number;
}

export function EditaisList() {
    const [editais, setEditais] = useState<Edital[]>([]);
    const [oscs, setOscs] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEdital, setSelectedEdital] = useState<Edital | null>(null);
    const [selectedOscId, setSelectedOscId] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const db = getFirestore();
                const editaisSnap = await getDocs(collection(db, 'editais'));
                const list = editaisSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Edital));
                setEditais(list);

                const oscsSnap = await getDocs(collection(db, 'oscs'));
                const oscsList = oscsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id }));
                setOscs(oscsList);
                if (oscsList.length > 0) {
                    setSelectedOscId(oscsList[0].id);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const openModal = (edital: Edital) => {
        setSelectedEdital(edital);
        setModalOpen(true);
    };

    const handleSimulate = () => {
        if (selectedEdital && selectedOscId) {
            navigate(`/match/${selectedEdital.id}?oscId=${selectedOscId}`);
        }
    };

    if (loading) {
        return <div className="p-8 text-center">Carregando editais...</div>;
    }

    const filteredEditais = editais.filter(e =>
      e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.issuer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="container mx-auto p-8 max-w-7xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <div>
                <h2 className="text-3xl font-bold mb-2">Diretório de Editais</h2>
                <p className="text-muted-foreground">Todos os editais governamentais e privados capturados pelo sistema.</p>
              </div>
              <div className="relative w-full md:w-72">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Buscar por título ou emissor..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
            </div>

            {filteredEditais.length === 0 ? (
                <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">Nenhum edital encontrado no banco de dados.</div>
            ) : (
                <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-muted text-muted-foreground uppercase text-xs">
                        <tr>
                          <th className="px-6 py-4 font-medium">Título</th>
                          <th className="px-6 py-4 font-medium">Emissor</th>
                          <th className="px-6 py-4 font-medium">Prazo</th>
                          <th className="px-6 py-4 font-medium">Orçamento</th>
                          <th className="px-6 py-4 font-medium text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredEditais.map((edital) => (
                          <tr key={edital.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-medium line-clamp-2" title={edital.title}>{edital.title}</div>
                            </td>
                            <td className="px-6 py-4 text-muted-foreground">{edital.issuer}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{edital.deadline}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                              R$ {edital.totalBudget.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button onClick={() => openModal(edital)} className="text-primary hover:text-primary/80 font-medium text-sm cursor-pointer">
                                   Simular Match
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
            )}

            {modalOpen && selectedEdital && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-card w-full max-w-md rounded-lg shadow-xl border overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="font-bold text-lg">Simular Match</h3>
                            <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-sm font-medium mb-1">Edital Selecionado:</p>
                                <p className="text-sm text-muted-foreground line-clamp-2">{selectedEdital.title}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2">Selecione a OSC para o match:</label>
                                <select
                                    className="w-full rounded-md border border-input bg-background py-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={selectedOscId}
                                    onChange={(e) => setSelectedOscId(e.target.value)}
                                >
                                    {oscs.map(osc => (
                                        <option key={osc.id} value={osc.id}>{osc.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-4 border-t bg-muted/20">
                            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSimulate}>Confirmar Simulação</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
