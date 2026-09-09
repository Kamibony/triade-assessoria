const fs = require('fs');

// Patch MatchFilters.tsx
let matchFiltersCode = fs.readFileSync('src/components/matches/MatchFilters.tsx', 'utf8');

const matchFiltersPropsSearch = `interface MatchFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    groupBy: 'none' | 'edital' | 'osc';
    setGroupBy: (group: 'none' | 'edital' | 'osc') => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
}`;

const matchFiltersPropsReplace = `interface MatchFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    groupBy: 'none' | 'edital' | 'osc';
    setGroupBy: (group: 'none' | 'edital' | 'osc') => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    cityFilter: string;
    setCityFilter: (city: string) => void;
}`;

matchFiltersCode = matchFiltersCode.replace(matchFiltersPropsSearch, matchFiltersPropsReplace);

const matchFiltersDestructureSearch = `export function MatchFilters({ searchTerm, setSearchTerm, groupBy, setGroupBy, statusFilter, setStatusFilter }: MatchFiltersProps) {`;
const matchFiltersDestructureReplace = `export function MatchFilters({ searchTerm, setSearchTerm, groupBy, setGroupBy, statusFilter, setStatusFilter, cityFilter, setCityFilter }: MatchFiltersProps) {`;

matchFiltersCode = matchFiltersCode.replace(matchFiltersDestructureSearch, matchFiltersDestructureReplace);

const cityFilterHtml = `
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto mt-4 sm:mt-0">
                 <div className="flex items-center gap-2">
                    <label htmlFor="cityFilter" className="text-sm font-medium whitespace-nowrap">Cidade/Lote:</label>
                    <input
                        id="cityFilter"
                        type="text"
                        className="w-full sm:w-48 rounded-md border border-input bg-background py-1.5 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Filtrar por cidade..."
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                    />
                </div>
            </div>`;

matchFiltersCode = matchFiltersCode.replace(`            <div className="relative w-full sm:w-64">`, cityFilterHtml + `\n            <div className="relative w-full sm:w-64 mt-4 sm:mt-0">`);

fs.writeFileSync('src/components/matches/MatchFilters.tsx', matchFiltersCode);

// Patch MatchesDashboard.tsx
let dashboardCode = fs.readFileSync('src/components/MatchesDashboard.tsx', 'utf8');

const filterStateSearch = `  const [groupBy, setGroupBy] = useState<'none' | 'edital' | 'osc'>('none');
  const [statusFilter, setStatusFilter] = useState('hide-rejected');`;

const filterStateReplace = `  const [groupBy, setGroupBy] = useState<'none' | 'edital' | 'osc'>('none');
  const [statusFilter, setStatusFilter] = useState('hide-rejected');
  const [cityFilter, setCityFilter] = useState('');`;

dashboardCode = dashboardCode.replace(filterStateSearch, filterStateReplace);

const filteredMatchesLogicSearch = `      const matchesOscFilter = filterOscId ? match.oscId === filterOscId : true;

      const matchesStatus = statusFilter === 'all'
          ? true
          : statusFilter === 'hide-rejected'
              ? match.actionState !== 'Rejeitado' && match.eligibility !== false
              : (match.actionState || 'Pendente') === statusFilter;

      return matchesSearch && matchesOscFilter && matchesStatus;`;

const filteredMatchesLogicReplace = `      const matchesOscFilter = filterOscId ? match.oscId === filterOscId : true;

      let matchesCityFilter = true;
      if (cityFilter.trim() !== '') {
          const osc = oscs[match.oscId];
          if (osc && typeof osc.location === 'string') {
              matchesCityFilter = osc.location.toLowerCase().includes(cityFilter.trim().toLowerCase());
          } else {
              matchesCityFilter = false;
          }
      }

      const matchesStatus = statusFilter === 'all'
          ? true
          : statusFilter === 'hide-rejected'
              ? match.actionState !== 'Rejeitado' && match.eligibility !== false
              : (match.actionState || 'Pendente') === statusFilter;

      return matchesSearch && matchesOscFilter && matchesCityFilter && matchesStatus;`;

dashboardCode = dashboardCode.replace(filteredMatchesLogicSearch, filteredMatchesLogicReplace);

const propsSearch = `       <MatchFilters
           searchTerm={searchTerm}
           setSearchTerm={setSearchTerm}
           groupBy={groupBy}
           setGroupBy={setGroupBy}
           statusFilter={statusFilter}
           setStatusFilter={setStatusFilter}
       />`;

const propsReplace = `       <MatchFilters
           searchTerm={searchTerm}
           setSearchTerm={setSearchTerm}
           groupBy={groupBy}
           setGroupBy={setGroupBy}
           statusFilter={statusFilter}
           setStatusFilter={setStatusFilter}
           cityFilter={cityFilter}
           setCityFilter={setCityFilter}
       />`;

dashboardCode = dashboardCode.replace(propsSearch, propsReplace);

fs.writeFileSync('src/components/MatchesDashboard.tsx', dashboardCode);
