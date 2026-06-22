# Agent Platform V2 Parallel Smoke A3 Checklist

Task: `AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3`  
Batch: `AGENT-PLATFORM-V2-PARALLEL-SMOKE`  
Owner: `agent-3`  
Date: 2026-06-22

## Scope

This smoke checklist verifies that an event-first task lifecycle remains consistent with the compatibility queue, lock, and result read models. It is documentation-only except for the required `complete-task.mjs` completion recording step.

Do not run merge, push, deploy, production seed, production migration, database reset, cleanup, prune, or destructive commands for this smoke.

## Checklist

| Area | Check | Expected result |
|---|---|---|
| `task.created` event | Confirm `ops/agent-orchestrator/events/tasks/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3/*task.created*.json` exists and has `status_after: "READY"`. | Event snapshot matches the task queue entry, including allowed and forbidden paths. |
| `task.claimed` event | Confirm `*task.claimed*.json` exists for the same task with `owner: "agent-3"` and `status_after: "CLAIMED"`. | Claim event records the prompt file and lock snapshot for `agent-3`. |
| Queue read model | Check `ops/agent-orchestrator/queue/task-queue.json` before completion. | Task status is `CLAIMED` before completion and becomes `DONE` after `complete-task.mjs`. |
| Lock read model | Check `ops/agent-orchestrator/queue/task-locks.json` before and after completion. | One active lock exists while status is `CLAIMED`; no active A3 lock remains after status becomes `DONE`. |
| Result read models | After completion, check `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json` and `queue/task-results.json`. | Both record `status: "DONE"`, `agent: "agent-3"`, empty commit hash, changed checklist/report files, and validation evidence. |
| `task.completed` event | After completion, confirm a new `*task.completed*.json` event exists. | Event has `status_before: "CLAIMED"`, `status_after: "DONE"`, `source: "complete-task.mjs"`, and `result_ref` pointing to the per-task result JSON. |
| Read-model rebuild dry-run | Run `node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run`. | Command writes nothing. After completion, queue, locks, and results should report no read-model drift. |
| Doctor health | Run `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` when a broader orchestrator health read is needed. | No event/read-model drift, stale active lock for this DONE task, or missing result evidence should be reported. Dirty files may remain until orchestrator commit handling. |
| Audit dry-run | Run `node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run` when audit readiness is needed. | Command writes nothing. This task should audit pass because changed files stay inside the assigned documentation/report/result scope. |

## Safe Command Set

The following commands are safe for this smoke task:

```bash
git status --short
test -f docs/testing/agent-platform-v2-parallel-smoke-a3.md
test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
git diff --check
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
```

The completion recorder is safe only for final task recording because it writes the per-task result, appends the `task.completed` event, and refreshes queue, lock, and result compatibility read models. When the commit hash must be empty, prefer the `--result` payload form so `commit_hash` is represented as an empty string instead of a shell/parser placeholder:

```bash
node ops/agent-orchestrator/scripts/complete-task.mjs --result ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json
```

Do not use `--apply`, `--write`, `--fix-apply`, merge, push, deploy, production, database reset, cleanup, or prune commands for this task.
