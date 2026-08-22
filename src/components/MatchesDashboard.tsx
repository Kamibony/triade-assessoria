import { useEffect, useState } from "react";
import React from 'react';
import { collection, query, onSnapshot, getDocs, getFirestore, limit, orderBy } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../lib/types';

export function MatchesDashboard() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [ngos, setNgos] = useState<Record<string, NgoProfile>>({});
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirestore();
    const q = query(
      collection(db, 'matches'),
      orderBy('matchScore', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));
      setMatches(matchesData);

      // Fetch corresponding editais
      const editalIds = [...new Set(matchesData.map(m => m.editalId))];
      const ngoIds = [...new Set(matchesData.map(m => m.oscId))];

      try {
          const { documentId, where } = await import("firebase/firestore");

          if (editalIds.length > 0) {
              const editaisMap: Record<string, Edital> = {};
              const chunkSize = 10;
              for (let i = 0; i < editalIds.length; i += chunkSize) {
                  const chunk = editalIds.slice(i, i + chunkSize);
                  const editaisQ = query(collection(db, "editais"), where(documentId(), "in", chunk));
                  const editaisSnap = await getDocs(editaisQ);
                  editaisSnap.forEach(doc => { editaisMap[doc.id] = { id: doc.id, ...doc.data() } as Edital; });
              }
              setEditais(editaisMap);
          }

          if (ngoIds.length > 0) {
              const ngosMap: Record<string, NgoProfile> = {};
              const chunkSize = 10;
              for (let i = 0; i < ngoIds.length; i += chunkSize) {
                  const chunk = ngoIds.slice(i, i + chunkSize);
                  const ngosQ = query(collection(db, "oscs"), where(documentId(), "in", chunk));
                  const ngosSnap = await getDocs(ngosQ);
                  ngosSnap.forEach(doc => { ngosMap[doc.id] = { id: doc.id, ...doc.data() } as NgoProfile; });
              }
              setNgos(ngosMap);
          }

      } catch (e) {
          console.error("Error fetching related data for matches", e);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error listening to matches:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
     return <div className="p-8 text-center flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
       <div className="mb-8">
           <h2 className="text-3xl font-bold mb-2">Master Match Matrix</h2>
           <p className="text-muted-foreground">
               Visão global do operador para monitoramento de matches entre Editais e ONGs da rede.
           </p>
       </div>

       {matches.length === 0 ? (
           <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">
               Nenhum match encontrado no sistema.
           </div>
       ) : (
           <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
               <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                       <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                           <tr>
                               <th className="px-6 py-4 font-semibold">ONG (OSC)</th>
                               <th className="px-6 py-4 font-semibold">Edital</th>
                               <th className="px-6 py-4 font-semibold text-center">Score</th>
                               <th className="px-6 py-4 font-semibold">Elegibilidade</th>
                               <th className="px-6 py-4 font-semibold text-right">Ações</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                           {matches.map(match => {
                               const edital = editais[match.editalId];
                               const ngo = ngos[match.oscId];
                               const isExpanded = expandedMatch === match.id;

                               return (
                                   <React.Fragment key={match.id}>
                                       <tr className={`hover:bg-muted/30 transition-colors ${isExpanded ? 'bg-muted/10' : ''}`}>
                                           <td className="px-6 py-4 font-medium text-foreground max-w-[200px] truncate" title={ngo?.name || match.oscId}>
                                               {ngo?.name || 'ONG Desconhecida'}
                                           </td>
                                           <td className="px-6 py-4 text-muted-foreground max-w-[300px] truncate" title={edital?.title || match.editalId}>
                                               {edital?.title || 'Edital Desconhecido'}
                                           </td>
                                           <td className="px-6 py-4 text-center">
                                               <span className={`inline-flex items-center justify-center font-bold text-sm ${match.matchScore >= 70 ? 'text-emerald-500' : match.matchScore >= 40 ? 'text-amber-500' : 'text-destructive'}`}>
                                                   {match.matchScore}%
                                               </span>
                                           </td>
                                           <td className="px-6 py-4">
                                               <div className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full text-xs ${match.eligibility ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                                                   {match.eligibility ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                                                   {match.eligibility ? 'Elegível' : 'Inelegível'}
                                               </div>
                                           </td>
                                           <td className="px-6 py-4 text-right">
                                               <button
                                                   onClick={() => setExpandedMatch(isExpanded ? null : (match.id || null))}
                                                   className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                                               >
                                                   {isExpanded ? 'Ocultar' : 'Ver Detalhes'}
                                                   {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                               </button>
                                           </td>
                                       </tr>
                                       {isExpanded && (
                                           <tr className="bg-muted/5 border-b-0">
                                               <td colSpan={5} className="px-6 py-4 pb-6">
                                                   <div className="grid md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                                                       <div>
                                                           <h4 className="font-bold mb-2 text-sm flex items-center gap-2 text-foreground/90">
                                                                <FileText className="w-4 h-4 text-primary" />
                                                                Justificativa da Inteligência Artificial
                                                           </h4>
                                                           <p className="text-sm text-foreground/80 leading-relaxed bg-background p-4 rounded-lg border border-border shadow-sm">
                                                                {match.reasoning}
                                                           </p>
                                                       </div>

                                                       {match.actionPlan && match.actionPlan.length > 0 && (
                                                           <div>
                                                               <h4 className="font-bold mb-2 text-sm flex items-center gap-2 text-destructive">
                                                                   Plano de Ação (Gaps Identificados)
                                                               </h4>
                                                               <ul className="space-y-2 bg-background p-4 rounded-lg border border-border shadow-sm">
                                                                   {match.actionPlan.map((step, idx) => (
                                                                       <li key={idx} className="flex gap-3 text-sm items-start">
                                                                           <span className="font-bold text-destructive min-w-[20px]">{idx + 1}.</span>
                                                                           <span className="text-foreground/90 leading-relaxed">{step.replace(/^\d+\.\s*/, '')}</span>
                                                                       </li>
                                                                   ))}
                                                               </ul>
                                                           </div>
                                                       )}
                                                   </div>
                                               </td>
                                           </tr>
                                       )}
                                   </React.Fragment>
                               );
                           })}
                       </tbody>
                   </table>
               </div>
           </div>
       )}
    </div>
  );
}
