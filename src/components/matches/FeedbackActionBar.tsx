
import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Eye } from 'lucide-react';

interface FeedbackActionBarProps {
    matchId: string;
    currentState: 'Pendente' | 'Aprovado' | 'Rejeitado' | 'Revisao';
    onFeedback: (matchId: string, action: 'Aprovado' | 'Rejeitado' | 'Revisao') => void;
}

export function FeedbackActionBar({ matchId, currentState, onFeedback }: FeedbackActionBarProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    const handleAction = async (action: 'Aprovado' | 'Rejeitado' | 'Revisao') => {
        setIsUpdating(true);
        try {
            await onFeedback(matchId, action);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <button
                onClick={() => handleAction('Aprovado')}
                disabled={isUpdating}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors border
                    ${currentState === 'Aprovado'
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-800'
                        : 'bg-background border-input hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
                    } disabled:opacity-50`}
            >
                <ThumbsUp className="w-4 h-4" />
                Aprovar Match
            </button>
            <button
                onClick={() => handleAction('Rejeitado')}
                disabled={isUpdating}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors border
                    ${currentState === 'Rejeitado'
                        ? 'bg-red-100 border-red-500 text-red-800'
                        : 'bg-background border-input hover:bg-red-50 hover:text-red-700 hover:border-red-300'
                    } disabled:opacity-50`}
            >
                <ThumbsDown className="w-4 h-4" />
                Rejeitar Falso Positivo
            </button>
            <button
                onClick={() => handleAction('Revisao')}
                disabled={isUpdating}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-md transition-colors border
                    ${currentState === 'Revisao'
                        ? 'bg-amber-100 border-amber-500 text-amber-800'
                        : 'bg-background border-input hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
                    } disabled:opacity-50`}
            >
                <Eye className="w-4 h-4" />
                Precisa de Revisão
            </button>
        </div>
    );
}
