import { z } from 'zod';
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
export declare const parsePdfProfileFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}>, unknown>;
export declare const extractEditalRulesFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
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
}>, unknown>;
export declare const onEditalCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    editalId: string;
}>>;
//# sourceMappingURL=index.d.ts.map