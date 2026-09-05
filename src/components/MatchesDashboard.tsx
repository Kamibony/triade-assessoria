import { useEffect, useState } from "react";
import { collection, query, onSnapshot, getDocs, getFirestore, updateDoc, doc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../lib/types';
import { useSearchParams } from 'react-router-dom';
import { MatchFilters } from './matches/MatchFilters';
import { MatchesTable } from './matches/MatchesTable';

export function MatchesDashboard() {
  const [searchParams] = useSearchParams();
  const filterOscId = searchParams.get('oscId');

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [editais, setEditais] = useState<Record<string, Edital>>({});
  const [oscs, setOscs] = useState<Record<string, NgoProfile>>({});
  const [loading, setLoading] = useState(true);

  // UI State
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState<'none' | 'edital' | 'osc'>('none');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'matches'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const matchesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MatchResult));

      // Default Sort by Match Score Descending
      matchesData.sort((a, b) => b.matchScore - a.matchScore);

      // Optimistically set matches first
      setMatches(matchesData);

      const { documentId, where } = await import("firebase/firestore");

      // Fetch corresponding editais
      const editalIds = [...new Set(matchesData.map(m => m.editalId))];
      if (editalIds.length > 0) {
          try {
              let hasNewEditais = false;
              const editaisMap: Record<string, Edital> = { ...editais };
              const chunkSize = 10;
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
              const chunkSize = 10;
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
    });

    return () => unsubscribe();
  }, []);

  const handleFeedback = async (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => {
      // Optimistic Update
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, actionState: action } : m));

      // Update Firestore
      const db = getFirestore();
      try {
          await updateDoc(doc(db, 'matches', matchId), {
              actionState: action
          });
      } catch (error) {
          console.error("Failed to update feedback state:", error);
          // Revert on failure (simplified for this demo, requires full state restoration in real app)
          alert("Erro ao salvar o feedback. Tente novamente.");
      }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p>Carregando avaliações do Agente...</p>
        </div>
      </div>
    );
  }

  const filteredMatches = matches.filter(match => {
      const matchesSearch =
          match.oscName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          match.oscId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          match.editalId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesOscFilter = filterOscId ? match.oscId === filterOscId : true;
      const matchesStatus = statusFilter === 'all' ? true : (match.actionState || 'Pendente') === statusFilter;

      return matchesSearch && matchesOscFilter && matchesStatus;
  });

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
         <h2 className="text-2xl font-bold tracking-tight">Dashboard de Matches (V2)</h2>
         <p className="text-muted-foreground mt-2">
            Resultados da avaliação multi-agente. Valide os matches gerados pela IA para refinar os futuros resultados.
         </p>
       </div>

       <MatchFilters
           searchTerm={searchTerm}
           setSearchTerm={setSearchTerm}
           groupBy={groupBy}
           setGroupBy={setGroupBy}
           statusFilter={statusFilter}
           setStatusFilter={setStatusFilter}
       />

       <MatchesTable
           matches={filteredMatches}
           editais={editais}
           oscs={oscs}
           groupBy={groupBy}
           groupedMatches={groupedMatches}
           expandedMatch={expandedMatch}
           setExpandedMatch={setExpandedMatch}
           handleFeedback={handleFeedback}
       />
    </div>
  );
}
