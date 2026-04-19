import { useState } from "react";

import { ChevronDown } from 'lucide-react';
import { ScrollReveal } from '../ui/ScrollReveal';
import { cn } from '../../lib/utils';

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onClick: () => void;
}

function AccordionItem({ question, answer, isOpen, onClick }: AccordionItemProps) {
  return (
    <div className="border-b border-border">
      <button
        className="flex w-full items-center justify-between py-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
        onClick={onClick}
        aria-expanded={isOpen}
      >
        <span className="text-lg font-medium">{question}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-muted-foreground transition-transform duration-200",
            isOpen ? "rotate-180" : ""
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-96 opacity-100 pb-6" : "max-h-0 opacity-0"
        )}
      >
        <p className="text-muted-foreground">{answer}</p>
      </div>
    </div>
  );
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: "Para quem é a assessoria da Tríade?",
      answer: "Para Organizações da Sociedade Civil (OSCs, ONGs, Institutos, Fundações) que desejam sair da informalidade ou dependência de doações pontuais e criar um departamento de captação de recursos profissional, seguro e recorrente."
    },
    {
      question: "Minha ONG ainda é pequena, posso contratar?",
      answer: "Sim. Inclusive, estruturar a base jurídica e de captação no início é o que garante um crescimento saudável e evita multas e problemas fiscais no futuro."
    },
    {
      question: "Vocês captam recursos para nós?",
      answer: "Nós não somos captadores de comissão. Nós estruturamos a sua organização (jurídico, governança e estratégias) e treinamos a sua equipe para que vocês mesmos tenham a autonomia e a capacidade de captar de forma previsível e contínua."
    },
    {
      question: "Como funciona o processo de contratação?",
      answer: "O primeiro passo é clicar no botão do WhatsApp e falar com nossa equipe. Faremos um diagnóstico inicial gratuito para entender o seu momento atual e sugerir a melhor trilha de assessoria para a sua OSC."
    }
  ];

  return (
    <section className="py-24">
      <div className="container px-4 md:px-6">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Perguntas Frequentes</h2>
          </div>
        </ScrollReveal>

        <div className="max-w-3xl mx-auto">
          <ScrollReveal delay={100}>
            <div className="divide-y divide-border">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openIndex === index}
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                />
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
