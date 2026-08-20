import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs, getFirestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Loader2, CheckCircle, XCircle, ArrowLeft, FileText, Clock, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MatchResult } from '../lib/types';


export function NgoMatchView() {
    const { editalId } = useParams();
    const [match, setMatch] = useState<MatchResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    // Hardcoded for MVP as we don't have auth yet
    const currentOscId = "osc_mock_id_1";

    useEffect(() => {
        const fetchMatch = async () => {
            if (!editalId) return;
            try {
                const db = getFirestore();
                const q = query(
                    collection(db, 'matches'),
                    where('editalId', '==', editalId),
                    where('oscId', '==', currentOscId)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    setMatch({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MatchResult);
                }
            } catch (error) {
                console.error("Error fetching match:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchMatch();
    }, [editalId]);

    const handleGenerateMatch = async (forceRecalculate: boolean = false) => {
        setGenerating(true);
        try {
            const orchestrator = httpsCallable(functions, 'triggerMatchOrchestrator');
            const response = await orchestrator({ editalId, oscId: currentOscId, forceRecalculate });
            setMatch(response.data as MatchResult);
        } catch (error) {
            console.error("Error generating match:", error);
            alert("Erro ao gerar o match. Verifique se a OSC e o Edital existem no Firestore.");
        } finally {
            setGenerating(false);
        }
    };

    const formatTimeAgo = (timestamp: { toMillis?: () => number, seconds?: number }) => {
        if (!timestamp) return "Data desconhecida";
        // Handle both Firestore Timestamp and JS Date/millis
        const millis = timestamp.toMillis ? timestamp.toMillis() : (timestamp.seconds ? timestamp.seconds * 1000 : Number(timestamp));

        // When forcing a recalculate, the server timestamp sentinel comes back unparsed, making millis NaN.
        if (isNaN(millis)) return "Agora mesmo";

        const now = new Date().getTime();
        const diffDays = Math.floor((now - millis) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Hoje";
        if (diffDays === 1) return "Ontem";
        return `${diffDays} dias atrás`;
    };

    if (loading) {
        return <div className="p-8 text-center flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    }

    return (
        <div className="container mx-auto p-8 max-w-4xl">
            <Link to="/editais" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition">
                <ArrowLeft className="w-4 h-4" /> Voltar para Editais
            </Link>

            <div className="bg-card rounded-2xl shadow-xl border overflow-hidden p-8 md:p-12">
                {!match ? (
                    <div className="text-center py-12">
                        <h2 className="text-2xl font-bold mb-4">Análise de Compatibilidade</h2>
                        <p className="text-muted-foreground mb-8">O sistema de Inteligência Artificial ainda não analisou o seu perfil para este edital específico.</p>
                        <button
                            onClick={() => handleGenerateMatch(false)}
                            disabled={generating}
                            className="bg-primary text-primary-foreground px-8 py-3 rounded-full font-bold text-lg hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto disabled:opacity-50"
                        >
                            {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> Processando Análise AI...</> : "Gerar Análise de Match agora"}
                        </button>
                    </div>
                ) : (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                         <div className="flex flex-col items-center mb-8 text-center border-b pb-8 relative">
                             {/* Cache Info & Override */}
                             <div className="absolute top-0 right-0 flex flex-col items-end gap-2">
                                 {match.createdAt && (
                                     <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
                                         <Clock className="w-3.5 h-3.5" />
                                         <span>Calculado: {formatTimeAgo(match.createdAt)}</span>
                                     </div>
                                 )}
                                 <button
                                     onClick={() => handleGenerateMatch(true)}
                                     disabled={generating}
                                     className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-1.5 rounded-full disabled:opacity-50"
                                     title="Forçar recálculo da análise ignorando o cache"
                                 >
                                     <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                                     Recalcular
                                 </button>
                             </div>

                             <div className="flex items-center justify-center w-32 h-32 rounded-full border-8 mb-4 mt-6 md:mt-0 relative" style={{ borderColor: `hsl(var(--muted))` }}>
                                <svg className="absolute top-0 left-0 w-full h-full -rotate-90">
                                    <circle cx="50%" cy="50%" r="46%" fill="transparent" stroke="currentColor" strokeWidth="8%" className={match.matchScore >= 70 ? 'text-emerald-500' : match.matchScore >= 40 ? 'text-amber-500' : 'text-destructive'} strokeDasharray="289%" strokeDashoffset={`${289 - (289 * match.matchScore) / 100}%`} style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                                </svg>
                                <span className="text-3xl font-black">{match.matchScore}%</span>
                             </div>

                             <h3 className={`text-2xl font-bold flex items-center gap-2 ${match.eligibility ? 'text-emerald-500' : 'text-destructive'}`}>
                                 {match.eligibility ? <CheckCircle className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
                                 {match.eligibility ? 'Elegível para Inscrição' : 'Inelegível no momento'}
                             </h3>
                         </div>

                         <div className="mb-8">
                             <h4 className="text-lg font-bold mb-2">Justificativa da Inteligência Artificial</h4>
                             <p className="text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-lg">{match.reasoning}</p>
                         </div>

                         {!match.eligibility && match.actionPlan && match.actionPlan.length > 0 && (
                             <div className="bg-destructive/10 rounded-xl p-6 border border-destructive/20 mt-6">
                                 <h4 className="font-bold text-lg mb-4 flex items-center gap-2 text-destructive">
                                     <FileText className="w-5 h-5" /> Plano de Ação Estruturado
                                 </h4>
                                 <p className="text-sm text-foreground/80 mb-4">A AI gerou os seguintes passos para você se adequar às exigências do edital:</p>
                                 <ul className="space-y-3">
                                     {match.actionPlan.map((step, idx) => (
                                         <li key={idx} className="flex gap-3 text-sm items-start">
                                             <span className="bg-destructive/20 text-destructive font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">{idx + 1}</span>
                                             <span className="text-foreground leading-relaxed">{step.replace(/^\d+\.\s*/, '')}</span>
                                         </li>
                                     ))}
                                 </ul>
                             </div>
                         )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
