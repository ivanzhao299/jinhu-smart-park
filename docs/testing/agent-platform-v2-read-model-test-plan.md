# Agent Platform V2 Read Model Test Plan

Task: `AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS`  
Batch: `AGENT-PLATFORM-V2-20260621`  
Owner: `agent-3`  
Date: 2026-06-21

## 1. Scope

This test plan verifies the event-backed read model, conflict-free result recording, audit events, and legacy queue materialization described in `docs/release/agent-platform-v2-read-model-plan.md`.

The plan is designed for future implementation. This task only creates the plan and runs syntax/typecheck validation on the current repository.

## 2. Test Fixtures

Fixture suites should live under a future allowed orchestrator test fixture directory or use temporary directories in `/tmp` during script tests.

Minimum fixture sets:

| Fixture | Purpose |
|---|---|
| `legacy-only` | Existing `queue/*.json` with no `events/` directory. |
| `happy-path-events` | One task through READY, CLAIMED, DONE, AUDITED. |
| `failed-task` | CLAIMED task followed by result status FAILED and `task.failed`. |
| `blocked-task` | CLAIMED task followed by `task.blocked`. |
| `same-timestamp-events` | Multiple events with identical `created_at` to prove deterministic tie-break ordering. |
| `duplicate-event-id-same-hash` | Idempotent duplicate warning, no fatal error. |
| `duplicate-event-id-different-hash` | Fatal conflict, no writes. |
| `duplicate-active-locks` | Fatal readiness conflict for same Agent or same task. |
| `corrupt-json-event` | Invalid JSON must fail before writes. |
| `unknown-event-type` | Unknown event type must fail strict materialization. |
| `audit-failed` | Audit failure recorded without setting queue status to AUDITED. |

## 3. Read Model Cases

| Case | Input | Expected result |
|---|---|---|
| RM-01 legacy fallback | No `events/` directory | `check-dispatch-status.mjs` reads legacy queue JSON and writes nothing. |
| RM-02 READY projection | `task.created` only | Queue task status is READY. |
| RM-03 CLAIMED projection | `task.created`, `task.claimed`, active `lock.created` | Queue task status is CLAIMED and Agent has active lock. |
| RM-04 DONE projection | Result event plus `task.completed` | Queue task status is DONE and latest per-task result is materialized. |
| RM-05 FAILED projection | Result event with FAILED plus `task.failed` | Queue task status is FAILED and failure checks are preserved. |
| RM-06 BLOCKED projection | `task.blocked` | Queue task status is BLOCKED and active lock remains visible unless released. |
| RM-07 AUDITED projection | DONE result plus `audit.passed` and `task.audited` | Queue task status is AUDITED and audit summary references source result event. |
| RM-08 audit failed | DONE result plus `audit.failed` | Queue task stays DONE, audit summary records failure, audit command exits non-zero. |
| RM-09 IN_PROGRESS compatibility | `task.started` | Queue status is IN_PROGRESS for existing schema compatibility. |

## 4. Deterministic Ordering Cases

| Case | Input | Expected result |
|---|---|---|
| ORD-01 stable path order | Same events returned by file system in different order | Materialized JSON is byte-for-byte identical. |
| ORD-02 same timestamp phase rank | `result.recorded` and `task.completed` share timestamp | Result is available before DONE status is finalized. |
| ORD-03 same timestamp event ID tie | Same phase and timestamp | Lower `event_id` sorts first; output remains deterministic. |
| ORD-04 task sort | Mixed priorities and creation times | Tasks sort by priority rank, `created_at`, then `task_id`. |
| ORD-05 result sort | Multiple results across tasks | Results sort by completed timestamp, `task_id`, then source event ID. |

## 5. Duplicate And Conflict Cases

| Case | Input | Expected result |
|---|---|---|
| DUP-01 same event same hash | Duplicate file with same `event_id` and identical content | Dry-run warns and ignores duplicate. |
| DUP-02 same event different hash | Duplicate `event_id` with changed payload | Fatal conflict, no writes. |
| DUP-03 duplicate active task lock | Two active locks for one task | Fatal conflict for readiness and materialization. |
| DUP-04 duplicate active Agent lock | One Agent has two active task locks | Fatal conflict for dispatch readiness. |
| DUP-05 repeated final result | Two `result.recorded` events for same task | Latest result wins, superseded event IDs appear in summary warning. |
| DUP-06 cross-task file overlap | Two DONE results change the same non-orchestrator file | Fail unless human approval is recorded. |

## 6. Corrupt Event Cases

| Case | Input | Expected result |
|---|---|---|
| BAD-01 invalid JSON | Malformed event file | Exit non-zero, print path, write nothing. |
| BAD-02 missing required field | Missing `task_id` or `event_type` | Exit non-zero, print field and path, write nothing. |
| BAD-03 invalid timestamp | Unparseable `created_at` | Exit non-zero, write nothing. |
| BAD-04 invalid Agent | `agent-99` | Exit non-zero, write nothing. |
| BAD-05 unsupported schema | `schema_version: 999` | Exit non-zero, write nothing. |

## 7. No-Write Dry-Run Cases

Every command that has an apply/write mode should be tested with pre/post checksums.

```bash
shasum ops/agent-orchestrator/queue/task-queue.json
node ops/agent-orchestrator/scripts/reconcile-task-results.mjs --dry-run
shasum ops/agent-orchestrator/queue/task-queue.json
```

Expected:

- The before and after checksums match.
- No `updated_at` fields are rewritten in dry-run.
- The command prints what would be written.
- Corrupt inputs fail before any output path is touched.

## 8. Adapter Test Matrix

| Script | Required tests |
|---|---|
| `check-dispatch-status.mjs` | Legacy fallback, event-backed counts, active lock projection, corrupt event failure, no writes. |
| `audit-all-results.mjs` | DONE result discovery, allowed path pass, forbidden path failure, audit event write mode, dry-run no writes. |
| `complete-task.mjs` | Payload validation, task ownership, event-only result write, retry same event hash, duplicate event conflict, dry-run no writes. |
| `reconcile-task-results.mjs` | Full materialization, deterministic JSON, duplicate warnings, corrupt event no-write failure, legacy bootstrap compatibility. |
| `integrate-agent-results.mjs` | Queue JSON conflict regeneration, event conflict failure, non-bookkeeping conflict hard stop, validation command sequence. |

## 9. Current Task Validation Commands

The current design task should run:

```bash
git status --short
node --check ops/agent-orchestrator/scripts/reconcile-task-results.mjs
node --check ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
pnpm typecheck
git diff --check
git status --short
```

These commands validate the current repository remains parseable and type-safe after the documentation changes. They do not prove the future event read-model implementation because this task does not implement it.

## 10. Pass Criteria

Future implementation is ready for parallel Agent execution only when:

- READY, CLAIMED, DONE, FAILED, BLOCKED, AUDITED, and compatibility IN_PROGRESS statuses are projected from events.
- Agents can complete tasks by writing only task-scoped event files.
- `task-results.json` and `results/<task_id>.json` are generated summaries, not concurrent Agent writes.
- Duplicate and corrupt events fail or warn exactly as specified.
- Dry-run modes perform full validation without writing any file.
- Legacy queue JSON can be regenerated deterministically from the event store.
- `pnpm typecheck` and `git diff --check` pass.
