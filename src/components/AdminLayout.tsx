import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Database, Search, ArrowLeft, FileText, CheckSquare } from 'lucide-react';

export function AdminLayout() {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Diretório de OSCs', path: '/admin/directory', icon: Database },
    { name: 'Fontes de Dados', path: '/admin/sources', icon: Database },
    { name: 'Busca Autônoma', path: '/admin/search', icon: Search },
    { name: 'Dashboard de Matches', path: '/admin/matches', icon: CheckSquare },
    { name: 'Editais', path: '/admin/editais', icon: FileText },
  ];

  return (
    <div className="flex h-screen bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col h-full sticky top-0">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold tracking-tighter">TRÍADE<span className="text-primary">.</span> <span className="text-muted-foreground font-normal text-sm ml-1">Admin</span></h2>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
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
