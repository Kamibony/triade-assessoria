import React, { useEffect, useState } from 'react';
import type { AgenticSearchJob } from '../../lib/useAgenticSearchTracker';
import { Loader2, Search, Brain, Globe, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface ProgressRadarProps {
  job: AgenticSearchJob;
  onRetry: () => void;
  onDismiss: () => void;
}

export const ProgressRadar: React.FC<ProgressRadarProps> = ({ job, onRetry, onDismiss }) => {
  const { status, progress, logs, error } = job;
  const [currentLog, setCurrentLog] = useState<string>('');

  useEffect(() => {
    if (logs && logs.length > 0) {
      setCurrentLog(logs[logs.length - 1]);
    }
  }, [logs]);

  const steps = [
    { id: 'queued', label: 'Iniciando', icon: Search },
    { id: 'generating_queries', label: 'Estratégia IA', icon: Brain },
    { id: 'scraping_web', label: 'Varredura Web', icon: Globe },
    { id: 'scoring_triage', label: 'Análise de Editais', icon: Search },
    { id: 'completed', label: 'Concluído', icon: CheckCircle2 }
  ];

  const getCurrentStepIndex = () => {
    if (status === 'failed') return steps.length - 1; // Show at end, but we'll render differently
    const index = steps.findIndex(s => s.id === status);
    return index >= 0 ? index : 0;
  };

  const currentIndex = getCurrentStepIndex();
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isFailed ? 'bg-red-100 text-red-600' : isCompleted ? 'bg-green-100 text-green-600' : 'bg-primary-100 text-primary-600'}`}>
            {isFailed ? <XCircle size={20} /> : isCompleted ? <CheckCircle2 size={20} /> : <Loader2 size={20} className="animate-spin" />}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Radar de Busca Agêntica</h3>
            <p className="text-sm text-gray-500">
              {isFailed ? 'Busca interrompida' : isCompleted ? 'Busca finalizada' : 'Procurando editais ativamente na web'}
            </p>
          </div>
        </div>
        {(isFailed || isCompleted) && (
             <Button variant="ghost" onClick={onDismiss} size="sm">Fechar</Button>
        )}
      </div>

      <div className="p-6">
        {/* Progress Stepper */}
        <div className="relative mb-8">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -translate-y-1/2 z-0"></div>
          <div className="relative z-10 flex justify-between">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentIndex && !isFailed;
              const isPast = index < currentIndex || isCompleted;
              const isErrorStep = isFailed && index === currentIndex;

              let bgColor = 'bg-white';
              let borderColor = 'border-gray-200';
              let iconColor = 'text-gray-400';

              if (isActive) {
                bgColor = 'bg-primary-50';
                borderColor = 'border-primary-500';
                iconColor = 'text-primary-600';
              } else if (isPast) {
                bgColor = 'bg-primary-500';
                borderColor = 'border-primary-500';
                iconColor = 'text-white';
              } else if (isErrorStep) {
                bgColor = 'bg-red-50';
                borderColor = 'border-red-500';
                iconColor = 'text-red-500';
              }

              return (
                <div key={step.id} className="flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors duration-300 ${bgColor} ${borderColor}`}>
                    <StepIcon size={18} className={iconColor} />
                  </div>
                  <span className={`text-xs font-medium ${isActive || isPast ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{progress.queriesGenerated}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-1">Queries Geradas</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{progress.linksFound}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-1">Links Descobertos</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-gray-900">{progress.linksEvaluated}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-1">Páginas Lidas</div>
          </div>
          <div className="bg-primary-50 p-4 rounded-lg text-center border border-primary-100">
            <div className="text-2xl font-bold text-primary-700">{progress.validEditaisEnqueued}</div>
            <div className="text-xs text-primary-600 uppercase tracking-wide font-medium mt-1">Editais Válidos</div>
          </div>
        </div>

        {/* Console / Status Log */}
        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
          {!isFailed ? (
            <div className="flex items-center gap-3 text-green-400">
              {status !== 'completed' && <span className="flex-shrink-0 animate-pulse">▶</span>}
              <span className="truncate">{currentLog || 'Aguardando inicialização...'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-red-400">
              <span className="flex-shrink-0">▶</span>
              <span className="truncate">Erro: {error || 'Falha inesperada na busca agêntica.'}</span>
            </div>
          )}
        </div>

        {/* States Actions */}
        {isFailed && (
          <div className="mt-6 flex justify-center">
            <Button onClick={onRetry} className="bg-primary-600 hover:bg-primary-700 text-white">
              Tentar Novamente
            </Button>
          </div>
        )}

        {isCompleted && progress.validEditaisEnqueued === 0 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
             <AlertCircle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
             <div>
                <h4 className="text-sm font-semibold text-yellow-800">Nenhum edital novo encontrado</h4>
                <p className="text-sm text-yellow-700 mt-1">
                   A IA vasculhou a web com base no perfil da ONG, mas não encontrou nenhuma nova oportunidade válida neste momento. Tente novamente em alguns dias.
                </p>
             </div>
          </div>
        )}

        {isCompleted && progress.validEditaisEnqueued > 0 && (
          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
             <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
             <div>
                <h4 className="text-sm font-semibold text-green-800">Sucesso!</h4>
                <p className="text-sm text-green-700 mt-1">
                   Encontramos {progress.validEditaisEnqueued} edita{progress.validEditaisEnqueued === 1 ? 'l' : 'is'} promissore{progress.validEditaisEnqueued === 1 ? '' : 's'}.
                   Eles foram enviados para a fila de extração detalhada e aparecerão nos Matches em breve.
                </p>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};
