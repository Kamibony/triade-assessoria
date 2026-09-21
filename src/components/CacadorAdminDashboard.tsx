import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { editalSchema, matchSchema } from '../../shared/schemas';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import DatePicker from 'react-datepicker';
import { ChevronDown, ChevronUp, Calendar as CalendarIcon, Briefcase, FileText } from 'lucide-react';
import { z } from 'zod';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { Loader2, RefreshCw } from 'lucide-react';


type Edital = z.infer<typeof editalSchema> & { id: string };
type Match = z.infer<typeof matchSchema> & { id: string, oscName?: string };

export function CacadorAdminDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [editais, setEditais] = useState<Edital[]>([]);
  const [matchesByEdital, setMatchesByEdital] = useState<Record<string, Match[]>>({});
  const [expandedEditalIds, setExpandedEditalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ type: 'success' | 'error', message: string } | null>(null);


  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);

      const editaisRef = collection(db, 'editais');
      const q = query(
        editaisRef,
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end))
      );

      const querySnapshot = await getDocs(q);
      const fetchedEditais = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Edital[];

      setEditais(fetchedEditais);

      const matchPromises = fetchedEditais.map(async (edital) => {
        const matchesRef = collection(db, 'matches');
        const matchQ = query(matchesRef, where('editalId', '==', edital.id), orderBy('matchScore', 'desc'));
        const matchSnapshot = await getDocs(matchQ);
        const matches = matchSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Match[];

        // Fetch OSC names for matches that might not have them (legacy)
        const enrichedMatches = await Promise.all(matches.map(async (match) => {
             if (!match.oscName) {
                 const oscDoc = await import('firebase/firestore').then(mod => mod.getDoc(mod.doc(db, 'oscs', match.oscId)));
                 if (oscDoc.exists()) {
                     return { ...match, oscName: oscDoc.data().name || 'Desconhecida' };
                 }
             }
             return match;
        }));

        return { editalId: edital.id, matches: enrichedMatches };
      });

      const matchesResults = await Promise.all(matchPromises);
      const newMatchesByEdital: Record<string, Match[]> = {};
      matchesResults.forEach(result => {
        newMatchesByEdital[result.editalId] = result.matches;
      });

      setMatchesByEdital(newMatchesByEdital);
    } catch (error) {
      console.error("Error fetching Cacador Admin data:", error);
    } finally {
      setLoading(false);
    }
  };


  const handleGenerateMatches = async () => {
    if (editais.length === 0) return;

    setIsGenerating(true);
    setGenerateResult(null);

    try {
      const editalIds = editais.map(e => e.id);
      const triggerMatches = httpsCallable(functions, 'triggerManualEditalMatches');
      const response = await triggerMatches({ editalIds });

      const data = response.data as any;
      if (data.success) {
        setGenerateResult({ type: 'success', message: data.message });
      } else {
        setGenerateResult({ type: 'error', message: data.message || 'Erro desconhecido.' });
      }
    } catch (error: any) {
      console.error("Error generating matches:", error);
      setGenerateResult({ type: 'error', message: error.message || 'Falha ao comunicar com o servidor.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleExpand = (editalId: string) => {
    setExpandedEditalIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(editalId)) {
        newSet.delete(editalId);
      } else {
        newSet.add(editalId);
      }
      return newSet;
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Caçador de OSCs</h1>
          <p className="text-muted-foreground mt-2">Visão Diária de Oportunidades e Matches Gerados</p>
        </div>
        <div className="flex items-center gap-2 bg-background border p-2 rounded-lg">
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


      <div className="flex justify-between items-center bg-muted/30 p-4 rounded-xl border">
        <div>
           <h3 className="font-semibold text-lg">Geração Manual de Matches</h3>
           <p className="text-sm text-muted-foreground">Dispare manualmente o motor de IA para cruzar os editais deste dia com o banco ativo de OSCs.</p>
        </div>
        <button
           onClick={handleGenerateMatches}
           disabled={isGenerating || editais.length === 0}
           className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isGenerating ? 'Processando...' : 'Gerar Matches para Editais do Dia'}
        </button>
      </div>

      {generateResult && (
        <div className={`p-4 rounded-xl border ${generateResult.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          {generateResult.message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : editais.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">Nenhum edital ingerido</h3>
          <p className="text-muted-foreground">Não encontramos novos editais processados na data selecionada.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {editais.map(edital => {
            const matches = matchesByEdital[edital.id] || [];
            const isExpanded = expandedEditalIds.has(edital.id);
            const highMatchesCount = matches.filter(m => m.matchScore >= 80).length;

            return (
              <div key={edital.id} className="bg-card border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div
                  className="p-5 flex items-center justify-between cursor-pointer bg-muted/20 hover:bg-muted/40 transition-colors"
                  onClick={() => toggleExpand(edital.id)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-lg">{edital.title}</h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                        {edital.issuer}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Briefcase className="w-4 h-4"/> R$ {edital.totalBudget?.toLocaleString('pt-BR')}</span>
                      <span>•</span>
                      <span>Prazo: {edital.deadline ? format(new Date(edital.deadline), 'dd/MM/yyyy') : 'Contínuo'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        <span className="text-emerald-600 font-bold">{highMatchesCount}</span> / {matches.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Ótimos / Total</div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-5 border-t bg-background">
                    <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider mb-4">Matches Encontrados</h4>
                    {matches.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum match calculado para este edital ainda.</p>
                    ) : (
                      <div className="space-y-3">
                        {matches.map(match => (
                          <div key={match.id} className="flex gap-4 p-4 rounded-lg border bg-muted/10">
                             <div className="flex flex-col items-center justify-center shrink-0 w-16">
                                <div className={`text-xl font-bold ${match.matchScore >= 80 ? 'text-emerald-600' : match.matchScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                  {match.matchScore}%
                                </div>
                             </div>
                             <div>
                                <h5 className="font-medium text-foreground">{match.oscName || match.oscId}</h5>
                                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                  {match.aiRationale || match.reasoning || "Análise pendente."}
                                </p>
                                {match.badges && match.badges.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {match.badges.map((badge, i) => (
                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border">
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                )}
                             </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
