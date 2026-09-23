import { getFunctions } from 'firebase-admin/functions';
import { logger } from 'firebase-functions/logger';
import * as crypto from 'crypto';

export async function safeEnqueueTasks<T extends Record<string, any>>(
    queueName: string,
    tasks: T[],
    generateId?: (data: T) => string
): Promise<void> {
    // Ensure explicit region routing to avoid default-location issues
    const fullQueuePath = queueName.includes('locations/')
        ? queueName
        : `locations/us-central1/functions/${queueName}`;

    const queue = getFunctions().taskQueue<T>(fullQueuePath);

    // Sequential execution to prevent SDK rate limits / connection drops during batching
    for (const data of tasks) {
        try {
            // Generate deterministic ID or fallback to UUID to prevent silent deduplication by Cloud Tasks
            const baseName = queueName.split('/').pop() || 'task';
            const randomSuffix = crypto.randomUUID().replace(/-/g, '');
            let taskId = generateId ? generateId(data) : `${baseName}_${randomSuffix}`;

            // Cloud Tasks ID requirements: only letters, numbers, underscores, and hyphens. Max 500 chars.
            taskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 500);

            await queue.enqueue(data, { id: taskId });
            logger.info(`[safeEnqueueTasks] Successfully enqueued task ${taskId} to ${fullQueuePath}`);
        } catch (error: any) {
            logger.error(`[safeEnqueueTasks] Failed to enqueue task to ${fullQueuePath}: ${error.message}`, error);
        }
    }
}
