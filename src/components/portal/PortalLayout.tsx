import React, { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Home, Search, PlusCircle, Loader2 } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export const PortalLayout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [oscIds, setOscIds] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUserOscIds = async () => {
      if (!user) {
        setIsChecking(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.oscIds && Array.isArray(userData.oscIds)) {
             setOscIds(userData.oscIds);
          } else if (userData.oscId) {
             setOscIds([userData.oscId]);
          }
        }
      } catch (error) {
        console.error("Error checking user oscIds:", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUserOscIds();
  }, [user]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans flex flex-col md:flex-row">

      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-background border-r flex-shrink-0 hidden md:flex flex-col h-screen sticky top-0">
        <div className="p-6 border-b">
          <Link to="/portal" className="text-xl font-bold tracking-tighter">
            TRÍADE<span className="text-primary">.</span> <span className="text-sm font-normal text-muted-foreground ml-2">Portal</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <Link to="/portal" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <Home className="w-4 h-4" />
            Dashboard Hub
          </Link>
          <Link to="/portal/discover" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <Search className="w-4 h-4" />
            Descobrir Editais
          </Link>
          <Link to="/portal/onboarding" className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            <PlusCircle className="w-4 h-4" />
            Adicionar OSC
          </Link>
        </nav>

        <div className="p-4 border-t">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground truncate" title={user?.email || ''}>
              {user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Mobile Header */}
        <header className="md:hidden py-4 px-6 border-b bg-background sticky top-0 z-50 flex justify-between items-center shadow-sm">
          <Link to="/portal" className="text-lg font-bold tracking-tighter">
            TRÍADE<span className="text-primary">.</span>
          </Link>
          <button
             onClick={handleLogout}
             className="text-sm flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
             <LogOut className="w-4 h-4" /> Sair
          </button>
        </header>

        <main className="flex-grow container mx-auto px-4 py-8 w-full max-w-7xl">
          <Outlet context={{ oscIds }} />
        </main>

        <footer className="py-6 text-center text-sm text-muted-foreground border-t bg-background">
          &copy; {new Date().getFullYear()} Tríade Assessoria. Todos os direitos reservados.
        </footer>
      </div>
    </div>
  );
};
