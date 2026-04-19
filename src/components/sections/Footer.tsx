
import { Button } from '../ui/Button';
import { WHATSAPP_LINK } from '../../lib/constants';
import { ScrollReveal } from '../ui/ScrollReveal';

export function Footer() {
  return (
    <footer className="bg-card border-t border-border pt-20 pb-10">
      <div className="container px-4 md:px-6">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 mb-16">
          <div className="lg:col-span-2 space-y-6">
            <ScrollReveal>
              <h2 className="text-2xl font-bold">
                Tríade <span className="text-primary">Assessoria</span>
              </h2>
              <p className="text-muted-foreground mt-4 max-w-md">
                Estruturando a captação de recursos de Organizações da Sociedade Civil com segurança e previsibilidade.
              </p>
            </ScrollReveal>
          </div>

          <ScrollReveal delay={200} className="space-y-6 lg:col-span-2 flex flex-col md:items-end justify-center">
            <h3 className="text-xl font-semibold md:text-right">Pronto para transformar sua captação?</h3>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
              <Button size="lg" className="w-full text-base font-semibold">
                Agendar Diagnóstico Gratuito
              </Button>
            </a>
          </ScrollReveal>
        </div>

        <div className="border-t border-border/50 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Tríade Assessoria para OSCs. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-primary transition-colors">Política de Privacidade</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
