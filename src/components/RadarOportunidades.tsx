import type { MatchResult, Edital, NgoProfile } from '../lib/types';
import { Target, Users, Filter, Hash } from 'lucide-react';

interface RadarOportunidadesProps {
  matches: MatchResult[];
  oscs: Record<string, NgoProfile>;
  editais: Record<string, Edital>;
}

export function RadarOportunidades({ matches, oscs, editais }: RadarOportunidadesProps) {
  // 1. Ranking de OSCs (Hot Leads) - matches > 80 score
  const validOscMatches = matches.filter(m => m.matchScore >= 80 && m.eligibility !== false);
  const oscCountMap: Record<string, number> = {};
  validOscMatches.forEach(m => {
    oscCountMap[m.oscId] = (oscCountMap[m.oscId] || 0) + 1;
  });
  const hotLeads = Object.entries(oscCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([oscId, count]) => ({
      oscId,
      name: oscs[oscId]?.name || matches.find(m => m.oscId === oscId)?.oscName || oscId,
      count
    }));

  // 2. Ranking de Editais (Top Grants)
  const validEditalMatches = matches.filter(m => m.eligibility !== false);
  const editalCountMap: Record<string, number> = {};
  validEditalMatches.forEach(m => {
    editalCountMap[m.editalId] = (editalCountMap[m.editalId] || 0) + 1;
  });
  const topGrants = Object.entries(editalCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([editalId, count]) => ({
      editalId,
      title: editais[editalId]?.title || 'Edital Desconhecido',
      count
    }));

  // 3. Funil de Conversão
  const totalMatches = matches.length;
  const aiApproved = matches.filter(m => m.eligibility === true).length;
  const manuallyApproved = matches.filter(m => m.actionState === 'Aprovado').length;

  // 4. Nuvem de Insights (Tags)
  const tagCountMap: Record<string, number> = {};
  matches.filter(m => m.eligibility === true).forEach(m => {
    if (m.badges && Array.isArray(m.badges)) {
      m.badges.forEach(badge => {
        tagCountMap[badge] = (tagCountMap[badge] || 0) + 1;
      });
    }
  });
  const topTags = Object.entries(tagCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Hot Leads */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Ranking de OSCs (Hot Leads)</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-4">OSCs com mais matches de alto potencial (Score &ge; 80).</p>
            <div className="space-y-3">
              {hotLeads.length > 0 ? hotLeads.map((lead, idx) => (
                <div key={lead.oscId} className="flex items-center justify-between p-3 rounded-md bg-muted/10 border border-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                    <span className="font-medium line-clamp-1">{lead.name}</span>
                  </div>
                  <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                    {lead.count} {lead.count === 1 ? 'match' : 'matches'}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">Nenhum dado suficiente.</p>
              )}
            </div>
          </div>
        </div>

        {/* Top Grants */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Ranking de Editais (Top Grants)</h3>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-4">Editais com o maior número de OSCs elegíveis pareadas.</p>
            <div className="space-y-3">
              {topGrants.length > 0 ? topGrants.map((grant, idx) => (
                <div key={grant.editalId} className="flex items-center justify-between p-3 rounded-md bg-muted/10 border border-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                    <span className="font-medium line-clamp-1">{grant.title}</span>
                  </div>
                  <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                    {grant.count} {grant.count === 1 ? 'OSC' : 'OSCs'}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground italic text-center py-4">Nenhum dado suficiente.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Funil de Conversão */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Funil de Conversão</h3>
          </div>
          <div className="p-6">
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border">
                <span className="font-medium text-muted-foreground">Total de Matches (Vetores)</span>
                <span className="text-2xl font-bold">{totalMatches}</span>
              </div>
              <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                <span className="font-medium text-blue-700">Aprovados pela IA (Elegíveis)</span>
                <span className="text-2xl font-bold text-blue-700">{aiApproved}</span>
              </div>
              <div className="flex justify-between items-center bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/20">
                <span className="font-medium text-emerald-700">Aprovados Manualmente</span>
                <span className="text-2xl font-bold text-emerald-700">{manuallyApproved}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nuvem de Insights */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center gap-2">
            <Hash className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Nuvem de Insights (Tags da IA)</h3>
          </div>
          <div className="p-6">
             <div className="flex flex-wrap gap-2">
               {topTags.length > 0 ? topTags.map(([tag, count]) => (
                 <span key={tag} className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-secondary text-secondary-foreground border">
                   {tag} <span className="ml-2 text-xs opacity-70">({count})</span>
                 </span>
               )) : (
                 <p className="text-sm text-muted-foreground italic">Nenhuma tag gerada pela IA disponível.</p>
               )}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
