import { useEffect, useState } from 'react';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
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
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);

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

    const filteredEditais = editais.filter(edital =>
        edital.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        edital.issuer.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return <div className="p-8 text-center">Carregando editais...</div>;
    }

    return (
        <div className="container mx-auto p-8 max-w-6xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold">Editais (Database)</h2>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar por título ou fonte..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>

            {editais.length === 0 ? (
                <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">Nenhum edital encontrado no banco de dados.</div>
            ) : (
                <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Edital</th>
                                    <th className="px-6 py-4 font-semibold">Fonte (Emissor)</th>
                                    <th className="px-6 py-4 font-semibold">Prazo</th>
                                    <th className="px-6 py-4 font-semibold text-right">Orçamento</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredEditais.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                            Nenhum edital corresponde à busca.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEditais.map((edital) => (
                                        <tr key={edital.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 font-medium text-foreground max-w-md truncate" title={edital.title}>
                                                {edital.title}
                                            </td>
                                            <td className="px-6 py-4 text-muted-foreground">
                                                {edital.issuer}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                    {edital.deadline}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                R$ {edital.totalBudget.toLocaleString('pt-BR')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
