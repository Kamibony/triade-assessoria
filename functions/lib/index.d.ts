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
    results: {
        cnpj: string;
        status: string;
        error?: string;
    }[];
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
export declare const ingestGoogleAlertsRss: import("firebase-functions/v2/scheduler").ScheduleFunction;
export declare const scheduledMatchSweeper: import("firebase-functions/v2/scheduler").ScheduleFunction;
//# sourceMappingURL=index.d.ts.map