
import { Star } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';

export function SocialProof() {
  const testimonials = [
    {
      quote: "Antes da Tríade, vivíamos com o coração na mão esperando o dinheiro entrar. Hoje temos processos claros e segurança de que os salários da nossa equipe serão pagos.",
      author: "Maria Silva",
      role: "Diretora da OSC Instituto Esperança",
      initials: "MS"
    },
    {
      quote: "Eles organizaram nosso estatuto e nos prepararam para receber fundos internacionais. Um investimento que se pagou no primeiro edital que vencemos.",
      author: "Carlos Santos",
      role: "Fundador do Projeto Futuro",
      initials: "CS"
    }
  ];

  return (
    <section className="py-20 bg-secondary/30">
      <div className="container px-4 md:px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Quem já estruturou sua captação</h2>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {testimonials.map((item, index) => (
            <ScrollReveal key={index} delay={index * 200}>
              <div className="bg-card border border-border p-8 rounded-2xl flex flex-col h-full">
                <div className="flex text-primary mb-6">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
                <p className="text-lg mb-8 flex-grow italic text-muted-foreground">
                  "{item.quote}"
                </p>
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {item.initials}
                  </div>
                  <div>
                    <p className="font-semibold">{item.author}</p>
                    <p className="text-sm text-muted-foreground">{item.role}</p>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
