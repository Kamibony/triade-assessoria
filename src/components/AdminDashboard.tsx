import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, Users, FileText, CheckSquare, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TriadeCopilot } from './TriadeCopilot';

export function AdminDashboard() {
  const [stats, setStats] = useState({
    totalOscs: 0,
    activeEditais: 0,
    totalMatches: 0
  });
  const [loading, setLoading] = useState(true);

  const db = getFirestore();

  useEffect(() => {
    let unsubscribeOscs: () => void;
    let unsubscribeEditais: () => void;
    let unsubscribeMatches: () => void;

    const fetchStats = async () => {
      try {
        // OSCs listener
        const oscsQuery = query(collection(db, 'oscs'));
        unsubscribeOscs = onSnapshot(oscsQuery, (snapshot) => {
          setStats(prev => ({ ...prev, totalOscs: snapshot.size }));
        });

        // Editais listener (active only, simple approximation via status if it exists, otherwise just count all for now)
        // Adjust query if there's a specific 'active' boolean or status
        const editaisQuery = query(collection(db, 'editais'));
        unsubscribeEditais = onSnapshot(editaisQuery, (snapshot) => {
          setStats(prev => ({ ...prev, activeEditais: snapshot.size }));
        });

        // Matches listener (Top Matches threshold, e.g., score >= 85)
        const matchesQuery = query(collection(db, 'matches'), where('score', '>=', 85));
        unsubscribeMatches = onSnapshot(matchesQuery, (snapshot) => {
          setStats(prev => ({ ...prev, totalMatches: snapshot.size }));
          setLoading(false);
        });

      } catch (error) {
        console.error("Error fetching stats:", error);
        setLoading(false);
      }
    };

    fetchStats();

    return () => {
      if (unsubscribeOscs) unsubscribeOscs();
      if (unsubscribeEditais) unsubscribeEditais();
      if (unsubscribeMatches) unsubscribeMatches();
    };
  }, [db]);

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Visão Geral</h1>
        <p className="text-muted-foreground">Acompanhe as métricas principais do sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Total OSCs Card */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--osc))]/5 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="font-semibold text-muted-foreground">Total de OSCs</h3>
            <div className="p-2 bg-[hsl(var(--osc))]/10 rounded-md">
              <Users className="w-5 h-5 text-[hsl(var(--osc))]" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 relative z-10">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-4xl font-bold tracking-tighter">{stats.totalOscs}</span>
            )}
          </div>
          <Link to="/admin/directory" className="inline-flex items-center text-sm font-medium text-[hsl(var(--osc))] mt-6 hover:underline relative z-10">
            Ver Diretório <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Active Editais Card */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--edital))]/5 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="font-semibold text-muted-foreground">Editais Ativos</h3>
            <div className="p-2 bg-[hsl(var(--edital))]/10 rounded-md">
              <FileText className="w-5 h-5 text-[hsl(var(--edital))]" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 relative z-10">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-4xl font-bold tracking-tighter">{stats.activeEditais}</span>
            )}
          </div>
          <Link to="/admin/editais" className="inline-flex items-center text-sm font-medium text-[hsl(var(--edital))] mt-6 hover:underline relative z-10">
            Ver Editais <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>

        {/* Top Matches Card */}
        <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full -mr-8 -mt-8 pointer-events-none" />
          <div className="flex items-center justify-between mb-4 relative z-10">
            <h3 className="font-semibold text-muted-foreground">Top Matches (&ge; 85)</h3>
            <div className="p-2 bg-primary/10 rounded-md">
              <CheckSquare className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 relative z-10">
            {loading ? (
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            ) : (
              <span className="text-4xl font-bold tracking-tighter">{stats.totalMatches}</span>
            )}
          </div>
          <Link to="/admin/matches" className="inline-flex items-center text-sm font-medium text-primary mt-6 hover:underline relative z-10">
            Ver Matches <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>

      <TriadeCopilot />
    </div>
  );
}
