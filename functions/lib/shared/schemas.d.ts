import { z } from 'zod';
export declare const ngoProfileSchema: z.ZodObject<{
    name: z.ZodString;
    cnpj: z.ZodOptional<z.ZodString>;
    mission: z.ZodOptional<z.ZodString>;
    boardValidity: z.ZodOptional<z.ZodString>;
    foundationDate: z.ZodString;
    location: z.ZodString;
    documentationStatus: z.ZodEnum<["Em dia", "Pendente", "Irregular"]>;
    previousProjectsApproved: z.ZodBoolean;
    coreActivities: z.ZodArray<z.ZodString, "many">;
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    cnpj?: string | undefined;
    mission?: string | undefined;
    boardValidity?: string | undefined;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
    embedding?: number[] | undefined;
}, {
    name: string;
    cnpj?: string | undefined;
    mission?: string | undefined;
    boardValidity?: string | undefined;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
    embedding?: number[] | undefined;
}>;
export declare const editalSchema: z.ZodObject<{
    title: z.ZodString;
    issuer: z.ZodString;
    publicationDate: z.ZodString;
    deadline: z.ZodString;
    totalBudget: z.ZodNumber;
    eligibilityCriteria: z.ZodObject<{
        minYearsActive: z.ZodNumber;
        requiredLocations: z.ZodArray<z.ZodString, "many">;
        requiredDocumentation: z.ZodArray<z.ZodString, "many">;
        allowedActivities: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    }, {
        minYearsActive: number;
        requiredLocations: string[];
        requiredDocumentation: string[];
        allowedActivities: string[];
    }>;
    embedding: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
}, "strip", z.ZodTypeAny, {
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
    embedding?: number[] | undefined;
}, {
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
    embedding?: number[] | undefined;
}>;
export declare const matchSchema: z.ZodObject<{
    editalId: z.ZodString;
    oscId: z.ZodString;
    matchScore: z.ZodNumber;
    eligibility: z.ZodBoolean;
    reasoning: z.ZodString;
    actionPlan: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    editalId: string;
    oscId: string;
    matchScore: number;
    eligibility: boolean;
    reasoning: string;
    actionPlan?: string[] | undefined;
}, {
    editalId: string;
    oscId: string;
    matchScore: number;
    eligibility: boolean;
    reasoning: string;
    actionPlan?: string[] | undefined;
}>;
export declare const triageSchema: z.ZodObject<{
    isValidEdital: z.ZodBoolean;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    isValidEdital: boolean;
    reason: string;
}, {
    isValidEdital: boolean;
    reason: string;
}>;
export declare const copilotResponseSchema: z.ZodObject<{
    matchedOscs: z.ZodArray<z.ZodObject<{
        oscId: z.ZodString;
        name: z.ZodString;
        location: z.ZodString;
        coreActivities: z.ZodArray<z.ZodString, "many">;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }, {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }>, "many">;
    outreachMessage: z.ZodString;
    explanation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    matchedOscs: {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }[];
    outreachMessage: string;
    explanation: string;
}, {
    matchedOscs: {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }[];
    outreachMessage: string;
    explanation: string;
}>;
export declare const scrapingTargetSchema: z.ZodObject<{
    name: z.ZodString;
    url: z.ZodString;
    strategy: z.ZodEnum<["RSS", "API", "HTML"]>;
    cssSelector: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    url: string;
    strategy: "API" | "HTML" | "RSS";
    cssSelector?: string | undefined;
}, {
    name: string;
    url: string;
    strategy: "API" | "HTML" | "RSS";
    cssSelector?: string | undefined;
}>;
//# sourceMappingURL=schemas.d.ts.map