
import { useState } from 'react';
import { FileText, ExternalLink, ShieldAlert, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { MatchResult, Edital, NgoProfile } from '../../lib/types';
import { FeedbackActionBar } from './FeedbackActionBar';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { Skeleton } from '../ui/Skeleton';

interface MatchDetailPanelProps {
    match: MatchResult;
    edital?: Edital;
    osc?: NgoProfile;
    onFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
    handleGlobalInvalidate?: (editalId: string) => void;
}

export function MatchDetailPanel({ match, edital, onFeedback, handleGlobalInvalidate }: MatchDetailPanelProps) {
    const [isVerifying, setIsVerifying] = useState(false);

    const handleVerifyClick = async () => {
        if (!match.id) return;
        setIsVerifying(true);
        const functions = getFunctions();
        const verifyFn = httpsCallable(functions, 'verifyMatchConstraints');

        try {
            await verifyFn({ matchId: match.id });
            toast.success("Verificação concluída com sucesso!");
        } catch (error: any) {
            console.error("Erro na verificação:", error);
            toast.error(error.message || "Falha ao executar a verificação.");
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div>
                    <h4 className="font-bold mb-2 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Justificativa da IA (Explainability)
                    </h4>
                    <div className="text-sm text-foreground/80 leading-relaxed bg-background p-4 rounded-lg border prose prose-sm dark:prose-invert max-w-none">
                        {match.reasoning ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {match.reasoning}
                            </ReactMarkdown>
                        ) : (
                            <p>Nenhuma justificativa fornecida (geralmente ocorre quando falha no Gate 1).</p>
                        )}
                    </div>

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

                <div className="mt-6 border-t pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-sm flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-orange-500" />
                            Auditoria Restrita (Advogado do Diabo)
                        </h4>
                        {!match.verificationResult && !isVerifying && (
                            <button
                                onClick={handleVerifyClick}
                                className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-md font-medium transition-colors"
                            >
                                Iniciar Verificação
                            </button>
                        )}
                    </div>

                    {isVerifying ? (
                        <div className="space-y-3">
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                            <Skeleton className="h-20 w-full" />
                        </div>
                    ) : match.verificationResult ? (
                        <div className="space-y-3">
                            {match.verificationResult.map((result, idx) => (
                                <div key={idx} className="bg-background p-3 rounded-md border flex items-start gap-3">
                                    <div className="mt-0.5">
                                        {result.status === 'Aprovado' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                        {result.status === 'Reprovado' && <XCircle className="w-4 h-4 text-red-500" />}
                                        {result.status === 'Não Encontrado' && <HelpCircle className="w-4 h-4 text-gray-400" />}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-sm flex items-center gap-2">
                                            {result.criterion}
                                            <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-sm ${
                                                result.status === 'Aprovado' ? 'bg-green-100 text-green-700' :
                                                result.status === 'Reprovado' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-600'
                                            }`}>
                                                {result.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 italic">
                                            "{result.citation}"
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground bg-accent/50 p-4 rounded-md text-center">
                            Nenhuma auditoria estrita realizada para este match.
                        </div>
                    )}
                </div>

                 {(match.sourceUrl || (edital as any)?.sourceUrl) && (
                    <div className="mt-4">
                        <a
                            href={match.sourceUrl || (edital as any)?.sourceUrl}
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
                             editalId={match.editalId}
                             handleGlobalInvalidate={handleGlobalInvalidate}
                         />
                     )}
                </div>
            </div>
        </div>
    );
}
