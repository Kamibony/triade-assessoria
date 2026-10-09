import { Link } from 'react-router-dom';
import { Heart, Briefcase, Shield, ArrowRight, AlertTriangle } from 'lucide-react';

export function WelcomeHub() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-16 px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
          Bem-vindo à Tríade-Assessoria
        </h1>
        <p className="text-xl text-muted-foreground">
          Escolha seu perfil para começar a explorar nossa plataforma de captação de recursos e inteligência de editais.
        </p>
      </div>

      {/* Demo Mode Banner */}
      <div className="max-w-4xl w-full mb-12 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 flex flex-col md:flex-row items-start md:items-center gap-4 text-yellow-800 dark:text-yellow-200">
        <div className="flex-shrink-0 bg-yellow-500/20 p-3 rounded-full">
          <AlertTriangle className="h-6 w-6 text-yellow-700 dark:text-yellow-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
            🚧 Modo de Demonstração Interativa
          </h3>
          <p className="text-sm opacity-90 leading-relaxed">
            Bem-vindo! Para fins de auditoria de segurança e apresentação pública, a plataforma está operando temporariamente em modo de leitura (read-only). Você pode navegar livremente pelas interfaces, acessar os painéis e conhecer nosso design. No entanto, os processos reais de backend e integrações com Inteligência Artificial estão desativados. Sinta-se à vontade para explorar!
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">

        {/* OSC Card */}
        <div className="flex flex-col bg-card border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow hover:bg-accent/50 relative overflow-hidden group">
          <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Heart className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-card-foreground">OSC (Organização)</h2>
          <p className="text-muted-foreground flex-grow mb-8">
            Acesse seu portal dedicado para descobrir os editais que dão match com sua causa.
          </p>
          <div className="mt-auto flex flex-col space-y-4">
            <Link
              to="/portal"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Acessar Portal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <p className="text-xs text-center text-muted-foreground">
              Leia o <a href="https://drive.google.com/file/d/1C4OQPDETrX10SWlRA0qC9X28JQ05Bflx/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Cliente</a>
            </p>
          </div>
        </div>

        {/* Captador Card */}
        <div className="flex flex-col bg-card border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow hover:bg-accent/50 relative overflow-hidden group">
          <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Briefcase className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-card-foreground">Captador (Agência)</h2>
          <p className="text-muted-foreground flex-grow mb-8">
            Gerencie o portfólio de OSCs, alterne entre perfis e utilize a IA para escrever propostas vencedoras.
          </p>
          <div className="mt-auto flex flex-col space-y-4">
            <Link
              to="/portal"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Acessar Painel
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <p className="text-xs text-center text-muted-foreground">
              Leia o <a href="https://drive.google.com/file/d/1EfxsB0ZoWRvlWZFzEdRedun6i8mfA2yZ/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Captador</a>
            </p>
          </div>
        </div>

        {/* Administrador Card */}
        <div className="flex flex-col bg-card border rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow hover:bg-accent/50 relative overflow-hidden group">
          <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-card-foreground">Administrador</h2>
          <p className="text-muted-foreground flex-grow mb-8">
            Controle total. Acione o Radar de Ingestão, gerencie o banco de editais e valide as recomendações da IA.
          </p>
          <div className="mt-auto flex flex-col space-y-4">
            <Link
              to="/admin"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Acessar Admin
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <p className="text-xs text-center text-muted-foreground">
              Leia o <a href="https://drive.google.com/file/d/1VIv59FHTDEh84AHvaSDveL_I5ffczWHi/view?usp=sharing" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Administrador</a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
