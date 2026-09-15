import React, { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogOut, Loader2 } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export const PortalLayout: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [oscId, setOscId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkUserOscId = async () => {
      if (!user) {
        setIsChecking(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.oscId) {
            setOscId(userData.oscId);
          }
        }
      } catch (error) {
        console.error("Error checking user oscId:", error);
      } finally {
        setIsChecking(false);
      }
    };

    checkUserOscId();
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
    <div className="min-h-screen bg-muted/10 text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans flex flex-col">
      <header className="py-4 px-6 border-b bg-background sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto flex justify-between items-center max-w-6xl">
          <Link to="/portal/discover" className="text-xl font-bold tracking-tighter">
            TRÍADE<span className="text-primary">.</span> <span className="text-sm font-normal text-muted-foreground ml-2">Portal</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-muted-foreground hidden sm:block">
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
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 max-w-6xl">
        <Outlet context={{ oscId }} />
      </main>

      <footer className="py-6 text-center text-sm text-muted-foreground border-t bg-background">
        &copy; {new Date().getFullYear()} Tríade Assessoria. Todos os direitos reservados.
      </footer>
    </div>
  );
};
