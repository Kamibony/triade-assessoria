import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Button } from './ui/Button';
import { Loader2, Search, ArrowLeft, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { NgoProfile } from '../lib/types';

export function OscProfileView() {
  const { oscId } = useParams();
  const navigate = useNavigate();
  const [osc, setOsc] = useState<NgoProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAgenticRunning, setIsAgenticRunning] = useState(false);
  const [agenticResult, setAgenticResult] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    if (!oscId) return;
    const db = getFirestore();
    const unsubscribe = onSnapshot(doc(db, 'oscs', oscId), (docSnap) => {
      if (docSnap.exists()) {
        setOsc({ id: docSnap.id, ...docSnap.data() } as NgoProfile);
      } else {
        setOsc(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [oscId]);

  const handleRunAgenticSearch = async () => {
    if (!oscId) return;
    setIsAgenticRunning(true);
    setAgenticResult(null);

    try {
        const triggerAgenticSearch = httpsCallable(functions, 'triggerAgenticSearch');
        const result = await triggerAgenticSearch({ oscId });
        const data = result.data as { success: boolean; message: string };
        if (data.success) {
            setAgenticResult({
                type: 'success',
                message: data.message || "Busca enviada para fila de processamento."
            });
        }
    } catch (error: unknown) {
        setAgenticResult({
            type: 'error',
            message: error instanceof Error ? error.message : "Erro desconhecido."
        });
    } finally {
        setIsAgenticRunning(false);
    }
  };

  if (loading) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!osc) {
      return <div className="p-8 text-center">OSC não encontrada.</div>;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/directory')} title="Voltar ao Diretório">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            {osc.name}
          </h1>
          <p className="text-muted-foreground font-mono text-sm">CNPJ: {osc.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="md:col-span-2 space-y-6">
            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6">
              <h2 className="text-xl font-bold mb-4">Perfil da Organização</h2>
              <div className="space-y-4">
                  <div>
                      <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Missão / Foco de Atuação</p>
                      <p className="font-medium text-sm leading-relaxed">{osc.mission || 'Não cadastrada'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Localização</p>
                          <p className="font-medium text-sm">{osc.location || 'Não cadastrada'}</p>
                      </div>
                      <div>
                          <p className="text-sm text-muted-foreground font-semibold uppercase mb-1">Fundação</p>
                          <p className="font-medium text-sm">{osc.foundationDate || 'Não cadastrada'}</p>
                      </div>
                  </div>
                  <div>
                      <p className="text-sm text-muted-foreground font-semibold uppercase mb-2">Atividades Principais</p>
                      <div className="flex flex-wrap gap-2">
                          {osc.coreActivities?.map((act, idx) => (
                              <span key={idx} className="bg-osc/10 text-osc px-2.5 py-1 rounded-md text-xs font-medium">
                                  {act}
                              </span>
                          ))}
                          {(!osc.coreActivities || osc.coreActivities.length === 0) && (
                              <span className="text-sm text-muted-foreground">Nenhuma atividade listada</span>
                          )}
                      </div>
                  </div>
              </div>
            </div>
        </div>

        <div className="space-y-6">
            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6 flex flex-col items-center text-center">
                <Search className="w-12 h-12 text-brand-orange mb-4" />
                <h3 className="font-bold text-lg mb-2">Busca Autônoma (Sniper)</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    A IA criará queries otimizadas baseadas no perfil desta OSC e buscará ativamente editais na web.
                </p>
                <Button
                    onClick={handleRunAgenticSearch}
                    disabled={isAgenticRunning}
                    className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white"
                >
                    {isAgenticRunning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
                    Executar Busca Agêntica
                </Button>

                {agenticResult && (
                  <div className={`mt-4 w-full p-3 rounded-md border text-left flex items-start ${
                    agenticResult.type === 'success'
                      ? 'bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400'
                      : 'bg-destructive/10 border-destructive/50 text-destructive'
                  }`}>
                    {agenticResult.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    )}
                    <p className="text-xs font-medium leading-tight">{agenticResult.message}</p>
                  </div>
                )}
            </div>

            <div className="bg-card text-card-foreground rounded-lg border shadow-sm p-6">
                <h3 className="font-bold text-lg mb-4">Matches Encontrados</h3>
                <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/admin/matches?oscId=${osc.id}`)}
                >
                    Ver Matches Desta OSC
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
}
