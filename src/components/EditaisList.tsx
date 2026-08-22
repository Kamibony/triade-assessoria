import { useEffect, useState } from 'react';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';

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
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchEditais = async () => {
            try {
                const db = getFirestore();
                const snapshot = await getDocs(collection(db, 'editais'));
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Edital));
                setEditais(list);
            } catch (error) {
                console.error("Error fetching editais:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchEditais();
    }, []);

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
                               <Link to={`/match/${edital.id}`} className="text-primary hover:text-primary/80 font-medium text-sm">
                                   Simular Match
                               </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
            )}
        </div>
    );
}
