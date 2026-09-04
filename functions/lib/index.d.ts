import { FieldValue } from 'firebase-admin/firestore';
export declare function formatGenkitError(error: unknown, defaultMessage?: string): HttpsError;
import { z } from 'zod';
import { HttpsError } from 'firebase-functions/v2/https';
export declare const scoreMatch: import("genkit").Action<z.ZodObject<{
    osc: z.ZodObject<{
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
    edital: z.ZodObject<{
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
    oscId: z.ZodString;
    editalId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    osc: {
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
    };
    edital: {
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
    };
    oscId: string;
    editalId: string;
}, {
    osc: {
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
    };
    edital: {
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
    };
    oscId: string;
    editalId: string;
}>, z.ZodObject<{
    editalId: z.ZodString;
    oscId: z.ZodString;
    oscName: z.ZodOptional<z.ZodString>;
    matchScore: z.ZodNumber;
    eligibility: z.ZodBoolean;
    reasoning: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    aiSummary: z.ZodOptional<z.ZodString>;
    badges: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    actionPlan: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    editalId: string;
    oscId: string;
    oscName?: string | undefined;
    matchScore: number;
    eligibility: boolean;
    reasoning?: string | null | undefined;
    aiSummary?: string | undefined;
    badges?: string[] | undefined;
    actionPlan?: string[] | undefined;
}, {
    editalId: string;
    oscId: string;
    oscName?: string | undefined;
    matchScore: number;
    eligibility: boolean;
    reasoning?: string | null | undefined;
    aiSummary?: string | undefined;
    badges?: string[] | undefined;
    actionPlan?: string[] | undefined;
}>, z.ZodTypeAny, any, z.ZodTypeAny>;
export declare const parsePdfProfileWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const parsePdfProfileFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    trackingId: string;
    status: string;
}>, unknown>;
export declare const extractEditalRules: import("genkit").Action<z.ZodObject<{
    text: z.ZodOptional<z.ZodString>;
    pdfBase64: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text?: string | undefined;
    pdfBase64?: string | undefined;
}, {
    text?: string | undefined;
    pdfBase64?: string | undefined;
}>, z.ZodObject<{
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
}>, z.ZodTypeAny, any, z.ZodTypeAny>;
export declare function fetchAndExtractText(url: string): Promise<string>;
export declare const extractEditalRulesWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const extractEditalRulesFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    trackingId: string;
    status: string;
}>, unknown>;
export declare const agenticSearchWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const matchEvaluatorWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const processOscChunkWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const ingestOscDataFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    totalDiscovered?: never;
    enqueuedTasks?: never;
} | {
    success: boolean;
    message: string;
    totalDiscovered: number;
    enqueuedTasks: number;
}>, unknown>;
export declare function enqueueEditalExtraction(link: string, text: string, reason: string, searchId?: string): Promise<string>;
export declare const triggerMatchOrchestrator: import("firebase-functions/v2/https").CallableFunction<any, Promise<Record<string, unknown> | {
    id: string;
    oscId: string;
    editalId: string;
    oscName: any;
    editalTitle: any;
    sourceUrl: any;
    createdAt: FieldValue;
    matchScore: number;
    eligibility: boolean;
    status: string;
    badges: string[];
    aiSummary: string;
    reasoning: null;
    actionPlan: string[];
} | {
    id: string;
    oscId: string;
    editalId: string;
    oscName: string;
    editalTitle: string;
    sourceUrl: any;
    createdAt: FieldValue;
} | {
    id: string;
    oscId: any;
    editalId: any;
    matchScore: number;
    eligibility: boolean;
    status: string;
    badges: string[];
    aiSummary: string;
    reasoning: null;
}>, unknown>;
export declare const onOscUpdated: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    oscId: string;
}>>;
export declare const ingestGoogleAlertsRss: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const ingestManualOscFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    oscId: string;
    profile: {
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
        id: string;
    };
}>, unknown>;
export declare const ingestManualEditalFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    editalId?: never;
} | {
    success: boolean;
    editalId: string;
    message: string;
}>, unknown>;
export declare const askCopilotFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    matchedOscs: {
        oscId: string;
        name: string;
        location: string;
        coreActivities: string[];
        reasoning: string;
    }[];
    outreachMessage: string;
    explanation: string;
}>, unknown>;
export declare const manualTriggerRssSyncFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    processedCount: number;
    savedCount: number;
}>, unknown>;
export declare const scheduledMatchSweeper: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const onMatchGenerated: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    matchId: string;
}>>;
export declare const triggerAgenticSearch: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    jobId: string;
}>, unknown>;
export declare const autonomousSearchWorker: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    searchId: string;
    message: string;
}>, unknown>;
export declare const triggerScrapingWorker: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
    searchId: string;
}>, unknown>;
export declare const seedScrapingTargets: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
}>, unknown>;
export declare const extractionWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const prosasAuthenticatedWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const processScrapingTargetWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const onSearchCreated: import("firebase-functions").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    searchId: string;
}>>;
export declare const renewProsasSessionCron: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const prosasBulkDiscoveryWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const testExtractionEndpoint: import("firebase-functions/v2/https").HttpsFunction;
//# sourceMappingURL=index.d.ts.map