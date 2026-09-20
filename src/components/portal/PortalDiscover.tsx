import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { Search, ChevronRight, CheckCircle2, Clock, AlertCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { MatchResult } from '../../lib/types';
import toast from 'react-hot-toast';
import { useActiveOsc } from '../../contexts/portal/ActiveOscContext';
import { MatchDetailPanel } from '../matches/MatchDetailPanel';

type PortalState = 'IDLE' | 'PROCESSING' | 'RESULTS';

export const PortalDiscover: React.FC = () => {
  const { user } = useAuth();

  const navigate = useNavigate();
  const { activeOscId: oscId } = useActiveOsc();

  const [currentState, setCurrentState] = useState<PortalState>('IDLE');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);


  // For the labor illusion
  const [processingStep, setProcessingStep] = useState(0);


  useEffect(() => {
    // Optimistic Initialization: Check for existing valid matches on mount
    const checkExistingMatches = async () => {
      if (!oscId) {
        setIsInitializing(false);
        return;
      }
      try {
        const matchesRef = collection(db, 'matches');
        const q = query(
          matchesRef,
          where('oscId', '==', oscId)
        );

        const snapshot = await getDocs(q);
        const existingMatches = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as MatchResult))
          // Strictly filter out noise locally as per memory
          .filter(m => m.eligibility !== false && m.actionState !== 'Rejeitado' && (!m.verificationResult || !m.verificationResult.some(r => r.status === 'Reprovado')));

        if (existingMatches.length > 0) {
          setMatches(existingMatches);
          setCurrentState('RESULTS');
        }
      } catch (error) {
        console.error("Error checking existing matches:", error);
      } finally {
        setIsInitializing(false);
      }
    };

    if (user) {
      checkExistingMatches();
    }
  }, [user, oscId]);


  const startDiscovery = async () => {
    setCurrentState('PROCESSING');
    setProcessingStep(0);

    // Labor Illusion Steps
    const steps = [
      { delay: 1500, label: "Lendo seu Perfil OSC e Histórico de Impacto..." },
      { delay: 3500, label: "Mapeando Editais Nacionais e Globais..." },
      { delay: 5500, label: "Aplicando análise semântica de restrições (Devil's Advocate)..." },
      { delay: 7500, label: "Curadoria das melhores oportunidades finalizada." }
    ];

    let currentDelay = 0;
    steps.forEach((step, index) => {
        currentDelay += step.delay;
        setTimeout(() => {
            setProcessingStep(index + 1);
        }, currentDelay);
    });

    try {
        const refreshOscOpportunities = httpsCallable(functions, 'refreshOscOpportunities');
        const res = await refreshOscOpportunities({ targetId: oscId }) as { data: { jobId?: string, success: boolean, message?: string } };

        if (res.data.jobId) {
            setActiveJobId(res.data.jobId);
        } else {
             // No pending matches to verify or job was not created, transition immediately
            setTimeout(() => {
                fetchResults();
            }, currentDelay + 1000);
        }

    } catch(err) {
        console.error("Error triggering batch:", err);
        toast.error("Houve um erro ao iniciar a busca. Tentando continuar localmente.");

        setTimeout(() => {
            fetchResults();
        }, currentDelay + 1000);
    }
  };

  const fetchResults = async () => {
      try {
        const matchesRef = collection(db, 'matches');
        const q = query(
          matchesRef,
          where('oscId', '==', oscId)
        );

        const snapshot = await getDocs(q);
        const fetchedMatches = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as MatchResult))
          .filter(m =>
            m.eligibility !== false &&
            m.actionState !== 'Rejeitado' &&
            (!m.verificationResult || !m.verificationResult.some(r => r.status === 'Reprovado')) &&
            m.matchScore > 0 // Failsafe: Never render 0% matches
          );

        setMatches(fetchedMatches);
        setCurrentState('RESULTS');
      } catch (error) {
        console.error("Error fetching results:", error);
        toast.error("Erro ao carregar resultados.");
        setCurrentState('IDLE');
      }
  };

  useEffect(() => {
    if (!activeJobId) return;

    const jobRef = doc(db, 'system_jobs', activeJobId);
    const unsubscribe = onSnapshot(jobRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status === 'completed' || data.status === 'failed') {
          setActiveJobId(null);
          if (data.status === 'completed') {
             toast.success('Curadoria de oportunidades finalizada com sucesso!');
          } else {
             toast.error('Erro na curadoria de oportunidades.');
          }
          fetchResults();
        }
      }
    });

    return () => unsubscribe();
  }, [activeJobId]);

  const handleRetrigger = () => {
      setMatches([]);
      startDiscovery();
  };


  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-primary/20 rounded-full"></div>
          <div className="h-4 w-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!oscId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-2">
          <AlertCircle className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-md">
          <h2 className="text-2xl font-bold">Nenhuma OSC Selecionada</h2>
          <p className="text-muted-foreground">
            Para descobrir oportunidades, selecione uma organização no menu acima ou adicione uma nova.
          </p>
        </div>
        <div className="flex gap-4">
          <Button onClick={() => navigate('/portal')} variant="outline">
            Ir para o Dashboard Hub
          </Button>
          <Button onClick={() => navigate('/portal/onboarding')}>
            Adicionar Nova OSC
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      <AnimatePresence mode="wait">

        {/* IDLE STATE */}
        {currentState === 'IDLE' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8"
          >
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Search className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-4 max-w-2xl">
              <h1 className="text-4xl font-extrabold tracking-tight">Encontre as Oportunidades Certas</h1>
              <p className="text-xl text-muted-foreground">
                Nossa IA vai mapear milhares de editais ativos, ler seus manuais de 100 páginas e encontrar as verbas exatas que combinam com o estatuto e histórico da sua OSC.
              </p>
            </div>
            <Button size="lg" onClick={startDiscovery} className="text-lg px-8 py-6 rounded-full group">
              Analisar Oportunidades Agora
              <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        )}

        {/* PROCESSING STATE (Labor Illusion) */}
        {currentState === 'PROCESSING' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="flex flex-col items-center justify-center min-h-[60vh] max-w-xl mx-auto"
          >
            <div className="w-full bg-card border shadow-lg rounded-2xl p-8 space-y-6">
              <div className="flex items-center gap-4 mb-8">
                <div className="relative flex items-center justify-center w-12 h-12">
                   <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
                   <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Analisando o cenário...</h3>
                  <p className="text-sm text-muted-foreground">Isso pode levar alguns minutos</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  "Lendo seu Perfil OSC e Histórico de Impacto...",
                  "Mapeando Editais Nacionais e Globais...",
                  "Aplicando análise semântica de restrições (Devil's Advocate)...",
                  "Curadoria das melhores oportunidades finalizada."
                ].map((label, i) => {
                  const isActive = i === processingStep;
                  const isDone = i < processingStep;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0.3, x: -10 }}
                      animate={{
                          opacity: isDone ? 1 : isActive ? 1 : 0.3,
                          x: isDone ? 0 : isActive ? 0 : -10
                      }}
                      className="flex items-center gap-3"
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : isActive ? (
                         <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-muted rounded-full shrink-0" />
                      )}
                      <span className={`text-sm ${isActive ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {label}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* RESULTS STATE */}
        {currentState === 'RESULTS' && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl border shadow-sm">
              <div>
                <h2 className="text-3xl font-bold">Suas Oportunidades</h2>
                <p className="text-muted-foreground">Encontramos {matches.length} oportunidades de alto alinhamento para sua OSC.</p>
              </div>
              <Button onClick={handleRetrigger} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Buscar Novos Editais
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {matches.map((match) => (
                <OpportunityCard key={match.id} match={match} onClick={() => setSelectedMatch(match)} />
              ))}
            </div>

            {selectedMatch && <OpportunityDetailsModal match={selectedMatch} onClose={() => setSelectedMatch(null)} />}

            {matches.length === 0 && (
                <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed">
                    <AlertCircle className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">Nenhum edital elegível no momento</h3>
                    <p className="text-muted-foreground mt-2">Nossa IA está monitorando constantemente. Volte em alguns dias.</p>
                </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};


// Opportunity Card Component (Inline for the blueprint)

const OpportunityCard: React.FC<{ match: MatchResult; onClick?: () => void }> = ({ match, onClick }) => {
    const isPendingInfo = match.verificationResult?.some(r => r.status === 'Pendente de Informação') || match.status?.includes('Pendente') || match.badges?.includes('Pendente de Informação');

    return (
        <div className="bg-card border rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full group">
            <div className="p-6 flex-grow space-y-4">
                <div className="flex justify-between items-start">
                    <div className="space-y-1">
                        {match.badges?.map(badge => (
                            <span key={badge} className="inline-block px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-md mr-2 mb-2">
                                {badge}
                            </span>
                        ))}
                        {isPendingInfo && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-md mr-2 mb-2">
                                <AlertCircle className="w-3 h-3" />
                                Pendente de Informação
                            </span>
                        )}
                    </div>

                    {/* Score Ring */}
                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-green-50 rounded-full border border-green-100 shrink-0">
                        <span className="text-sm font-bold text-green-700">{match.matchScore}%</span>
                    </div>
                </div>

                <div>
                    <h3 className="text-lg font-bold leading-tight line-clamp-2">{match.editalTitle || `Edital ${match.editalId}`}</h3>
                    <div className="flex items-center gap-1 mt-2 text-sm text-muted-foreground font-medium">
                        <Clock className="w-4 h-4" />
                        <span>Encerra em breve</span>
                    </div>
                </div>

                <div className="pt-4 border-t border-muted">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                        {match.aiRationale || match.reasoning || "Match encontrado com sucesso base nas suas qualificações."}
                    </p>
                </div>
            </div>

            <div className="p-4 bg-muted/30 border-t">
                 {/* Detail View triggered here - simplified to a toast for the blueprint */}
                <Button
                    variant="default"
                    className="w-full group-hover:bg-primary transition-colors"
                    onClick={onClick}
                >
                    Ver Detalhes e Justificativa
                </Button>
            </div>
        </div>
    );
};


const OpportunityDetailsModal: React.FC<{ match: MatchResult; onClose: () => void }> = ({ match, onClose }) => {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-card rounded-2xl border shadow-xl p-6"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>

                    <h2 className="text-2xl font-bold mb-6 pr-8">
                        {match.editalTitle || `Edital ${match.editalId}`} - Detalhes
                    </h2>

                    <MatchDetailPanel
                        match={match}
                        onFeedback={(_matchId, action) => {
                            toast.success(`Feedback salvo: ${action}`);
                            // Em produção, isso faria a chamada para a API
                        }}
                    />
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
