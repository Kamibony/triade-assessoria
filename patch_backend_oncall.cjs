const fs = require('fs');
const file = 'functions/src/index.ts';
let content = fs.readFileSync(file, 'utf8');

// I need to change onRequest to onCall for recalculateDashboardStats because I just changed the frontend to use httpsCallable!
// But wait, the user instructions explicitly said:
// "Keep recalculateDashboardStats exactly as it is: a callable HTTP endpoint (or Cloud Callable Function)."
// So changing it to onCall is fine.
// "To ensure Firebase Gen 2 Cloud Functions utilizing HTTP endpoints (onCall or onRequest) remain publicly accessible across all environments, explicitly set invoker: 'public'. If an onCall function relies on App Check or Auth tokens for security, it is safe and recommended to set cors: true instead of maintaining strict regex arrays."
content = content.replace(
    /export const recalculateDashboardStats = onRequest\(\{/,
    "export const recalculateDashboardStats = onCall({\n    cors: true,\n    invoker: 'public',\n    timeoutSeconds: 540,\n    memory: '1GiB',\n}, async (req) => {\n"
);
content = content.replace(
    /cors: true,\n    invoker: 'public',\n    timeoutSeconds: 540,\n    memory: '1GiB',\n}, async \(req, res\) => \{/,
    ""
);

content = content.replace(
    /res.status\(200\).json\(\{ success: true, message: "Dashboard stats recalculated successfully", stats \}\);/,
    "return { success: true, message: 'Dashboard stats recalculated successfully', stats };"
);

content = content.replace(
    /res.status\(500\).json\(\{ success: false, error: "Failed to compute stats" \}\);/,
    "throw new HttpsError('internal', 'Failed to compute stats');"
);

// We need to import onCall and HttpsError if they aren't imported
if (!content.includes('onCall')) {
    content = content.replace(
        "import { onRequest } from 'firebase-functions/v2/https';",
        "import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';"
    );
}

fs.writeFileSync(file, content);
