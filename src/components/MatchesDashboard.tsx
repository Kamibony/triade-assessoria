import { useEffect, useState } from "react";
import { collection, query, getDocs, getFirestore, updateDoc, doc, where, orderBy, limit, startAfter, onSnapshot } from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Activity, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MatchResult, Edital, NgoProfile } from '../lib/types';
import { useSearchParams } from 'react-router-dom';
import { MatchFilters } from './matches/MatchFilters';
import { MatchesTable } from './matches/MatchesTable';
import { RadarOportunidades } from './RadarOportunidades';
import { DrillDownPanel } from './matches/DrillDownPanel';
import { Skeleton } from './ui/Skeleton';

export function MatchesDashboard() {
  const [searchParams] = useSearchParams();
  const filterOscId = searchParams.get('oscId');

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [oscs, setOscs] = useState<Record<string, NgoProfile>>({});
  const [loading, setLoading] = useState(true);

  // UI State
  const [viewMode, setViewMode] = useState<'table' | 'radar'>('table');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'edital' | 'osc'>('none');
  const [statusFilter, setStatusFilter] = useState('hide-rejected');
  const [cityFilter, setCityFilter] = useState('');
  const [selectedDrillDown, setSelectedDrillDown] = useState<{ type: 'osc' | 'edital', id: string } | null>(null);

  const [activeJob, setActiveJob] = useState<any>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [matchLimit, setMatchLimit] = useState<number>(50);

  useEffect(() => {
    const fetchGlobalStats = async () => {
      try {
        const functions = getFunctions();
        const computeDashboardStats = httpsCallable(functions, 'computeDashboardStats');
        const result = await computeDashboardStats();
        setGlobalStats(result.data);
      } catch (error) {
        console.error("Error fetching global stats:", error);
      }
    };
    fetchGlobalStats();
  }, []);

  useEffect(() => {
    const db = getFirestore();
    const jobQuery = query(
      collection(db, 'system_jobs'),
      where('type', '==', 'bulk_match'),
      where('status', 'in', ['running', 'completed'])
    );

    const unsubscribeJob = onSnapshot(jobQuery, (snapshot) => {
      const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      jobs.sort((a: any, b: any) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      const currentActive = jobs[0];

      setActiveJob((prev: any) => {
        if (prev && !prev.evaluationsCompleted && (currentActive as any)?.evaluationsCompleted) {
          toast.success('Avaliação concluída com sucesso');
        }
        return currentActive || null;
      });
    });

    return () => unsubscribeJob();
  }, []);

  const fetchMatches = async (isLoadMore = false) => {
      if (isLoadMore) {
          setIsLoadingMore(true);
      }

      const db = getFirestore();
      let q = query(collection(db, 'matches'), orderBy('matchScore', 'desc'), limit(50));

      if (isLoadMore && lastVisible) {
          q = query(collection(db, 'matches'), orderBy('matchScore', 'desc'), startAfter(lastVisible), limit(50));
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
          setHasMore(false);
          if (!isLoadMore) setLoading(false);
          if (isLoadMore) setIsLoadingMore(false);
          return;
      }

      const lastDoc = snapshot.docs[snapshot.docs.length - 1];
      setLastVisible(lastDoc);
      setHasMore(snapshot.docs.length === 50);

      const newMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));

      setMatches(prev => {
          const current = isLoadMore ? prev : [];
          const existingIds = new Set(current.map(m => m.id));
          const uniqueNew = newMatches.filter(m => !existingIds.has(m.id));
          return [...current, ...uniqueNew];
      });

      const matchesData = newMatches;

      const { documentId, where } = await import("firebase/firestore");

      // Fetch corresponding editais
      const editalIds = [...new Set(matchesData.map(m => m.editalId))];
      if (editalIds.length > 0) {
          try {
              let hasNewEditais = false;
              const editaisMap: Record<string, Edital> = { ...editais };
              const chunkSize = 30;
              for (let i = 0; i < editalIds.length; i += chunkSize) {
                  const chunk = editalIds.slice(i, i + chunkSize);
                  const validChunk = chunk.filter(id => !!id && !editaisMap[id]);
                  if (validChunk.length > 0) {
                      const q = query(collection(db, "editais"), where(documentId(), "in", validChunk));
                      const editaisSnap = await getDocs(q);
                      editaisSnap.forEach(doc => { editaisMap[doc.id] = { id: doc.id, ...doc.data() } as Edital; hasNewEditais = true; });
                  }
              }
              if (hasNewEditais) setEditais(editaisMap);
          } catch (error) {
              console.error("Error fetching editais for matches:", error);
          }
      }

      // Fetch corresponding OSCs
      const oscIds = [...new Set(matchesData.map(m => m.oscId))];
      if (oscIds.length > 0) {
          try {
              let hasNewOscs = false;
              const oscsMap: Record<string, NgoProfile> = { ...oscs };
              const chunkSize = 30;
              for (let i = 0; i < oscIds.length; i += chunkSize) {
                  const chunk = oscIds.slice(i, i + chunkSize);
                  const validChunk = chunk.filter(id => !!id && !oscsMap[id]);
                  if (validChunk.length > 0) {
                      const q = query(collection(db, "oscs"), where(documentId(), "in", validChunk));
                      const oscsSnap = await getDocs(q);
                      oscsSnap.forEach(doc => { oscsMap[doc.id] = { id: doc.id, ...doc.data() } as NgoProfile; hasNewOscs = true; });
                  }
              }
              if (hasNewOscs) setOscs(oscsMap);
          } catch (error) {
              console.error("Error fetching OSCs for matches:", error);
          }
      }

      setLoading(false);
      if (isLoadMore) {
          setIsLoadingMore(false);
      }
  };

  useEffect(() => {
      fetchMatches();
  }, []);

  const handleLoadMore = () => {
      fetchMatches(true);
  };

  const handleGlobalInvalidate = async (editalId: string) => {
      const relatedMatches = matches.filter(m => m.editalId === editalId);
      if (window.confirm(`ATENÇÃO: Você está prestes a rejeitar GLOBALMENTE todos os ${relatedMatches.length} matches associados a este Edital. Esta ação atualizará o status de todos eles para "Rejeitado". Deseja continuar?`)) {
          try {
              const { writeBatch } = await import('firebase/firestore');
              const db = getFirestore();

              const chunks = [];
              for (let i = 0; i < relatedMatches.length; i += 500) {
                  chunks.push(relatedMatches.slice(i, i + 500));
              }

              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach(match => {
                      if (match.id) {
                          const matchRef = doc(db, 'matches', match.id);
                          batch.update(matchRef, { actionState: 'Rejeitado' });
                      }
                  });
                  await batch.commit();
              }

              // Optimistic local update after all chunks complete
              setMatches(prev => prev.map(m => m.editalId === editalId ? { ...m, actionState: 'Rejeitado' } : m));

              toast.success("Edital invalidado globalmente com sucesso.");
          } catch (error) {
              console.error("Error invalidating edital globally:", error);
              toast.error("Ocorreu um erro ao invalidar o edital. Verifique o console.");
          }
      }
  };

  const handleFeedback = async (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => {
      // Optimistic Update
      const previousMatches = [...matches];
      const matchToUpdate = matches.find(m => m.id === matchId);
      const previousState = matchToUpdate?.actionState;

      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, actionState: action } : m));

      // Show Undo Toast
      toast((t) => (
        <div className="flex items-center gap-4">
          <span>Match marcado como <b>{action}</b></span>
          <button
            onClick={() => {
              toast.dismiss(t.id);
              // Revert optimistic update
              setMatches(previousMatches);
              // Revert in Firestore
              updateDoc(doc(getFirestore(), 'matches', matchId), { actionState: previousState || null });
            }}
            className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80"
          >
            Desfazer
          </button>
        </div>
      ), { duration: 4000 });

      // Update Firestore
      const db = getFirestore();
      try {
          await updateDoc(doc(db, 'matches', matchId), {
              actionState: action
          });
      } catch (error) {
          console.error("Failed to update feedback state:", error);
          // Revert on failure
          setMatches(previousMatches);
          toast.error("Erro ao salvar o feedback. Tente novamente.");
      }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight">Dashboard de Matches (V2)</h2>
          </div>
          <Skeleton className="h-4 w-1/3 mt-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="space-y-4">
          <div className="flex gap-4">
             <Skeleton className="h-10 w-1/4" />
             <Skeleton className="h-10 w-1/4" />
          </div>
          <div className="bg-card border rounded-lg shadow-sm p-4">
            <Skeleton className="h-8 w-full mb-4" />
            <Skeleton className="h-12 w-full mb-2" />
            <Skeleton className="h-12 w-full mb-2" />
            <Skeleton className="h-12 w-full mb-2" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const filteredMatches = matches.filter(match => {
      // Exclude globally inactive editais
      const isEditalActive = editais[match.editalId]?.ativo !== false;
      if (!isEditalActive) return false;

      const matchesSearch =
          match.oscName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          match.oscId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          match.editalId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesOscFilter = filterOscId ? match.oscId === filterOscId : true;

      let matchesCityFilter = true;
      if (cityFilter.trim() !== '') {
          const osc = oscs[match.oscId];
          if (osc && typeof osc.location === 'string') {
              matchesCityFilter = osc.location.toLowerCase().includes(cityFilter.trim().toLowerCase());
          } else {
              matchesCityFilter = false;
          }
      }

      const matchesStatus = statusFilter === 'all'
          ? true
          : statusFilter === 'hide-rejected'
              ? match.actionState !== 'Rejeitado' && match.eligibility !== false
              : (match.actionState || 'Pendente') === statusFilter;

      return matchesSearch && matchesOscFilter && matchesCityFilter && matchesStatus;
  });

  const handleDrillDown = (type: 'osc' | 'edital', id: string) => {
      setSelectedDrillDown({ type, id });
  };

  const groupedMatches: Record<string, MatchResult[]> = {};
  filteredMatches.forEach(match => {
      let key = 'all';
      if (groupBy === 'edital') key = match.editalId;
      if (groupBy === 'osc') key = match.oscId;

      if (!groupedMatches[key]) groupedMatches[key] = [];
      groupedMatches[key].push(match);
  });

  return (
    <div className="space-y-6">
       <div>
         <div className="flex items-center gap-4">
           <h2 className="text-2xl font-bold tracking-tight">Dashboard de Matches (V2)</h2>
           {activeJob && (
             <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${activeJob.evaluationsCompleted ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
               {activeJob.evaluationsCompleted ? (
                 <>
                   <CheckCircle2 className="w-4 h-4 mr-1.5" />
                   Avaliações Concluídas
                 </>
               ) : (
                 <>
                   <Activity className="w-4 h-4 mr-1.5 animate-pulse" />
                   Processando Avaliações...
                 </>
               )}
             </span>
           )}
         </div>
         <p className="text-muted-foreground mt-2">
            Resultados da avaliação multi-agente. Valide os matches gerados pela IA para refinar os futuros resultados.
         </p>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
           <div
             className={`bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center cursor-pointer transition-colors ${statusFilter === 'all' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
             onClick={() => { setViewMode('table'); setStatusFilter('all'); }}
           >
               <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Total Matches</p>
               <p className="text-3xl font-bold mt-1">{globalStats?.total || 0}</p>
           </div>
           <div
             className={`bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center cursor-pointer transition-colors ${statusFilter === 'Pendente' ? 'ring-2 ring-amber-500 bg-amber-500/5' : 'hover:bg-muted/50'}`}
             onClick={() => { setViewMode('table'); setStatusFilter('Pendente'); }}
           >
               <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Pendentes</p>
               <p className="text-3xl font-bold mt-1 text-amber-500">
                   {globalStats?.pendentes || 0}
               </p>
           </div>
           <div
             className={`bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center cursor-pointer transition-colors ${statusFilter === 'Aprovado' ? 'ring-2 ring-emerald-500 bg-emerald-500/5' : 'hover:bg-muted/50'}`}
             onClick={() => { setViewMode('table'); setStatusFilter('Aprovado'); }}
           >
               <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Aprovados</p>
               <p className="text-3xl font-bold mt-1 text-emerald-500">
                   {globalStats?.manuallyApproved || 0}
               </p>
           </div>
           <div
             className={`bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center cursor-pointer transition-colors ${statusFilter === 'Rejeitado' ? 'ring-2 ring-red-500 bg-red-500/5' : 'hover:bg-muted/50'}`}
             onClick={() => { setViewMode('table'); setStatusFilter('Rejeitado'); }}
           >
               <p className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Reprovados</p>
               <p className="text-3xl font-bold mt-1 text-red-500">
                   {globalStats?.reprovados || 0}
               </p>
           </div>
       </div>

       <div className="flex justify-center mb-6">
           <div className="inline-flex bg-muted p-1 rounded-lg">
               <button
                   onClick={() => setViewMode('table')}
                   className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
               >
                   Tabela de Matches
               </button>
               <button
                   onClick={() => setViewMode('radar')}
                   className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'radar' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
               >
                   Radar de Oportunidades
               </button>
           </div>
       </div>

       {viewMode === 'table' ? (
           <>
               <MatchFilters
                   searchTerm={searchTerm}
                   setSearchTerm={setSearchTerm}
                   groupBy={groupBy}
                   setGroupBy={setGroupBy}
                   statusFilter={statusFilter}
                   setStatusFilter={setStatusFilter}
                   cityFilter={cityFilter}
                   setCityFilter={setCityFilter}
               />

               <MatchesTable
                   matches={filteredMatches.slice(0, matchLimit)}
                   editais={editais}
                   oscs={oscs}
                   groupBy={groupBy}
                   groupedMatches={groupedMatches}
                   expandedMatch={expandedMatch}
                   setExpandedMatch={setExpandedMatch}
                   handleFeedback={handleFeedback}
                   handleGlobalInvalidate={handleGlobalInvalidate}
               />

               {hasMore && (
                   <div className="flex justify-center mt-6">
                       <button
                           onClick={handleLoadMore}
                           disabled={isLoadingMore}
                           className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                           {isLoadingMore ? 'Carregando...' : 'Carregar Mais'}
                       </button>
                   </div>
               )}
           </>
       ) : (
           <RadarOportunidades matches={filteredMatches} oscs={oscs} editais={editais} onDrillDown={handleDrillDown} globalStats={globalStats} />
       )}

       {matches.length >= matchLimit && (
           <div className="flex justify-center mt-6">
               <button
                   onClick={() => setMatchLimit((prev: number) => prev + 50)}
                   className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors"
               >
                   Carregar Mais
               </button>
           </div>
       )}

       {selectedDrillDown && (
           <DrillDownPanel
               type={selectedDrillDown.type}
               id={selectedDrillDown.id}
               onClose={() => setSelectedDrillDown(null)}
               matches={matches}
               oscs={oscs}
               editais={editais}
               handleFeedback={handleFeedback}
               handleGlobalInvalidate={handleGlobalInvalidate}
           />
       )}
    </div>
  );
}
