import React, { useEffect, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, FileText, Building2, Plus, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, documentId, getDocs } from 'firebase/firestore';

export const PortalWelcome: React.FC = () => {
  const { oscIds } = useOutletContext<{ oscIds: string[] }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [oscs, setOscs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOscs = async () => {
      if (!oscIds || oscIds.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const oscsData: any[] = [];
        // Handle firestore 'in' limit of 10
        for (let i = 0; i < oscIds.length; i += 10) {
          const chunk = oscIds.slice(i, i + 10);
          const q = query(collection(db, 'oscs'), where(documentId(), 'in', chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach(doc => {
            oscsData.push({ id: doc.id, ...doc.data() });
          });
        }
        setOscs(oscsData);
      } catch (error) {
        console.error("Error fetching OSCs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOscs();
  }, [oscIds]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8 px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4 max-w-2xl"
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          Bem-vindo ao Portal <span className="text-primary">Tríade</span>
        </h1>
        <p className="text-xl text-muted-foreground">
          Sua plataforma inteligente para captação de recursos e inteligência de editais.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="bg-card border shadow-lg rounded-2xl p-8 max-w-4xl w-full space-y-8"
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Olá, {user?.email?.split('@')[0] || 'Usuário'}</h2>
          <p className="text-muted-foreground">
            {oscIds.length > 0 ? 'Selecione uma organização para acessar o painel ou adicione uma nova.' : 'O que você gostaria de fazer hoje?'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : oscIds.length > 0 ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              {oscs.map((osc) => (
                <div key={osc.id} className="border rounded-xl p-6 flex flex-col justify-between hover:border-primary/50 transition-colors bg-muted/20">
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-primary">
                       <Building2 className="w-5 h-5" />
                       <h3 className="font-bold text-lg line-clamp-1" title={osc.name}>{osc.name || 'OSC sem nome'}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">CNPJ: {osc.cnpj}</p>
                  </div>
                  <Button
                    className="w-full group relative overflow-hidden"
                    onClick={() => navigate(`/portal/discover?oscId=${osc.id}`)}
                  >
                    <div className="absolute inset-0 bg-primary/10 group-hover:bg-transparent transition-colors" />
                    Acessar Painel
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              ))}

              <button
                onClick={() => navigate('/portal/onboarding')}
                className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[160px]"
              >
                <Plus className="w-8 h-8 mb-2" />
                <span className="font-medium">Adicionar Nova OSC</span>
                <span className="text-sm opacity-80">(Fast-Track CNPJ)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-md mx-auto">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4 rounded-lg text-left">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                Para encontrarmos os melhores editais, precisamos conhecer sua OSC.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full text-lg py-6 group"
              onClick={() => navigate('/portal/onboarding')}
            >
              <FileText className="w-5 h-5 mr-2" />
              Completar Perfil (Onboarding)
              <ArrowRight className="w-5 h-5 ml-auto group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
