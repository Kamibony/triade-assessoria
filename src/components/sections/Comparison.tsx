
import { X, Check } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

export function Comparison() {
  const standard = [
    "Apenas doações pontuais",
    "Risco de irregularidades fiscais",
    "Gestores sobrecarregados",
    "Falta de transparência documentada",
    "Incerteza no pagamento da equipe"
  ];

  const triade = [
    "Captação contínua e previsível",
    "Tranquilidade jurídica e fiscal",
    "Equipe focada no impacto",
    "Governança clara e atrativa",
    "Sustentabilidade a longo prazo"
  ];

  return (
    <section className="py-20 bg-secondary/20">
      <div className="container px-4 md:px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Qual o futuro da sua OSC?</h2>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <ScrollReveal delay={100}>
            <div className="bg-card/50 border border-border p-8 rounded-2xl">
              <h3 className="text-xl font-semibold mb-6 text-muted-foreground flex items-center justify-center">
                A realidade padrão
              </h3>
              <ul className="space-y-4">
                {standard.map((item, i) => (
                  <li key={i} className="flex items-center text-muted-foreground">
                    <span className="mr-4 flex-shrink-0 bg-destructive/10 p-1 rounded-full">
                      <X className="h-4 w-4 text-destructive" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="bg-primary/5 border border-primary/20 p-8 rounded-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full -z-10" />
              <h3 className="text-xl font-bold mb-6 text-primary flex items-center justify-center">
                Com a Tríade Assessoria
              </h3>
              <ul className="space-y-4">
                {triade.map((item, i) => (
                  <li key={i} className="flex items-center text-foreground font-medium">
                    <span className="mr-4 flex-shrink-0 bg-primary/20 p-1 rounded-full">
                      <Check className="h-4 w-4 text-primary" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
