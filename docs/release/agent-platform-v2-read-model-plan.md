# Agent Platform V2 Read Model And Result Plan

Task: `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS`  
Batch: `AGENT-PLATFORM-V2-20260621`  
Owner: `agent-3`  
Date: 2026-06-21

## 1. Goal

Move orchestrator status, result, and audit state toward append-only event files while keeping the current queue JSON files as a generated compatibility read model. The design removes the requirement for multiple Agent worktrees to write `ops/agent-orchestrator/queue/task-queue.json`, `task-locks.json`, or `task-results.json` during parallel execution.

This plan is design-only. It does not change business code, database state, auth, CI, Docker, deploy, production environment files, or run any Agent.

## 2. Source Of Truth

V2 treats these inputs as ordered facts:

- Bootstrap task definitions from `ops/agent-orchestrator/queue/task-queue.json` until all tasks have `task.created` events.
- Task events under `ops/agent-orchestrator/events/tasks/`.
- Lock events under `ops/agent-orchestrator/events/locks/`.
- Result events under `ops/agent-orchestrator/events/results/`.
- Audit events under `ops/agent-orchestrator/events/audits/`.

The generated read model writes compatibility outputs only from a single orchestrator process:

- `ops/agent-orchestrator/queue/task-queue.json`
- `ops/agent-orchestrator/queue/task-locks.json`
- `ops/agent-orchestrator/queue/task-results.json`
- `ops/agent-orchestrator/results/<task_id>.json`
- Optional batch summary reports under `ops/agent-orchestrator/reports/`

Agents may write their own event files. They must not be required to concurrently update shared queue JSON files.

## 3. Event File Layout

Use one immutable event file per state change. Directories may be empty during compatibility rollout.

```text
ops/agent-orchestrator/events/
  tasks/<task_id>/<event_id>.json
  locks/<task_id>/<event_id>.json
  results/<task_id>/<event_id>.json
  audits/<task_id>/<event_id>.json
```

`event_id` should be unique and stable for retry safety:

```text
<created_at_utc_compact>.<task_id>.<agent_or_system>.<event_type>.<nonce>
```

Example:

```text
20260621T140501123Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.agent-3.result.recorded.01
```

The nested `<task_id>/` layout prevents a single large directory and keeps reruns from overwriting earlier attempts. The materialized per-task result file remains `ops/agent-orchestrator/results/<task_id>.json`, but only the materializer writes it.

## 4. Base Event Envelope

All event files use this envelope:

```json
{
  "schema_version": 1,
  "event_id": "20260621T140501123Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.agent-3.result.recorded.01",
  "event_type": "result.recorded",
  "task_id": "AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "agent": "agent-3",
  "created_at": "2026-06-21T14:05:01.123Z",
  "source": "complete-task.mjs",
  "payload": {}
}
```

Required validation:

- `schema_version` must equal `1`.
- `event_id`, `event_type`, `task_id`, and `created_at` are required.
- `created_at` must parse as a date-time.
- `agent` is required for Agent-authored events and must be one of `agent-1` through `agent-5`.
- `payload` must be an object.
- Unknown top-level fields fail strict materialization unless explicitly allowed by the schema version.

## 5. Task Status Events

Task status is reduced from these events:

| Event type | Queue status | Required payload |
|---|---|---|
| `task.created` | `READY` unless a later status event exists | full task snapshot or task reference |
| `task.claimed` | `CLAIMED` | `owner`, `claimed_at` |
| `task.started` | `IN_PROGRESS` compatibility state | `started_at`, optional `run_log` |
| `task.completed` | `DONE` | `completed_at`, optional `result_event_id` |
| `task.failed` | `FAILED` | `failed_at`, `reason` |
| `task.blocked` | `BLOCKED` | `blocked_at`, `reason`, optional `needs_human` |
| `task.audited` | `AUDITED` | `audited_at`, `audit_event_id` |

Required task coverage for this batch is READY, CLAIMED, DONE, FAILED, BLOCKED, and AUDITED. `IN_PROGRESS` remains supported because the existing queue schema and `check-dispatch-status.mjs` already recognize it.

Reducer rule:

1. Start from the bootstrap task snapshot or `task.created`.
2. Apply ordered status events.
3. Preserve immutable task metadata from the earliest complete task snapshot unless a later orchestrator-authored task amendment event is introduced in a future schema.
4. `audit.failed` does not automatically set queue status to `FAILED`; it records an audit failure and leaves the task in the latest non-audit task status unless a separate `task.failed` event exists.

## 6. Result Event Shape

Agents record conflict-free completion evidence with `result.recorded`:

```json
{
  "schema_version": 1,
  "event_id": "20260621T140501123Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.agent-3.result.recorded.01",
  "event_type": "result.recorded",
  "task_id": "AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "agent": "agent-3",
  "created_at": "2026-06-21T14:05:01.123Z",
  "source": "complete-task.mjs",
  "payload": {
    "status": "DONE",
    "commit_hash": "abc1234",
    "changed_files": [
      "docs/release/agent-platform-v2-read-model-plan.md"
    ],
    "commands_run": [
      "pnpm typecheck"
    ],
    "passed_checks": [
      "pnpm typecheck"
    ],
    "failed_checks": [],
    "notes": "Read model design completed."
  }
}
```

Materialized per-task result:

```json
{
  "task_id": "AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS",
  "agent": "agent-3",
  "status": "DONE",
  "commit_hash": "abc1234",
  "changed_files": [],
  "agent_changed_files": [],
  "orchestrator_changed_files": [],
  "commands_run": [],
  "passed_checks": [],
  "failed_checks": [],
  "notes": "",
  "completed_at": "2026-06-21T14:05:01.123Z",
  "source_event_id": "20260621T140501123Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.agent-3.result.recorded.01"
}
```

`task-results.json` is a summary materialization of latest per-task results. It is not an Agent-authored source of truth in V2.

## 7. Audit Event Shape

Audit commands record append-only audit events:

```json
{
  "schema_version": 1,
  "event_id": "20260621T141000000Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.system.audit.passed.01",
  "event_type": "audit.passed",
  "task_id": "AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS",
  "batch_id": "AGENT-PLATFORM-V2-20260621",
  "agent": "agent-3",
  "created_at": "2026-06-21T14:10:00.000Z",
  "source": "audit-all-results.mjs",
  "payload": {
    "result_event_id": "20260621T140501123Z.AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.agent-3.result.recorded.01",
    "status": "PASS",
    "audited_files": [
      "docs/release/agent-platform-v2-read-model-plan.md"
    ],
    "failures": []
  }
}
```

For a failed audit, use `audit.failed` with `payload.status: "FAIL"` and non-empty `payload.failures`. The read model records the failure in audit summary and exits non-zero in audit mode, but it does not hide the latest result event.

## 8. Deterministic Ordering

All readers sort events using one comparator:

1. Parsed `created_at` ascending.
2. Event phase rank:
   - `task.created`
   - `task.claimed`
   - `lock.created`
   - `task.started`
   - `result.recorded`
   - `task.completed`
   - `task.failed`
   - `task.blocked`
   - `audit.passed`
   - `audit.failed`
   - `task.audited`
   - `lock.released`
3. `event_id` ascending.
4. Relative file path ascending.

This ordering makes replay deterministic even when file system listing order differs by platform.

## 9. Duplicate Detection

The event reader should track these duplicate classes:

| Duplicate class | Handling |
|---|---|
| Same `event_id` and same content hash | Treat as an idempotent duplicate, ignore after first read, warn in dry-run summary. |
| Same `event_id` and different content hash | Fatal conflict. Exit non-zero and do not write materialized JSON. |
| More than one active lock for the same task | Fatal conflict until one lock is released or marked stale by policy. |
| More than one active lock for the same Agent | Fatal conflict for dispatch readiness. |
| More than one final result for the same task | Keep latest by deterministic order, record duplicate-result warning, and require audit summary to show superseded result event IDs. |
| Same changed file claimed by multiple DONE results in one batch | Warn for docs/report paths, fail for non-orchestrator paths unless human approval is recorded. |

Duplicate detection belongs in the shared event reader, not independently inside each command.

## 10. Corrupt Event Handling

Materialization is strict by default:

- Invalid JSON, missing required fields, invalid timestamps, invalid Agent IDs, unknown event types, and schema-version mismatches are corrupt events.
- `check-dispatch-status.mjs` should print the corrupt event path and exit non-zero when using event-backed mode.
- `reconcile-task-results.mjs --dry-run` should fail without writing any file.
- `reconcile-task-results.mjs --apply` should validate every event before the first write. If validation fails, it writes nothing.
- `audit-all-results.mjs --dry-run` should fail loudly on corrupt result or audit events.

Compatibility fallback is allowed only when `ops/agent-orchestrator/events/` does not exist or when a command is explicitly invoked with a future `--legacy-only` option.

## 11. No-Write Dry Run

Every read-model adapter must support a no-write path:

- Default read commands never write.
- `--dry-run` and `--no-write` must be aliases for no writes.
- Dry-run must parse, validate, sort, reduce, and print the files that would be written.
- Dry-run must report duplicate and corrupt-event findings.
- Dry-run must not update timestamps in memory before producing comparable output.
- Apply mode must write through temporary files plus atomic rename so partial summaries are not committed on failure.

## 12. Adapter Behavior

### `check-dispatch-status.mjs`

- Reads the event-backed read model when events exist.
- Falls back to legacy queue JSON when events are absent.
- Prints counts for READY, CLAIMED, IN_PROGRESS, DONE, FAILED, BLOCKED, and AUDITED.
- Prints duplicate warnings and corrupt-event failures.
- Performs no writes in all modes.
- Shows Agent claim readiness from active lock projection rather than raw `task-locks.json` when event-backed mode is active.

### `audit-all-results.mjs`

- Reads latest DONE results from the result projection.
- Audits `agent_changed_files` against task `allowed_paths` and `forbidden_paths`.
- In dry-run, prints `AUDIT_PASS` or `AUDIT_FAIL` and writes nothing.
- In write mode, writes `audit.passed` or `audit.failed` events only.
- Lets the materializer set queue status to `AUDITED` after a passing audit event.

### `complete-task.mjs`

- Validates task ownership, final status, changed files, command arrays, and commit hash format.
- Writes one immutable `result.recorded` event per completion attempt.
- Writes no shared queue JSON in Agent execution mode.
- Supports a compatibility `--legacy-write` or orchestrator-only materialization step for serial workflows until migration is complete.
- Supports `--dry-run` to validate payload and print the event path that would be written.
- Never overwrites an existing event file. Retry with the same payload may be treated as idempotent only if the existing event has the same hash.

### `reconcile-task-results.mjs`

- Becomes the materializer for legacy queue JSON and per-task result summaries.
- Reads legacy queue bootstrap plus all valid events.
- Rebuilds `task-queue.json`, `task-locks.json`, `task-results.json`, and `results/<task_id>.json` from projections.
- Defaults to dry-run and prints `Dry-run: no files written`.
- In apply mode, validates all inputs before writing any output.
- Writes deterministic JSON ordering so repeated materialization with unchanged inputs produces no diff.

### `integrate-agent-results.mjs`

- Treats queue JSON conflicts as generated-file conflicts.
- During integration, keeps the integration branch version temporarily, then runs `reconcile-task-results.mjs --apply`.
- Uses event files and per-task result events to recover final state.
- Fails on conflicting event files, corrupt events, or duplicate active locks.
- Keeps non-bookkeeping conflicts as hard stops requiring human review.

## 13. Legacy Queue Generation

The legacy queue can still be generated from events:

1. Load bootstrap `task-queue.json` for task metadata not yet represented by `task.created`.
2. Load and validate all events.
3. Reduce task status, active locks, latest results, and latest audits.
4. Sort tasks by priority rank, `created_at`, then `task_id`, matching existing queue behavior.
5. Sort locks by Agent, task ID, then claim timestamp.
6. Sort results by completed timestamp, task ID, then source event ID.
7. Write the three `queue/*.json` files from the projection in apply mode only.

## 14. Rollout Phases

| Phase | Change | Compatibility |
|---|---|---|
| A3.0 | Add this read-model plan and test plan. | Docs only. |
| A3.1 | Add shared event reader and schema validation helpers. | Legacy JSON remains source when events are absent. |
| A3.2 | Add materializer dry-run for queue, locks, results, and per-task summaries. | No writes by default. |
| A3.3 | Add event-first `complete-task` result writing. | Serial workflows may still call legacy materialization. |
| A3.4 | Switch audit write mode to audit events. | Legacy AUDITED queue status generated by materializer. |
| A3.5 | Switch dispatch/status/integration to event read model. | Queue JSON becomes generated compatibility output. |

## 15. Open Decisions

- Whether the event writer should use UUIDs or timestamp-plus-nonce IDs. This plan allows either if ordering does not depend on ID alone.
- Whether `task.started` should remain a public status or be treated as a runner-only compatibility state.
- Whether duplicate final results for a task should become fatal after the migration stabilizes. During migration, latest-result wins with warnings is safer for compatibility.
