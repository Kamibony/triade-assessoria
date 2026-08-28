import React, { useEffect, useState } from "react";
import { collection, query, onSnapshot, getDocs, getFirestore } from 'firebase/firestore';
import { Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp, FileText, Search } from 'lucide-react';
import type { MatchResult, Edital } from '../lib/types';
import { useSearchParams } from 'react-router-dom';

export function MatchesDashboard() {
  const [searchParams] = useSearchParams();
  const filterOscId = searchParams.get('oscId');

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideLowScores, setHideLowScores] = useState(false);
  const [groupBy, setGroupBy] = useState<'none' | 'edital' | 'osc'>('none');

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'matches'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));

      // Default Sort by Match Score Descending
      matchesData.sort((a, b) => b.matchScore - a.matchScore);

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
                  const validChunk = chunk.filter(id => !!id);
                  if (validChunk.length > 0) {
                      const q = query(collection(db, "editais"), where(documentId(), "in", validChunk));
                      const editaisSnap = await getDocs(q);
                      editaisSnap.forEach(doc => { editaisMap[doc.id] = { id: doc.id, ...doc.data() } as Edital; });
                  }
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

  let filteredMatches = matches.filter(m =>
    m.oscId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.oscName || '')?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.editalId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (editais[m.editalId]?.title || '')?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filterOscId) {
    filteredMatches = filteredMatches.filter(m => m.oscId === filterOscId);
  }

  if (hideLowScores) {
    filteredMatches = filteredMatches.filter(m => m.matchScore >= 40);
  }

  // Explicit sort before grouping
  filteredMatches.sort((a, b) => b.matchScore - a.matchScore);

  // Grouping logic
  const groupedMatches: Record<string, MatchResult[]> = {};
  if (groupBy === 'edital') {
      filteredMatches.forEach(m => {
          if (!groupedMatches[m.editalId]) groupedMatches[m.editalId] = [];
          groupedMatches[m.editalId].push(m);
      });
  } else if (groupBy === 'osc') {
      filteredMatches.forEach(m => {
          if (!groupedMatches[m.oscId]) groupedMatches[m.oscId] = [];
          groupedMatches[m.oscId].push(m);
      });
  } else {
      groupedMatches['all'] = filteredMatches;
  }

  return (
    <div className="container mx-auto p-8 max-w-7xl">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
         <div>
           <h2 className="text-3xl font-bold mb-2">Master Matches Dashboard</h2>
           <p className="text-muted-foreground">
               Visão global de todos os matches gerados pelo sistema para todas as OSCs.
           </p>
         </div>
         <div className="flex flex-col sm:flex-row gap-4 bg-muted/30 p-4 rounded-lg border shadow-sm items-center w-full md:w-auto">
             <div className="flex items-center gap-3">
                 <span className="text-sm font-medium whitespace-nowrap">Ocultar &lt; 40%</span>
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="hideLow"
                      type="checkbox"
                      className="sr-only peer"
                      checked={hideLowScores}
                      onChange={e => setHideLowScores(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-muted peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                 </label>
             </div>
             <div className="h-6 w-px bg-border hidden sm:block"></div>
             <div className="flex items-center gap-2">
                 <label htmlFor="groupBy" className="text-sm font-medium whitespace-nowrap">Agrupar por:</label>
                 <select
                    id="groupBy"
                    value={groupBy}
                    onChange={e => setGroupBy(e.target.value as 'none' | 'edital' | 'osc')}
                    className="rounded-md border border-input bg-background py-1.5 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                 >
                     <option value="none">Nenhum</option>
                     <option value="edital">Edital</option>
                     <option value="osc">OSC</option>
                 </select>
             </div>
             <div className="h-6 w-px bg-border hidden sm:block"></div>
             <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Buscar por OSC, OSC ID ou Edital ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
             </div>
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
                     <th className="px-6 py-4 font-medium">OSC</th>
                     <th className="px-6 py-4 font-medium">Edital</th>
                     <th className="px-6 py-4 font-medium text-center">Elegibilidade</th>
                     <th className="px-6 py-4 font-medium text-center">Score</th>
                     <th className="px-6 py-4 font-medium text-right">Ações</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {Object.entries(groupedMatches).map(([groupKey, groupMatches]) => {
                     return (
                       <React.Fragment key={groupKey}>
                         {groupBy !== 'none' && (
                             <tr className="bg-muted/30">
                                 <td colSpan={5} className="px-6 py-3 font-semibold text-sm">
                                     {groupBy === 'edital'
                                         ? `Edital: ${editais[groupKey]?.title || groupKey}`
                                         : `OSC: ${groupMatches[0]?.oscName || groupKey}`}
                                     <span className="ml-2 text-xs font-normal text-muted-foreground">({groupMatches.length} matches)</span>
                                 </td>
                             </tr>
                         )}
                         {groupMatches.map(match => {
                           const edital = editais[match.editalId];
                           const isExpanded = expandedMatch === match.id;

                           // Determine color coding
                           let scoreColorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
                           if (match.matchScore >= 70) scoreColorClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
                           else if (match.matchScore >= 40) scoreColorClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

                           return (
                             <React.Fragment key={match.id}>
                         <tr className="hover:bg-muted/50 transition-colors">
                           <td className="px-6 py-4 font-medium" title={match.oscId}>{match.oscName || match.oscId}</td>
                           <td className="px-6 py-4">
                             <div className="font-medium line-clamp-1" title={edital?.title}>{edital?.title || match.editalId}</div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <div className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full text-xs ${match.eligibility ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
                               {match.eligibility ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                               {match.eligibility ? 'Elegível' : (match.matchScore >= 70 ? 'Inelegível (Restrição)' : 'Inelegível')}
                             </div>
                           </td>
                           <td className="px-6 py-4 text-center">
                             <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${scoreColorClass}`}>
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
                   </React.Fragment>
                 )})}
                 </tbody>
               </table>
             </div>
           </div>
       )}
    </div>
  );
}
