import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Search, FileText } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuth } from '../../contexts/AuthContext';

export const PortalWelcome: React.FC = () => {
  const { oscId } = useOutletContext<{ oscId: string | null }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-8 px-4">
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
        className="bg-card border shadow-lg rounded-2xl p-8 max-w-md w-full space-y-6"
      >
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Olá, {user?.email?.split('@')[0] || 'Usuário'}</h2>
          <p className="text-muted-foreground">O que você gostaria de fazer hoje?</p>
        </div>

        <div className="space-y-4">
          {oscId ? (
            <Button
              size="lg"
              className="w-full text-lg py-6 group relative overflow-hidden"
              onClick={() => navigate('/portal/discover')}
            >
              <div className="absolute inset-0 bg-primary/10 group-hover:bg-transparent transition-colors" />
              <Search className="w-5 h-5 mr-2" />
              Explorar Oportunidades
              <ArrowRight className="w-5 h-5 ml-auto group-hover:translate-x-1 transition-transform" />
            </Button>
          ) : (
            <div className="space-y-4">
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
        </div>
      </motion.div>
    </div>
  );
};
