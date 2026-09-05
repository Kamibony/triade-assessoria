
import { FileText, ExternalLink } from 'lucide-react';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { FeedbackActionBar } from './FeedbackActionBar';

interface MatchDetailPanelProps {
    match: MatchResult;
    edital?: Edital;
    osc?: NgoProfile;
    onFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
}

export function MatchDetailPanel({ match, edital, onFeedback }: MatchDetailPanelProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div>
                    <h4 className="font-bold mb-2 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Justificativa da IA (Explainability)
                    </h4>
                    <p className="text-sm text-foreground/80 leading-relaxed bg-background p-4 rounded-lg border whitespace-pre-wrap">
                        {match.reasoning || "Nenhuma justificativa fornecida (geralmente ocorre quando falha no Gate 1)."}
                    </p>

                    {/* Simulated Vector Context / Key Terms (Placeholder for future actual XAI data) */}
                     {match.eligibility && (
                        <div className="mt-3 text-xs text-muted-foreground flex flex-wrap gap-2">
                             <span className="font-medium text-foreground">Tags (Gate 2):</span>
                             {match.badges && match.badges.length > 0 ? match.badges.map((badge, i) => (
                                 <span key={i} className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{badge}</span>
                             )) : <span className="italic">Nenhuma tag gerada.</span>}
                        </div>
                    )}
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

                 {(edital as any)?.sourceUrl && (
                    <div className="mt-4">
                        <a
                            href={(edital as any).sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                        >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Acessar Edital Original
                        </a>
                    </div>
                )}
            </div>

            <div className="lg:col-span-1 border-l pl-6 space-y-6">
                <div>
                     <h4 className="font-bold mb-3 text-sm">Ação do Consultor (Feedback)</h4>
                     <p className="text-xs text-muted-foreground mb-4">
                         Seu feedback calibra a IA (Few-Shot Learning) para futuros matches.
                     </p>
                     {match.id && (
                         <FeedbackActionBar
                             matchId={match.id}
                             currentState={match.actionState || 'Pendente'}
                             onFeedback={onFeedback}
                         />
                     )}
                </div>
            </div>
        </div>
    );
}
