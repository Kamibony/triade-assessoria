
import { Button } from '../ui/Button';
import { WHATSAPP_LINK } from '../../lib/constants';
import { ScrollReveal } from '../ui/ScrollReveal';

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24 lg:pt-40 lg:pb-32">
      <div className="container px-4 md:px-6 relative z-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          <div className="flex flex-col justify-center space-y-8">
            <ScrollReveal>
              <div className="space-y-4">
                <div className="inline-flex items-center rounded-lg bg-muted px-3 py-1 text-sm font-medium">
                  <span className="text-primary mr-2">✦</span>
                  Assessoria Especializada para OSCs
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl xl:text-6xl/none">
                  Estruture a captação da sua ONG de forma segura e previsível
                </h1>
                <p className="max-w-[600px] text-muted-foreground md:text-xl">
                  Pare de depender apenas de doações esporádicas. Construímos estratégias sólidas, com segurança jurídica e metodologias validadas para escalar o impacto da sua organização.
                </p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={200}>
              <div className="flex flex-col gap-4 sm:flex-row">
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full text-base font-semibold">
                    Falar com um Especialista
                  </Button>
                </a>
              </div>
            </ScrollReveal>
          </div>
          <ScrollReveal delay={400} className="mx-auto w-full max-w-[500px] lg:max-w-none">
            <div className="aspect-square relative overflow-hidden rounded-2xl bg-secondary border border-border">
              {/* Image Placeholder */}
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground flex-col gap-4">
                 <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                 <span className="text-sm font-medium">Placeholder Imagem Profissional</span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>

      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] pointer-events-none -z-10" />
    </section>
  );
}
