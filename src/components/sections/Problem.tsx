
import { AlertTriangle, TrendingDown, Clock } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

export function Problem() {
  const painPoints = [
    {
      icon: <TrendingDown className="h-8 w-8 text-primary" />,
      title: "Insegurança Financeira",
      description: "A dependência de doações esporádicas e editais pontuais impede o planejamento a longo prazo da sua organização."
    },
    {
      icon: <AlertTriangle className="h-8 w-8 text-primary" />,
      title: "Riscos Jurídicos",
      description: "Falta de adequação na captação de recursos e conformidade com as legislações vigentes para o Terceiro Setor."
    },
    {
      icon: <Clock className="h-8 w-8 text-primary" />,
      title: "Sobrecarga da Equipe",
      description: "Gestores assumindo funções que não dominam, perdendo o foco no impacto real que a ONG deveria causar."
    }
  ];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4 md:px-6">
        <ScrollReveal>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">A realidade dolorosa de muitas OSCs</h2>
            <p className="text-lg text-muted-foreground">
              Sem uma captação estruturada, o propósito da sua ONG corre riscos diários.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-8">
          {painPoints.map((point, index) => (
            <ScrollReveal key={index} delay={index * 150}>
              <div className="bg-card border border-border p-8 rounded-xl h-full transition-transform hover:-translate-y-1">
                <div className="mb-6 inline-flex p-4 rounded-lg bg-primary/10">
                  {point.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{point.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {point.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
