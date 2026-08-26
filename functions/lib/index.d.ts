import { FieldValue } from 'firebase-admin/firestore';
export declare const parsePdfProfileFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
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
    embedding?: number[] | undefined;
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
export declare const onEditalCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    editalId: string;
}>>;
export declare const triggerMatchOrchestrator: import("firebase-functions/v2/https").CallableFunction<any, Promise<Record<string, unknown> | {
    id: string;
    createdAt: FieldValue;
} | null>, unknown>;
export declare const onOscUpdated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").QueryDocumentSnapshot> | undefined, {
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
export declare const onMatchGenerated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").Change<import("firebase-functions/v2/firestore").DocumentSnapshot> | undefined, {
    matchId: string;
}>>;
export declare const triggerAgenticSearch: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    success: boolean;
    message: string;
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
export declare const processScrapingTargetWorker: import("firebase-functions/v2/tasks").TaskQueueFunction<any>;
export declare const onSearchCreated: import("firebase-functions/core").CloudFunction<import("firebase-functions/v2/firestore").FirestoreEvent<import("firebase-functions/v2/firestore").QueryDocumentSnapshot | undefined, {
    searchId: string;
}>>;
//# sourceMappingURL=index.d.ts.map