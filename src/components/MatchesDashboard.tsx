import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, query, where, onSnapshot, getDocs, getFirestore } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { MatchResult, Edital } from '../lib/types';

export function MatchesDashboard() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // Hardcoded for MVP as we don't have auth yet
  const auth = getAuth();
  const currentOscId = auth.currentUser?.uid || "osc_mock_id_1";

  useEffect(() => {
    const db = getFirestore();
    const q = query(
      collection(db, 'matches'),
      where('oscId', '==', currentOscId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));
      setMatches(matchesData);

      // Fetch corresponding editais
      const editalIds = [...new Set(matchesData.map(m => m.editalId))];
      if (editalIds.length > 0) {
          try {
              // Fetch corresponding editais in chunks
              const { documentId } = await import("firebase/firestore");
              const editaisMap: Record<string, Edital> = {};
              const chunkSize = 10;
              for (let i = 0; i < editalIds.length; i += chunkSize) {
                  const chunk = editalIds.slice(i, i + chunkSize);
                  const q = query(collection(db, "editais"), where(documentId(), "in", chunk));
                  const editaisSnap = await getDocs(q);
                  editaisSnap.forEach(doc => { editaisMap[doc.id] = { id: doc.id, ...doc.data() } as Edital; });
              }
              setEditais(editaisMap);
          } catch (e) {
              console.error("Error fetching editais", e);
          }
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to matches:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentOscId]);

  if (loading) {
     return <div className="p-8 text-center flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto p-8 max-w-5xl">
       <h2 className="text-3xl font-bold mb-6">Dashboard de Matches</h2>
       <p className="text-muted-foreground mb-8">
           Acompanhe em tempo real a análise de compatibilidade da sua OSC com os editais disponíveis.
       </p>

       {matches.length === 0 ? (
           <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">
               Nenhum match encontrado. Suas análises aparecerão aqui quando concluídas.
           </div>
       ) : (
           <div className="grid gap-6">
               {matches.map(match => {
                   const edital = editais[match.editalId];
                   const isExpanded = expandedMatch === match.id;

                   return (
                       <div key={match.id} className="bg-card border rounded-xl p-6 shadow-sm transition-all hover:shadow-md">
                           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                               <div className="flex-1">
                                   <h3 className="text-xl font-bold mb-2 text-foreground">
                                       {edital?.title || 'Edital Desconhecido'}
                                   </h3>
                                   <div className={`inline-flex items-center gap-1.5 font-medium px-3 py-1 rounded-full text-sm ${match.eligibility ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                                       {match.eligibility ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                       {match.eligibility ? 'Elegível' : 'Inelegível'}
                                   </div>
                               </div>

                               <div className="flex flex-col items-center md:items-end justify-center min-w-[100px] border-l pl-4 border-border">
                                   <div className={`text-3xl font-black ${match.matchScore >= 70 ? 'text-emerald-500' : match.matchScore >= 40 ? 'text-amber-500' : 'text-destructive'}`}>
                                       {match.matchScore}%
                                   </div>
                                   <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Score</span>
                               </div>
                           </div>

                           <div className="mt-6">
                               <button
                                   onClick={() => setExpandedMatch(isExpanded ? null : (match.id || null))}
                                   className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                               >
                                   {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                   {isExpanded ? 'Ocultar Justificativa' : 'Ver Justificativa e Plano de Ação'}
                               </button>

                               {isExpanded && (
                                   <div className="mt-4 pt-4 border-t space-y-4 animate-in slide-in-from-top-2 duration-200">
                                       <div>
                                           <h4 className="font-bold mb-2 text-sm flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                Justificativa da Inteligência Artificial
                                           </h4>
                                           <p className="text-sm text-foreground/80 leading-relaxed bg-muted/50 p-4 rounded-lg border border-border">
                                                {match.reasoning}
                                           </p>
                                       </div>

                                       {match.actionPlan && match.actionPlan.length > 0 && (
                                           <div className="mt-4">
                                               <h4 className="font-bold mb-3 text-sm text-destructive flex items-center gap-2">
                                                   Plano de Ação Sugerido
                                               </h4>
                                               <ul className="space-y-2">
                                                   {match.actionPlan.map((step, idx) => (
                                                       <li key={idx} className="flex gap-3 text-sm items-start bg-destructive/5 p-3 rounded-lg border border-destructive/10">
                                                           <span className="font-bold text-destructive min-w-[20px] mt-0.5">{idx + 1}.</span>
                                                           <span className="text-foreground/90 leading-relaxed">{step.replace(/^\d+\.\s*/, '')}</span>
                                                       </li>
                                                   ))}
                                               </ul>
                                           </div>
                                       )}
                                   </div>
                               )}
                           </div>
                       </div>
                   );
               })}
           </div>
       )}
    </div>
  );
}
