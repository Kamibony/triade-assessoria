export interface NotificationPayload {
  ngoName: string;
  editalTitle: string;
  score: number;
  actionPlanSnippet?: string;
}

export interface NotificationProvider {
  send(payload: NotificationPayload): Promise<void>;
}

export class MockNotificationProvider implements NotificationProvider {
  async send(payload: NotificationPayload): Promise<void> {
    console.log("========================================");
    console.log("Mock Notification Provider triggered!");
    console.log(`NGO Name:       ${payload.ngoName}`);
    console.log(`Edital Title:   ${payload.editalTitle}`);
    console.log(`Match Score:    ${payload.score}`);
    if (payload.actionPlanSnippet) {
      console.log(`Action Plan:    ${payload.actionPlanSnippet}`);
    }
    console.log("========================================");
  }
}

export class NotificationService {
  constructor(private provider: NotificationProvider) {}

  async notifyHighMatch(payload: NotificationPayload): Promise<void> {
    await this.provider.send(payload);
  }
}
