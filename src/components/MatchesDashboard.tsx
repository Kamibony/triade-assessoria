import React, { useEffect, useState } from "react";
import { collection, query, onSnapshot, getDocs, getFirestore } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Search } from 'lucide-react';
import type { MatchResult, Edital } from '../lib/types';

export function MatchesDashboard() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'matches'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));
      setMatches(matchesData);

      // Fetch corresponding editais
      const editalIds = [...new Set(matchesData.map(m => m.editalId))];
      if (editalIds.length > 0) {
          try {
              // Fetch corresponding editais in chunks
              const { documentId, where } = await import("firebase/firestore");
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
  }, []);

  if (loading) {
     return <div className="p-8 text-center flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const filteredMatches = matches.filter(m =>
    m.oscId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.editalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (editais[m.editalId]?.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-8 max-w-7xl">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
         <div>
           <h2 className="text-3xl font-bold mb-2">Master Matches Dashboard</h2>
           <p className="text-muted-foreground">
               Visão global de todos os matches gerados pelo sistema para todas as OSCs.
           </p>
         </div>
         <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="w-4 h-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Buscar por OSC ID ou Edital ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
       </div>

       {filteredMatches.length === 0 ? (
           <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">
               Nenhum match encontrado.
           </div>
       ) : (
           <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-muted text-muted-foreground uppercase text-xs">
                   <tr>
                     <th className="px-6 py-4 font-medium">OSC ID</th>
                     <th className="px-6 py-4 font-medium">Edital</th>
                     <th className="px-6 py-4 font-medium text-center">Elegibilidade</th>
                     <th className="px-6 py-4 font-medium text-center">Score</th>
                     <th className="px-6 py-4 font-medium text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {filteredMatches.map(match => {
                     const edital = editais[match.editalId];
                     const isExpanded = expandedMatch === match.id;
                     return (
                       <React.Fragment key={match.id}>
                         <tr className="hover:bg-muted/50 transition-colors">
                           <td className="px-6 py-4 font-medium">{match.oscId}</td>
                           <td className="px-6 py-4">
                             <div className="font-medium line-clamp-1" title={edital?.title}>{edital?.title || match.editalId}</div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <div className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-0.5 rounded-full text-xs ${match.eligibility ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                               {match.eligibility ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                               {match.eligibility ? 'Elegível' : 'Inelegível'}
                             </div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <span className={`font-bold ${match.matchScore >= 70 ? 'text-emerald-500' : match.matchScore >= 40 ? 'text-amber-500' : 'text-destructive'}`}>
                               {match.matchScore}%
                             </span>
                           </td>
                           <td className="px-6 py-4 text-right">
                             <button
                               onClick={() => setExpandedMatch(isExpanded ? null : (match.id || null))}
                               className="text-primary hover:text-primary/80 font-medium text-sm flex items-center justify-end w-full gap-1"
                             >
                               {isExpanded ? 'Fechar' : 'Detalhes'}
                               {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                             </button>
                           </td>
                         </tr>
                         {isExpanded && (
                           <tr className="bg-muted/20">
                             <td colSpan={5} className="px-6 py-6 border-t-0">
                               <div className="grid grid-cols-1 gap-6 max-w-4xl">
                                  <div>
                                      <h4 className="font-bold mb-2 text-sm flex items-center gap-2">
                                          <FileText className="w-4 h-4" />
                                          Justificativa da IA
                                      </h4>
                                      <p className="text-sm text-foreground/80 leading-relaxed bg-background p-4 rounded-lg border">
                                          {match.reasoning}
                                      </p>
                                  </div>
                                  {match.actionPlan && match.actionPlan.length > 0 && (
                                      <div>
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
