import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getDoc, doc, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { matchSchema, editalSchema } from '../../../shared/schemas';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import { Calendar as CalendarIcon, Briefcase, FileText, ChevronRight } from 'lucide-react';
import { z } from 'zod';
import { useActiveOsc } from '../../contexts/portal/ActiveOscContext';
import { Link } from 'react-router-dom';

type Match = z.infer<typeof matchSchema> & { id: string };
type Edital = z.infer<typeof editalSchema> & { id: string };

type EnrichedMatch = Match & {
  edital?: Edital;
};

export function CacadorClientView() {
  const { activeOscId } = useActiveOsc();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [groupedMatches, setGroupedMatches] = useState<Record<string, EnrichedMatch[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);

        const matchesRef = collection(db, 'matches');
        // Query without inequality to avoid composite index requirements
        const matchQ = query(
          matchesRef,
          where('oscId', '==', activeOscId),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end)),
          orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(matchQ);

        // Filter out hard rejections and zero scores locally
        const allMatches = querySnapshot.docs
          .map(d => ({ id: d.id, ...d.data() } as Match))
          .filter(m => m.matchScore > 0 && m.actionState !== 'Rejeitado');

        allMatches.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date();
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date();
            return dateB.getTime() - dateA.getTime();
        });

        const enriched = await Promise.all(allMatches.map(async (match) => {
          if (!match.editalId) return match as EnrichedMatch;
          const editalSnap = await getDoc(doc(db, 'editais', match.editalId));
          if (editalSnap.exists()) {
             return { ...match, edital: { id: editalSnap.id, ...editalSnap.data() } as Edital } as EnrichedMatch;
          }
          return match as EnrichedMatch;
        }));

        // Group by date (yyyy-MM-dd)
        const grouped: Record<string, EnrichedMatch[]> = {};
        enriched.forEach(match => {
          const date = match.createdAt?.toDate ? match.createdAt.toDate() : new Date();
          const dateStr = format(date, 'yyyy-MM-dd');
          if (!grouped[dateStr]) grouped[dateStr] = [];
          grouped[dateStr].push(match);
        });

        setGroupedMatches(grouped);
      } catch (error) {
        console.error("Error fetching Cacador Client data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (activeOscId) {
      fetchData();
    }
  }, [activeOscId, selectedDate]);

  const dates = Object.keys(groupedMatches).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (!activeOscId) {
    return (
      <div className="flex justify-center items-center h-64 text-muted-foreground">
        Selecione uma OSC para visualizar as descobertas.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Descobertas de Hoje</h1>
          <p className="text-muted-foreground mt-2 text-lg">
            Nosso radar varre milhares de editais diariamente e separa as melhores oportunidades para sua OSC.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-background border p-2 rounded-lg shrink-0">
          <CalendarIcon className="w-5 h-5 text-muted-foreground" />
          <DatePicker
            selected={selectedDate}
            onChange={(date: Date | null) => { if (date) setSelectedDate(date); }}
            dateFormat="dd/MM/yyyy"
            locale={ptBR}
            className="bg-transparent border-none outline-none text-sm font-medium w-24 cursor-pointer"
          />
        </div>
      </div>

      {loading ? (
         <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
         </div>
      ) : dates.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-dashed">
          <FileText className="mx-auto h-16 w-16 text-muted-foreground/30 mb-6" />
          <h3 className="text-xl font-medium mb-2">Radar limpo por enquanto</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Ainda não encontramos oportunidades altamente compatíveis. Nosso Caçador continua monitorando novos editais 24/7.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {dates.map(dateStr => {
            const dateObj = new Date(`${dateStr}T12:00:00`); // mid-day to avoid timezone shifting
            const matches = groupedMatches[dateStr];

            return (
              <div key={dateStr} className="relative">
                {/* Timeline Line */}
                <div className="absolute top-8 bottom-0 left-[23px] w-px bg-border -z-10 hidden sm:block"></div>

                <div className="flex items-center gap-4 mb-6 sticky top-0 bg-background/95 backdrop-blur z-10 py-4">
                   <div className="bg-primary/10 text-primary w-12 h-12 rounded-full flex items-center justify-center shrink-0 border border-primary/20">
                      <CalendarIcon className="w-5 h-5" />
                   </div>
                   <h2 className="text-xl font-semibold capitalize">
                     {format(dateObj, "EEEE, d 'de' MMMM", { locale: ptBR })}
                   </h2>
                </div>

                <div className="space-y-4 sm:ml-16">
                  {matches.map(match => {
                     const isHighMatch = match.matchScore >= 75;

                     return (
                        <div key={match.id} className="group bg-card border hover:border-primary/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                           <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:gap-8">

                              <div className="flex-1 space-y-4">
                                 <div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium border">
                                            {match.edital?.issuer || 'Emissor'}
                                        </span>
                                        {match.badges && match.badges.slice(0,2).map(b => (
                                           <span key={b} className="text-xs text-muted-foreground px-2 py-0.5 rounded-full border border-dashed">
                                              {b}
                                           </span>
                                        ))}
                                    </div>
                                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
                                        {match.edital?.title || 'Edital Desconhecido'}
                                    </h3>
                                 </div>

                                 <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg w-fit">
                                    {match.edital?.totalBudget != null && (
                                       <span className="flex items-center gap-1.5 font-medium text-foreground">
                                          <Briefcase className="w-4 h-4 text-emerald-600"/>
                                          R$ {match.edital.totalBudget.toLocaleString('pt-BR')}
                                       </span>
                                    )}
                                    <span>•</span>
                                    <span className="flex items-center gap-1.5">
                                       <CalendarIcon className="w-4 h-4"/>
                                       Prazo: {match.edital?.deadline ? format(new Date(match.edital.deadline), 'dd/MM/yyyy') : 'Fluxo Contínuo'}
                                    </span>
                                 </div>

                                 <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 mt-4">
                                    <p className="text-sm leading-relaxed text-foreground/90">
                                       <span className="font-semibold text-primary mr-1">Por que escolhemos isso:</span>
                                       {match.aiRationale || match.reasoning || "Encontramos forte alinhamento com o perfil da sua OSC."}
                                    </p>
                                 </div>
                              </div>

                              <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-8 md:w-48 shrink-0">
                                 <div className="text-center md:text-right">
                                    <div className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Match Score</div>
                                    <div className={`text-4xl font-black ${isHighMatch ? 'text-emerald-600' : match.matchScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                       {match.matchScore}%
                                    </div>
                                 </div>
                                 <Link
                                    to={`/portal/discover?search=${match.editalId}`}
                                    className="mt-0 md:mt-6 bg-primary text-primary-foreground px-5 py-2.5 rounded-full text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                                 >
                                    Ver Detalhes
                                    <ChevronRight className="w-4 h-4" />
                                 </Link>
                              </div>

                           </div>
                        </div>
                     );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
