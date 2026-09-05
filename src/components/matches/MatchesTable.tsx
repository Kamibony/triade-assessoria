import React from 'react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { MatchRow } from './MatchRow';

interface MatchesTableProps {
    matches: MatchResult[];
    editais: Record<string, Edital>;
    oscs: Record<string, NgoProfile>;
    groupBy: 'none' | 'edital' | 'osc';
    groupedMatches: Record<string, MatchResult[]>;
    expandedMatch: string | null;
    setExpandedMatch: (id: string | null) => void;
    handleFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
}

export function MatchesTable({ matches, editais, oscs, groupBy, groupedMatches, expandedMatch, setExpandedMatch, handleFeedback }: MatchesTableProps) {
    if (matches.length === 0) {
        return (
            <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">
                Nenhum match encontrado.
            </div>
        );
    }

    return (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-muted text-muted-foreground uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4 font-medium">OSC</th>
                            <th className="px-6 py-4 font-medium">Edital</th>
                            <th className="px-6 py-4 font-medium text-center" title="Gate 1: Hard Constraints (Prazo, Localização, Status, Documentação)">Burocracia (G1)</th>
                            <th className="px-6 py-4 font-medium text-center" title="Gate 2: Alinhamento Semântico (Vetor, Missão, Atividades)">Temática (G2)</th>
                            <th className="px-6 py-4 font-medium text-center">Ações</th>
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
                                                    : `OSC: ${oscs[groupKey]?.name || groupMatches[0]?.oscName || groupKey}`}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">({groupMatches.length} matches)</span>
                                            </td>
                                        </tr>
                                    )}
                                    {groupMatches.map(match => (
                                        <MatchRow
                                            key={match.id}
                                            match={match}
                                            edital={editais[match.editalId]}
                                            osc={oscs[match.oscId]}
                                            isExpanded={expandedMatch === match.id}
                                            onToggleExpand={() => setExpandedMatch(expandedMatch === match.id ? null : (match.id || null))}
                                            onFeedback={handleFeedback}
                                        />
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
