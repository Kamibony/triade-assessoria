import { z } from 'zod';
export declare const ai: import("genkit").Genkit;
export declare const ngoProfileSchema: z.ZodObject<{
    name: z.ZodString;
    foundationDate: z.ZodString;
    location: z.ZodString;
    documentationStatus: z.ZodEnum<["Em dia", "Pendente", "Irregular"]>;
    previousProjectsApproved: z.ZodBoolean;
    coreActivities: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}, {
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}>;
export declare const eligibilityResultSchema: z.ZodObject<{
    eligible: z.ZodBoolean;
    reasoning: z.ZodString;
    recommendations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    eligible: boolean;
    reasoning: string;
    recommendations: string[];
}, {
    eligible: boolean;
    reasoning: string;
    recommendations: string[];
}>;
export declare const eligibilityChecker: import("genkit").Action<z.ZodObject<{
    name: z.ZodString;
    foundationDate: z.ZodString;
    location: z.ZodString;
    documentationStatus: z.ZodEnum<["Em dia", "Pendente", "Irregular"]>;
    previousProjectsApproved: z.ZodBoolean;
    coreActivities: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}, {
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}>, z.ZodObject<{
    eligible: z.ZodBoolean;
    reasoning: z.ZodString;
    recommendations: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    eligible: boolean;
    reasoning: string;
    recommendations: string[];
}, {
    eligible: boolean;
    reasoning: string;
    recommendations: string[];
}>, z.ZodTypeAny, any, z.ZodTypeAny>;
export declare const checkEligibility: import("firebase-functions/https").CallableFunction<any, Promise<any>, any>;
//# sourceMappingURL=index.d.ts.map