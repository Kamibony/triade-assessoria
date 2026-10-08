import { BrowserRouter as Router, Routes, Route, Link, useLocation, Outlet } from 'react-router-dom';
import { Footer } from './components/sections/Footer';
import { FloatingWhatsApp } from './components/ui/FloatingWhatsApp';
import { EditaisList } from './components/EditaisList';
import { NgoMatchView } from './components/NgoMatchView';
import { MatchesDashboard } from './components/MatchesDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLayout } from './components/AdminLayout';
import { OscDirectoryView } from './components/OscDirectoryView';
import { OscImporter } from './components/OscImporter';
import { OscProfileView } from './components/OscProfileView';
import { ManualIngest } from './components/ManualIngest';
import { CacadorAdminDashboard } from './components/CacadorAdminDashboard';
import { ScrapingTargetsManager } from './components/ScrapingTargetsManager';
import { IngestionRadar } from './components/IngestionRadar';
import { ManualOscIngest } from './components/ManualOscIngest';
import { PortalOnboarding } from './components/portal/PortalOnboarding';
import { Login } from './components/Login';
import { PortalLayout } from './components/portal/PortalLayout';
import { PortalWelcome } from './components/portal/PortalWelcome';
import { PortalDiscover } from './components/portal/PortalDiscover';
import { CacadorClientView } from './components/portal/CacadorClientView';
import { WelcomeHub } from './components/WelcomeHub';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from 'react-hot-toast';

function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="py-4 px-6 border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold tracking-tighter">TRÍADE<span className="text-primary">.</span></Link>
        <nav className="flex gap-4">
          {!isHome && <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">Início</Link>}
        </nav>
      </div>
    </header>
  );
}

function PublicLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans flex flex-col">
      <Header />
      <div className="flex-grow">
        <Outlet />
      </div>
      <Footer />
      <FloatingWhatsApp />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<PortalWelcome />} />
            <Route path="discover" element={<PortalDiscover />} />
            <Route path="onboarding" element={<PortalOnboarding />} />
            <Route path="cacador" element={<CacadorClientView />} />
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="cacador" element={<CacadorAdminDashboard />} />
            <Route path="directory" element={<OscDirectoryView />} />
            <Route path="import-oscs" element={<OscImporter />} />
            <Route path="import-osc-manual" element={<ManualOscIngest />} />
            <Route path="directory/:oscId" element={<OscProfileView />} />
            <Route path="manual-ingest" element={<ManualIngest />} />
            <Route path="matches" element={<MatchesDashboard />} />
            <Route path="editais" element={<EditaisList />} />
            <Route path="sources" element={<ScrapingTargetsManager />} />
            <Route path="ingestion-radar" element={<IngestionRadar />} />
          </Route>

          <Route path="/" element={<PublicLayout />}>
            <Route index element={<WelcomeHub />} />
            <Route path="match/:editalId" element={<NgoMatchView />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
