"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = exports.MockNotificationProvider = void 0;
class MockNotificationProvider {
    async send(payload) {
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
exports.MockNotificationProvider = MockNotificationProvider;
class NotificationService {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async notifyHighMatch(payload) {
        await this.provider.send(payload);
    }
}
exports.NotificationService = NotificationService;
//# sourceMappingURL=notifications.js.map