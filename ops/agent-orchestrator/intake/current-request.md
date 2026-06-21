# Current Request

Status: empty

No active natural-language request is loaded into the orchestrator intake.

When a new user request arrives:

1. Copy the raw request into this file.
2. Preserve the original wording.
3. Fill the interpreted goal, scope, constraints, and approval needs using `REQUEST_TEMPLATE.md`.
4. Generate the matching REQ / TECH spec under `ops/agent-orchestrator/specs/`.
5. Generate queue entries in `ops/agent-orchestrator/queue/task-queue.json`.

Do not place secrets, passwords, tokens, production connection strings, or private production account details in this file.
