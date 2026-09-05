import React from 'react';
import { CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { MatchDetailPanel } from './MatchDetailPanel';

interface MatchRowProps {
    match: MatchResult;
    edital?: Edital;
    osc?: NgoProfile;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
}

export function MatchRow({ match, edital, osc, isExpanded, onToggleExpand, onFeedback }: MatchRowProps) {
    // Gate 1 (Bureaucracy) Status
    const gate1Passed = match.eligibility;
    const isMissingData = !gate1Passed && match.matchScore === 0 && match.reasoning?.includes('Falta de informações'); // Heuristic based on memory/requirements

    let gate1Icon = <CheckCircle className="w-4 h-4" />;
    let gate1Class = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    let gate1Text = 'Aprovado';

    if (!gate1Passed) {
        if (isMissingData) {
            gate1Icon = <AlertCircle className="w-4 h-4" />;
            gate1Class = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
            gate1Text = 'Dados Faltantes';
        } else {
             gate1Icon = <XCircle className="w-4 h-4" />;
             gate1Class = 'bg-destructive/10 text-destructive';
             gate1Text = 'Reprovado';
        }
    }

    // Gate 2 (Thematic) Status
    let scoreColorClass = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (match.matchScore >= 70) scoreColorClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    else if (match.matchScore >= 40) scoreColorClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

    return (
        <React.Fragment>
            <tr className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 font-medium" title={match.oscId}>{osc?.name || match.oscName || match.oscId}</td>
                <td className="px-6 py-4">
                    <div className="font-medium line-clamp-1" title={edital?.title}>{edital?.title || match.editalId}</div>
                </td>
                <td className="px-6 py-4 text-center">
                    <div className={`inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full text-xs cursor-help ${gate1Class}`} title={!gate1Passed && match.reasoning ? match.reasoning : "Gate 1: Restrições burocráticas avaliadas."}>
                        {gate1Icon}
                        {gate1Text}
                    </div>
                </td>
                <td className="px-6 py-4 text-center">
                    {gate1Passed ? (
                         <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${scoreColorClass}`}>
                            {match.matchScore}%
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-muted text-muted-foreground" title="Análise Temática ignorada porque falhou no Gate 1 (Burocracia).">
                            <Lock className="w-3 h-3 mr-1" /> N/A
                        </span>
                    )}
                </td>
                <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-end gap-3">
                         {/* Optional tiny indicator of feedback state */}
                         {match.actionState && match.actionState !== 'Pendente' && (
                             <span className={`w-2 h-2 rounded-full ${match.actionState === 'Aprovado' ? 'bg-emerald-500' : match.actionState === 'Rejeitado' ? 'bg-red-500' : 'bg-amber-500'}`} title={`Feedback: ${match.actionState}`}></span>
                         )}
                         <button
                            onClick={onToggleExpand}
                            className="text-primary hover:text-primary/80 font-medium text-sm flex items-center gap-1"
                        >
                            {isExpanded ? 'Fechar' : 'Detalhes'}
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </td>
            </tr>
            {isExpanded && (
                <tr className="bg-muted/20">
                    <td colSpan={5} className="px-6 py-6 border-t-0">
                        <MatchDetailPanel match={match} edital={edital} osc={osc} onFeedback={onFeedback} />
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
}
