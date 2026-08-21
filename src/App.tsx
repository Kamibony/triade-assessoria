import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Hero } from './components/sections/Hero';
import { Problem } from './components/sections/Problem';
import { Solution } from './components/sections/Solution';
import { Comparison } from './components/sections/Comparison';
import { Authority } from './components/sections/Authority';
import { SocialProof } from './components/sections/SocialProof';
import { FAQ } from './components/sections/FAQ';
import { Footer } from './components/sections/Footer';
import { FloatingWhatsApp } from './components/ui/FloatingWhatsApp';
import { MagicEligibility } from './components/MagicEligibility';
import { EditaisList } from './components/EditaisList';
import { NgoMatchView } from './components/NgoMatchView';
import { MatchesDashboard } from './components/MatchesDashboard';

function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="py-4 px-6 border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold tracking-tighter">TRÍADE<span className="text-primary">.</span></Link>
        <nav className="flex gap-4">
          {!isHome && <Link to="/" className="text-sm font-medium hover:text-primary transition-colors">Início</Link>}
          <Link to="/dashboard" className="text-sm font-medium hover:text-primary transition-colors">Dashboard</Link>
          <Link to="/editais" className="text-sm font-medium hover:text-primary transition-colors">Ver Editais</Link>
        </nav>
      </div>
    </header>
  );
}

function LandingPage() {
  return (
    <main>
      <Hero />
      <MagicEligibility />
      <Problem />
      <Solution />
      <Comparison />
      <Authority />
      <SocialProof />
      <FAQ />
    </main>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans flex flex-col">
        <Header />
        <div className="flex-grow">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/editais" element={<EditaisList />} />
            <Route path="/match/:editalId" element={<NgoMatchView />} />
            <Route path="/dashboard" element={<MatchesDashboard />} />
          </Routes>
        </div>
        <Footer />
        <FloatingWhatsApp />
      </div>
    </Router>
  );
}

export default App;
