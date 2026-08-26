import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, ArrowLeft, FileText, CheckSquare } from 'lucide-react';

export function AdminLayout() {
  const location = useLocation();

  const navGroups = [
    {
      title: 'VISÃO GERAL & MONITORAMENTO',
      items: [
        { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
        { name: 'Matriz de Matches Global', path: '/admin/matches', icon: CheckSquare },
        { name: 'Diretório de Editais', path: '/admin/editais', icon: FileText },
      ],
    },
    {
      title: 'REDE DE OSCS',
      items: [
        { name: 'Diretório de OSCs', path: '/admin/directory', icon: Database },
        { name: 'Onboarding VIP', path: '/admin/import-osc-manual', icon: CheckSquare },
        { name: 'Importação em Massa', path: '/admin/import-oscs', icon: Database },
      ],
    },
    {
      title: 'ECOSSISTEMA DE DADOS',
      items: [
        { name: 'Fontes de Dados', path: '/admin/sources', icon: Database },
        { name: 'Ingestão Manual', path: '/admin/manual-ingest', icon: Database },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col h-full sticky top-0 overflow-hidden">
        <div className="p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-bold tracking-tighter">TRÍADE<span className="text-primary">.</span> <span className="text-muted-foreground font-normal text-sm ml-1">Admin</span></h2>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto space-y-6">
          {navGroups.map((group) => (
            <div key={group.title}>
              <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar para o site
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
