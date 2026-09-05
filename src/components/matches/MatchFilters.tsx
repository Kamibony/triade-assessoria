
import { Search } from 'lucide-react';

interface MatchFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    groupBy: 'none' | 'edital' | 'osc';
    setGroupBy: (group: 'none' | 'edital' | 'osc') => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
}

export function MatchFilters({ searchTerm, setSearchTerm, groupBy, setGroupBy, statusFilter, setStatusFilter }: MatchFiltersProps) {
    return (
        <div className="bg-card border rounded-lg p-4 mb-6 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                    <label htmlFor="groupBy" className="text-sm font-medium whitespace-nowrap">Agrupar por:</label>
                    <select
                        id="groupBy"
                        value={groupBy}
                        onChange={e => setGroupBy(e.target.value as 'none' | 'edital' | 'osc')}
                        className="rounded-md border border-input bg-background py-1.5 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="none">Nenhum</option>
                        <option value="edital">Edital</option>
                        <option value="osc">OSC</option>
                    </select>
                </div>
                 <div className="flex items-center gap-2">
                    <label htmlFor="statusFilter" className="text-sm font-medium whitespace-nowrap">Status:</label>
                    <select
                        id="statusFilter"
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="rounded-md border border-input bg-background py-1.5 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="all">Todos</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Aprovado">Aprovado</option>
                        <option value="Rejeitado">Rejeitado</option>
                        <option value="Revisao">Precisa de Revisão</option>
                    </select>
                </div>
            </div>

            <div className="h-6 w-px bg-border hidden sm:block"></div>

            <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                    type="text"
                    className="w-full rounded-md border border-input bg-background pl-10 pr-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Buscar por OSC, OSC ID ou Edital ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
        </div>
    );
}
