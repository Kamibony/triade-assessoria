import { Link } from 'react-router-dom';
import { Heart, Briefcase, Shield, ArrowRight } from 'lucide-react';

export function WelcomeHub() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-16 px-4 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
          Bem-vindo à Tríade-Assessoria
        </h1>
        <p className="text-xl text-muted-foreground">
          Escolha seu perfil para começar a explorar nossa plataforma de captação de recursos e inteligência de editais.
        </p>
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
              to="/"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Acessar Portal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <p className="text-xs text-center text-muted-foreground">
              Leia o <a href="https://github.com/SeuRepoAqui/blob/main/MANUAL_DO_CLIENTE.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Cliente</a>
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
              to="/"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
            >
              Acessar Painel
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <p className="text-xs text-center text-muted-foreground">
              Leia o <a href="https://github.com/SeuRepoAqui/blob/main/MANUAL_DO_CAPTADOR.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Captador</a>
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
              Leia o <a href="https://github.com/SeuRepoAqui/blob/main/MANUAL_DO_ADMINISTRADOR.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Manual do Administrador</a>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
