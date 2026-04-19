
import { ScrollReveal } from '../ui/ScrollReveal';

export function Authority() {
  return (
    <section className="py-24">
      <div className="container px-4 md:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
          <ScrollReveal>
            <div className="aspect-[4/5] relative overflow-hidden rounded-3xl bg-secondary border border-border mx-auto max-w-md lg:max-w-none w-full">
               {/* Image Placeholder */}
               <div className="absolute inset-0 flex items-center justify-center text-muted-foreground flex-col gap-4 bg-muted/50">
                 <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20a6 6 0 0 0-12 0"/><circle cx="12" cy="10" r="4"/><circle cx="12" cy="12" r="10"/></svg>
                 <span className="text-sm font-medium">Foto do Especialista / Fundador</span>
              </div>
            </div>
          </ScrollReveal>

          <div className="flex flex-col justify-center space-y-6">
            <ScrollReveal delay={200}>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Quem guiará sua organização?</h2>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
                <p>
                  A <strong className="text-foreground">Tríade Assessoria</strong> nasceu da necessidade de profissionalizar o terceiro setor no Brasil, unindo expertise jurídica com visão estratégica de mercado.
                </p>
                <p>
                  Com anos de experiência ajudando ONGs a estruturarem seus departamentos de captação de recursos, nossa missão é simples: garantir que projetos que transformam vidas não fechem as portas por falta de dinheiro ou por falhas na documentação.
                </p>
                <p>
                  Nós entendemos a burocracia brasileira e sabemos exatamente o que os grandes financiadores e editais exigem para liberar recursos.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </div>
    </section>
  );
}
