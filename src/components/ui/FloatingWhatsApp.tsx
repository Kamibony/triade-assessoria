
import { MessageCircle } from 'lucide-react';
import { WHATSAPP_LINK } from '../../lib/constants';

export function FloatingWhatsApp() {
  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_15px_rgba(255,106,0,0.5)] transition-transform hover:scale-110 hover:shadow-[0_0_25px_rgba(255,106,0,0.8)] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
      aria-label="Falar conosco no WhatsApp"
    >
      <MessageCircle size={28} />
    </a>
  );
}
