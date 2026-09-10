import React, { useState } from 'react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { MatchRow } from './MatchRow';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Reset page when group by changes or search/filter changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [matches, groupBy]);

    if (matches.length === 0) {
        return (
            <div className="bg-muted p-6 rounded-lg text-center text-muted-foreground">
                Nenhum match encontrado.
            </div>
        );
    }

    const groupKeys = Object.keys(groupedMatches);
    const totalItems = groupBy === 'none' ? matches.length : groupKeys.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const currentMatches = groupBy === 'none' ? matches.slice(startIndex, endIndex) : [];
    const currentGroupKeys = groupBy !== 'none' ? groupKeys.slice(startIndex, endIndex) : [];

    return (
        <div className="space-y-4">
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
                        {groupBy === 'none' ? (
                            currentMatches.map(match => (
                                <MatchRow
                                    key={match.id}
                                    match={match}
                                    edital={editais[match.editalId]}
                                    osc={oscs[match.oscId]}
                                    isExpanded={expandedMatch === match.id}
                                    onToggleExpand={() => setExpandedMatch(expandedMatch === match.id ? null : (match.id || null))}
                                    onFeedback={handleFeedback}
                                />
                            ))
                        ) : (
                            currentGroupKeys.map(groupKey => {
                                const groupMatches = groupedMatches[groupKey];
                                return (
                                    <React.Fragment key={groupKey}>
                                        <tr className="bg-muted/30">
                                            <td colSpan={5} className="px-6 py-3 font-semibold text-sm">
                                                {groupBy === 'edital'
                                                    ? `Edital: ${editais[groupKey]?.title || groupKey}`
                                                    : `OSC: ${oscs[groupKey]?.name || groupMatches[0]?.oscName || groupKey}`}
                                                <span className="ml-2 text-xs font-normal text-muted-foreground">({groupMatches.length} matches)</span>
                                            </td>
                                        </tr>
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
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {totalPages > 1 && (
            <div className="flex items-center justify-between bg-card border rounded-lg p-4 shadow-sm">
                <div className="text-sm text-muted-foreground">
                    Mostrando {startIndex + 1} a {Math.min(endIndex, totalItems)} de {totalItems} {groupBy === 'none' ? 'matches' : 'grupos'}
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium">
                        Página {currentPage} de {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-md border bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        )}
        </div>
    );
}
