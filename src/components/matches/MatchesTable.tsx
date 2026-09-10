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
    handleGlobalInvalidate: (editalId: string) => void;
}

export function MatchesTable({ matches, editais, oscs, groupBy, groupedMatches, expandedMatch, setExpandedMatch, handleFeedback, handleGlobalInvalidate }: MatchesTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Reset page when group by changes or search/filter changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [matches, groupBy]);

    const groupKeys = Object.keys(groupedMatches);
    const totalItems = groupBy === 'none' ? matches.length : groupKeys.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const currentMatches = groupBy === 'none' ? matches.slice(startIndex, endIndex) : [];
    const currentGroupKeys = groupBy !== 'none' ? groupKeys.slice(startIndex, endIndex) : [];

    const handleBulkReject = (groupMatches: MatchResult[]) => {
        if (window.confirm('Tem certeza que deseja rejeitar todos os matches pendentes deste grupo?')) {
            groupMatches.forEach(match => {
                if (!match.actionState || match.actionState === 'Pendente') {
                    handleFeedback(match.id!, 'Rejeitado');
                }
            });
        }
    };

    if (matches.length === 0) {
        return (
            <div className="bg-muted p-8 rounded-lg text-center border shadow-sm">
                <div className="mx-auto w-12 h-12 rounded-full bg-background flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium">Nenhum match encontrado</h3>
                <p className="text-sm text-muted-foreground mt-2">
                    Tente ajustar seus filtros ou remover os termos de busca.
                </p>
            </div>
        );
    }

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
                                    handleGlobalInvalidate={handleGlobalInvalidate}
                                />
                            ))
                        ) : (
                            currentGroupKeys.map(groupKey => {
                                const groupMatches = groupedMatches[groupKey];
                                const hasPendings = groupMatches.some(m => !m.actionState || m.actionState === 'Pendente');
                                return (
                                    <React.Fragment key={groupKey}>
                                        <tr className="bg-muted/30">
                                            <td colSpan={5} className="px-6 py-3 font-semibold text-sm">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        {groupBy === 'edital'
                                                            ? `Edital: ${editais[groupKey]?.title || groupKey}`
                                                            : `OSC: ${oscs[groupKey]?.name || groupMatches[0]?.oscName || groupKey}`}
                                                        <span className="ml-2 text-xs font-normal text-muted-foreground">({groupMatches.length} matches)</span>
                                                    </div>
                                                    {hasPendings && (
                                                        <button
                                                            onClick={() => handleBulkReject(groupMatches)}
                                                            className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1 rounded-md transition-colors"
                                                        >
                                                            Rejeitar Pendentes
                                                        </button>
                                                    )}
                                                </div>
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
                                                handleGlobalInvalidate={handleGlobalInvalidate}
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
