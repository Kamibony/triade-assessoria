import { useEffect, useState } from 'react';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { Link } from 'react-router-dom';

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

    return (
        <div className="container mx-auto p-8 max-w-4xl">
            <h2 className="text-3xl font-bold mb-6">Editais Disponíveis</h2>
            {editais.length === 0 ? (
                <div className="bg-muted p-6 rounded-lg text-center">Nenhum edital encontrado no banco de dados.</div>
            ) : (
                <div className="grid gap-6 md:grid-cols-2">
                    {editais.map((edital) => (
                        <div key={edital.id} className="bg-card border rounded-xl p-6 shadow-sm">
                            <h3 className="text-xl font-bold mb-2">{edital.title}</h3>
                            <p className="text-muted-foreground text-sm mb-4">Emissor: {edital.issuer}</p>
                            <div className="flex justify-between items-center text-sm mb-6">
                                <span>Prazo: <span className="font-medium">{edital.deadline}</span></span>
                                <span>Orçamento: <span className="font-medium text-emerald-600 font-bold">R$ {edital.totalBudget.toLocaleString('pt-BR')}</span></span>
                            </div>
                            <Link to={`/match/${edital.id}`} className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium inline-block text-center w-full hover:opacity-90 transition">
                                Ver Match com sua ONG
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
