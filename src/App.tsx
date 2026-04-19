
import { Hero } from './components/sections/Hero';
import { Problem } from './components/sections/Problem';
import { Solution } from './components/sections/Solution';
import { Comparison } from './components/sections/Comparison';
import { Authority } from './components/sections/Authority';
import { SocialProof } from './components/sections/SocialProof';
import { FAQ } from './components/sections/FAQ';
import { Footer } from './components/sections/Footer';
import { FloatingWhatsApp } from './components/ui/FloatingWhatsApp';

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground font-sans">
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Comparison />
        <Authority />
        <SocialProof />
        <FAQ />
      </main>
      <Footer />
      <FloatingWhatsApp />
    </div>
  );
}

export default App;
