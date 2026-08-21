import { FieldValue } from 'firebase-admin/firestore';
import { matchSchema } from './shared/schemas.js';
export { matchSchema };
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
export declare function processMatchEvaluation(oscId: string, editalId: string, forceRecalculate?: boolean): Promise<Record<string, unknown> | {
    editalId: string;
    oscId: string;
    matchScore: number;
    eligibility: boolean;
    reasoning: string;
    actionPlan?: string[] | undefined;
    id: string;
    createdAt: FieldValue;
} | null>;
export declare const matchEvaluatorWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const ingestOscDataFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    imported: number;
    results: {
        oscId: number;
        cnpj?: string;
        status: string;
        error?: string;
    }[];
    message: string;
    totalDiscovered?: never;
    processed?: never;
} | {
    imported: number;
    message: string;
    results: {
        oscId: number;
        cnpj?: string;
        status: string;
        error?: string;
    }[];
    totalDiscovered: number;
    processed: number;
}>, unknown>;
export declare const onEditalCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    editalId: string;
}>>;
export declare const triggerMatchOrchestrator: import("firebase-functions/v2/https").CallableFunction<any, Promise<Record<string, unknown> | {
    editalId: string;
    oscId: string;
    matchScore: number;
    eligibility: boolean;
    reasoning: string;
    actionPlan?: string[] | undefined;
    id: string;
    createdAt: FieldValue;
} | null>, unknown>;
export declare const onOscUpdated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
    oscId: string;
}>>;
export declare function processRssFeeds(): Promise<{
    processedCount: number;
    savedCount: number;
}>;
export declare const ingestGoogleAlertsRss: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const manualTriggerRssSyncFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    processedCount: number;
    savedCount: number;
}>, unknown>;
export declare const scheduledMatchSweeper: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const onMatchGenerated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    matchId: string;
}>>;
//# sourceMappingURL=index.d.ts.map