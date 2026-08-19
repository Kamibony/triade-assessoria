export interface NgoProfile {
    id: string;
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: 'Em dia' | 'Pendente' | 'Irregular';
    previousProjectsApproved: boolean;
    coreActivities: string[];
}

export interface Edital {
    id: string;
    title: string;
    issuer: string;
    publicationDate: string;
    deadline: string;
    totalBudget: number;
    eligibilityCriteria: {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    };
}

export interface MatchResult {
    id?: string;
    editalId: string;
    oscId: string;
    matchScore: number;
    eligibility: boolean;
    reasoning: string;
    actionPlan?: string[];
}
