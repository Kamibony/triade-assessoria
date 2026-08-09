export declare const parsePdfProfileFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    name: string;
    foundationDate: string;
    location: string;
    documentationStatus: "Em dia" | "Irregular" | "Pendente";
    previousProjectsApproved: boolean;
    coreActivities: string[];
}>, unknown>;
export declare const checkEligibilityFunction: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    eligible: boolean;
    reasoning: string;
    recommendations: string[];
    actionPlan?: string[] | undefined;
}>, unknown>;
//# sourceMappingURL=index.d.ts.map