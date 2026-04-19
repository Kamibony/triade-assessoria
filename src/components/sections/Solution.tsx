
import { Search, ShieldCheck, Rocket } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

export function Solution() {
  const pillars = [
    {
      icon: <Search className="h-10 w-10 text-primary" />,
      title: "1. Diagnóstico e Estratégia",
      description: "Análise profunda da realidade atual da sua ONG para desenhar um plano de captação alinhado com seus objetivos reais."
    },
    {
      icon: <ShieldCheck className="h-10 w-10 text-primary" />,
      title: "2. Conformidade e Segurança",
      description: "Adequação jurídica completa (Estatutos, Certificações e Contratos) para captar recursos sem dores de cabeça com a Receita ou Ministério Público."
    },
    {
      icon: <Rocket className="h-10 w-10 text-primary" />,
      title: "3. Crescimento Escalável",
      description: "Implementação de processos, ferramentas e treinamentos para que a captação seja previsível e contínua mês após mês."
    }
  ];

  return (
    <section className="py-24 relative">
      <div className="container px-4 md:px-6">
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">A Metodologia Tríade</h2>
            <p className="text-lg text-muted-foreground">
              Uma abordagem sistemática apoiada em três pilares fundamentais para transformar a sua captação.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-12 md:gap-8">
          {pillars.map((pillar, index) => (
            <ScrollReveal key={index} delay={index * 200}>
              <div className="relative flex flex-col items-center text-center">
                {/* Decorative connector line on desktop */}
                {index !== pillars.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] border-t-2 border-dashed border-border -z-10" />
                )}

                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-secondary border-2 border-primary/20 shadow-[0_0_20px_rgba(255,106,0,0.1)]">
                  {pillar.icon}
                </div>
                <h3 className="text-xl font-bold mb-4">{pillar.title}</h3>
                <p className="text-muted-foreground">
                  {pillar.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
