CRITICAL: The AI Agent must review this file before writing, refactoring, or deploying any code in this repository.

Rule 1: Strict Fail-Fast (No Silent Failures). Never swallow errors. Remove patterns like catch (e) { return null; } or graceful break statements when an API fails. If an unexpected state occurs (e.g., HTML instead of JSON, 401 Unauthorized, missing data), explicitly throw new Error(). Unhandled edge cases MUST crash the function so the orchestrator can mark the job as 'FAILED'.

Rule 2: Observability-First. Do not use generic logs. Every Cloud Function must immediately log its execution payload (e.g., runId, target URL). Every task queue dispatch must log the exact payload being enqueued. If a dispatch is skipped, log exactly why it was skipped.

Rule 3: Isolated Testing. Do not test new workers via the global orchestrator. For every new or refactored worker, create a standalone Node.js test script in /scripts/tests/ that invokes the worker logic directly with a mocked payload.
