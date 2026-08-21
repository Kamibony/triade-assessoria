export interface NotificationPayload {
    ngoName: string;
    editalTitle: string;
    score: number;
    actionPlanSnippet?: string;
}
export interface NotificationProvider {
    send(payload: NotificationPayload): Promise<void>;
}
export declare class MockNotificationProvider implements NotificationProvider {
    send(payload: NotificationPayload): Promise<void>;
}
export declare class NotificationService {
    private provider;
    constructor(provider: NotificationProvider);
    notifyHighMatch(payload: NotificationPayload): Promise<void>;
}
//# sourceMappingURL=notifications.d.ts.map