# Agent Platform V2 Validation Matrix

Task: `AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT`
Batch: `AGENT-PLATFORM-V2-20260621`
Owner: `agent-2`
Date: 2026-06-22

## 1. Scope

This matrix defines regression coverage for Agent Platform V2 queue compatibility, event read-model generation, dry-run no-write behavior, bounded parallel runner options, and integration apply guardrails.

It covers both V2 tracks:

- V2-A: Event Sourcing Queue and generated legacy JSON read model.
- V2-B: Parallel Agent Execution planning and execution guardrails.

This is a test plan only. It does not modify business code, database objects, infrastructure, auth, CI, Docker, deploy files, production environment files, or run any Agent.

## 2. Test Invariants

All future automated cases must use isolated fixture copies or temporary directories. Tests must not mutate the live orchestrator queue unless the test explicitly creates a disposable fixture and points the script under test at that fixture.

Required invariants:

- Legacy JSON queue workflows continue to work when `ops/agent-orchestrator/events/` is absent.
- When event files exist, the event store is validated before any generated JSON write.
- Dry-run and no-write modes never change queue JSON, event files, run plans, prompts, reports, or timestamps.
- Event-backed materialization is deterministic across filesystem ordering, repeated runs, and same-timestamp events.
- HIGH-risk changes, forbidden paths, corrupt events, duplicate conflicting events, stale locks, Codex failures, and validation failures block apply/execute paths.
- No test path performs merge, push, deploy, production migration, production seed, Docker cleanup, database reset, truncate, prune, or real Agent execution.

## 3. Fixture Matrix

| Fixture | V2 Track | Purpose | Required contents |
|---|---|---|---|
| `legacy-only` | V2-A | Prove current JSON queue remains usable. | `queue/task-queue.json`, `queue/task-locks.json`, `queue/task-results.json`; no `events/` directory. |
| `legacy-with-empty-events` | V2-A | Prove event directory introduction does not erase legacy bootstrap state. | Valid queue JSON plus empty `events/tasks`, `events/locks`, `events/results`, `events/audits`. |
| `happy-path-events` | V2-A | Prove read model reduces a full lifecycle. | `task.created`, `task.claimed`, `lock.created`, `result.recorded`, `task.completed`, `audit.passed`, `task.audited`. |
| `failed-task-events` | V2-A | Prove failed completion is preserved. | `task.claimed`, `result.recorded` with `FAILED`, `task.failed`. |
| `blocked-task-events` | V2-A | Prove blocked state and active lock projection. | `task.claimed`, `lock.created`, `task.blocked`. |
| `same-timestamp-events` | V2-A | Prove deterministic phase-rank ordering. | Multiple event types sharing `created_at`. |
| `duplicate-events` | V2-A | Prove idempotent duplicate and fatal conflict behavior. | Same `event_id` with same hash, then same `event_id` with different hash. |
| `corrupt-events` | V2-A | Prove strict validation before writes. | Invalid JSON, missing fields, invalid timestamp, invalid Agent, unsupported schema version. |
| `parallel-ready` | V2-B | Prove runner batching and dry-run output. | Multiple CLAIMED tasks with active locks and prompt files. |
| `parallel-invalid` | V2-B | Prove rejected `--parallel` values fail before execution. | Any valid queue state. |
| `codex-failure` | V2-B | Prove execution summary captures non-zero Codex exit without launching remaining tasks. | Fake Codex executable in fixture PATH; isolated temp logs only. |
| `integration-guardrails` | V2-A/V2-B | Prove apply integration blocks unsafe changes. | Agent branches or fixture repos with HIGH-risk files, queue-only conflicts, and non-bookkeeping conflicts. |

## 4. Core Capability Matrix

| Case | Track | Area | Command under test | Setup | Expected result |
|---|---|---|---|---|---|
| CAP-01 | V2-A | Legacy JSON compatibility | `check-dispatch-status.mjs` | `legacy-only` | Exits 0, prints status counts and Agent readiness from legacy JSON, writes nothing. |
| CAP-02 | V2-A | Event read model | Future `reconcile-task-results.mjs --dry-run` | `happy-path-events` | Prints generated queue, locks, results, and per-task summaries; writes nothing. |
| CAP-03 | V2-A | Event read model generation | Future `reconcile-task-results.mjs --apply` | `happy-path-events` | Writes deterministic legacy JSON from event projection after full validation. |
| CAP-04 | V2-A | Dry-run no-write | Every adapter with `--dry-run` or `--no-write` | Any valid fixture | Pre/post checksums match for queue JSON, event dirs, run plans, prompts, logs, and reports. |
| CAP-05 | V2-B | Parallel runner options | `run-claimed-agent-prompts.mjs --dry-run --parallel 1|2|3|5` | `parallel-ready` | Exits 0, prints selected `Parallelism`, planned batches, prompt files, log files, and no Agent execution. |
| CAP-06 | V2-B | Parallel execution guard | `run-claimed-agent-prompts.mjs --apply --execute --parallel 2 --precheck-only` | `parallel-ready` | Exits non-zero before Codex launch and reports event-sourced completion writes are required. |
| CAP-07 | V2-A/V2-B | Integration apply guardrails | `integrate-agent-results.mjs --apply` | `integration-guardrails` | Blocks HIGH-risk and non-bookkeeping conflicts; queue-only conflicts require read-model reconciliation. |
| CAP-08 | V2-A/V2-B | Validation matrix | `run-validation-matrix.mjs --plan` and default run | Valid repo or fixture | Plan mode prints commands only; run mode executes status, audit dry-run, and typecheck in order. |

## 5. Script Regression Cases

| Script | Case | Mode | Regression assertion |
|---|---|---|---|
| `claim-task.mjs` | CLAIM-01 | Legacy fixture apply | Claims the highest-priority READY task for the Agent, updates queue and lock JSON only in fixture, and preserves priority/created_at ordering. |
| `claim-task.mjs` | CLAIM-02 | Future event mode | Emits `task.claimed` and `lock.created` events without requiring concurrent shared JSON writes. |
| `claim-task.mjs` | CLAIM-03 | Negative | Duplicate active lock or unsupported Agent fails before writes. |
| `complete-task.mjs` | COMPLETE-01 | Legacy fixture apply | Valid owner can record DONE/FAILED, update per-task result, aggregate results, and queue status in fixture. |
| `complete-task.mjs` | COMPLETE-02 | Future event mode | Writes one immutable `result.recorded` event and leaves shared queue JSON unchanged until materialization. |
| `complete-task.mjs` | COMPLETE-03 | Negative | Wrong owner, invalid final status, invalid Agent, duplicate conflicting event, or changed file outside allowed paths fails before writes. |
| `audit-agent-result.mjs` | AUDIT-01 | Legacy fixture apply | Passing result marks the task `AUDITED`; missing task/result or forbidden path exits non-zero. |
| `audit-all-results.mjs` | AUDIT-02 | Dry-run | Audits latest DONE results and prints `AUDIT_PASS`/`AUDIT_FAIL` without modifying queue JSON. |
| `audit-all-results.mjs` | AUDIT-03 | Future event mode | Write mode records `audit.passed` or `audit.failed`; materializer owns final `AUDITED` queue status. |
| `dispatch-ready-agents.mjs` | DISPATCH-01 | Dry-run | Prints claimable tasks and skipped Agents without writing queue, locks, prompts, or dispatch report. |
| `dispatch-ready-agents.mjs` | DISPATCH-02 | Legacy fixture apply | Writes prompts, `dispatch-report.md`, queue status, and locks only in fixture. |
| `dispatch-ready-agents.mjs` | DISPATCH-03 | Future event mode | Emits claim/lock events and prompt files while shared queue JSON remains generated by one materializer. |
| `run-claimed-agent-prompts.mjs` | RUN-01 | Dry-run default | Defaults to `--parallel 1`, prints plan, batches, guardrails, and executes no Codex process. |
| `run-claimed-agent-prompts.mjs` | RUN-02 | Dry-run accepted parallel | `--parallel 1`, `2`, `3`, and `5` exit 0 and produce stable batch output. |
| `run-claimed-agent-prompts.mjs` | RUN-03 | Invalid parallel | `--parallel 0`, `4`, and `all` exit non-zero before worktree, prompt, or Codex mutation. |
| `run-claimed-agent-prompts.mjs` | RUN-04 | Execution guard | `--apply --execute --parallel > 1 --precheck-only` blocks before Codex launch. |
| `run-claimed-agent-prompts.mjs` | RUN-05 | Codex failure | Fake Codex exit code is recorded in isolated run log; not-started tasks remain not started. |
| `commit-agent-results.mjs` | COMMIT-01 | Dry-run | Prints per-Agent dirty files, task source, risk, boundary checks, and creates no commit. |
| `commit-agent-results.mjs` | COMMIT-02 | Apply guard | Blocks HIGH-risk or boundary failures; commits only LOW/MEDIUM eligible fixture changes. |
| `integrate-agent-results.mjs` | INTEGRATE-01 | Dry-run | Lists candidate branches and exits without branch creation or merge. |
| `integrate-agent-results.mjs` | INTEGRATE-02 | Queue conflict | Queue-only conflicts are resolved by keeping integration branch files, then running materialization/reconciliation. |
| `integrate-agent-results.mjs` | INTEGRATE-03 | Non-bookkeeping conflict | Non-queue conflicts abort merge and require human review. |
| `reconcile-task-results.mjs` | RECONCILE-01 | Legacy dry-run | Merges aggregate/per-task/report results and prints planned DONE tasks with no writes. |
| `reconcile-task-results.mjs` | RECONCILE-02 | Future event dry-run | Validates events, builds projection, prints generated outputs, and writes nothing. |
| `reconcile-task-results.mjs` | RECONCILE-03 | Future event apply | Writes queue/read-model files only after all event validation passes. |
| `check-dispatch-status.mjs` | STATUS-01 | Legacy read | Reads legacy queue/locks/results and writes nothing. |
| `check-dispatch-status.mjs` | STATUS-02 | Future event read | Reads projected event state when events exist and reports duplicate/corrupt findings. |
| `run-validation-matrix.mjs` | VALIDATE-01 | Plan | Prints command sequence without executing commands. |
| `run-validation-matrix.mjs` | VALIDATE-02 | Run | Executes status, audit dry-run, typecheck, and conditional focused smoke commands in order. |
| `orchestratorctl.mjs agent-cycle` | CYCLE-01 | Dry-run | Runs dispatch dry-run, runner dry-run/no-write, commit dry-run, integrate dry-run, validation plan; prints no-write outcome. |
| `orchestratorctl.mjs agent-cycle` | CYCLE-02 | Apply preflight | Blocks dirty main, dirty Agent worktree, missing Codex for execute, HIGH-risk integration, and no-push execution prerequisites. |

## 6. Compatibility Matrix

| Case | Setup | Expected proof |
|---|---|---|
| COMPAT-01 legacy-only status | No `events/` directory. | `check-dispatch-status.mjs` exits 0 and output matches legacy JSON counts. |
| COMPAT-02 legacy-only dry cycle | No `events/` directory. | `orchestratorctl.mjs agent-cycle --dry-run` completes with no writes and no Agent execution. |
| COMPAT-03 empty event directories | Empty `events/` directories plus valid legacy queue JSON. | Materializer uses legacy queue as bootstrap; no task disappears. |
| COMPAT-04 event overrides status | Bootstrap task READY plus later `task.claimed`/`task.completed`. | Generated queue status follows latest valid event, not stale bootstrap JSON. |
| COMPAT-05 legacy result plus event result | Existing `task-results.json` plus newer `result.recorded`. | Projection chooses deterministic latest event and records source event id. |
| COMPAT-06 event read then legacy command | Materialize event projection, then run a legacy read command. | Legacy reader sees equivalent queue/locks/results shape and exits 0. |
| COMPAT-07 no-write projection | Valid event set with apply-capable command invoked as dry-run. | Pre/post checksums match every legacy JSON and event file. |
| COMPAT-08 rollback to legacy | Event directory removed or future `--legacy-only` selected. | Existing JSON queue workflow still parses and runs current status/dry-run cycle. |

## 7. Negative Matrix

| Case | Risk covered | Setup | Expected result |
|---|---|---|---|
| NEG-01 HIGH-risk Agent result | HIGH-risk paths | Agent branch changes `apps/**`, `packages/**`, `database/**`, `infra/**`, CI, Docker, deploy, env, or other forbidden paths. | Commit/integrate apply blocks and reports human confirmation required. |
| NEG-02 Corrupt JSON event | Corrupt event input | Event file contains malformed JSON. | Event reader exits non-zero, prints path, writes nothing. |
| NEG-03 Missing required event field | Corrupt event input | Event omits `event_id`, `event_type`, `task_id`, `created_at`, or object payload. | Strict materialization fails before writes. |
| NEG-04 Unsupported schema | Corrupt event input | `schema_version` is missing or not supported. | Fails loudly and does not fall back silently to stale JSON. |
| NEG-05 Duplicate same id/different hash | Duplicate event | Two files share `event_id` but different content. | Fatal conflict; no materialized outputs written. |
| NEG-06 Duplicate active task lock | Duplicate lock | Two unreleased locks for one task. | Dispatch/status/materialization fails until resolved or marked stale by policy. |
| NEG-07 Duplicate active Agent lock | Duplicate lock | One Agent owns multiple active task locks. | Dispatch readiness fails; runner marks items skipped or blocks execute. |
| NEG-08 Stale lock | Stale lock | Lock references missing task, non-active task, wrong owner, or expired future stale policy. | Status reports inconsistency; dispatch and execute do not claim/run the task. |
| NEG-09 Codex missing | Codex failure | Execute requested with no detectable Codex CLI. | Runner and `agent-cycle --apply --execute` fail before Agent launch. |
| NEG-10 Codex non-zero | Codex failure | Fake Codex exits non-zero in isolated fixture. | Run log records exit code; summary marks failed; no additional tasks launch after failure. |
| NEG-11 Validation command failure | Validation failure | Stub validation command or fixture typecheck exits non-zero. | Integration/validation run exits non-zero and does not report GO. |
| NEG-12 Audit failure | Validation failure | Result includes forbidden path or path outside task `allowed_paths`. | Audit exits non-zero; no `AUDITED` status/event is written in dry-run. |
| NEG-13 Parallel execute before V2-A | V2-B guard | `--apply --execute --parallel 2|3|5 --precheck-only`. | Fails before Codex with event-sourced completion dependency message. |
| NEG-14 Non-bookkeeping merge conflict | Integration guardrail | Agent branch conflicts outside queue bookkeeping files. | Merge aborts and requires human review. |

## 8. Required Command Set

Current documentation-only validation for this task:

```bash
git status --short
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

Future implementation validation should add focused script syntax checks and fixture runs:

```bash
node --check ops/agent-orchestrator/scripts/claim-task.mjs
node --check ops/agent-orchestrator/scripts/complete-task.mjs
node --check ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs
node --check ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs
node --check ops/agent-orchestrator/scripts/reconcile-task-results.mjs
node --check ops/agent-orchestrator/scripts/integrate-agent-results.mjs
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 1
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 2
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 3
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 5
```

## 9. Pass Criteria

V2-A passes when:

- Legacy-only JSON workflows still parse and run.
- Event files can generate queue, locks, results, per-task summaries, and audit state deterministically.
- Corrupt events and duplicate conflicting events fail before writes.
- Dry-run/no-write modes leave all inputs and outputs unchanged.
- Generated legacy JSON remains consumable by current status, audit, integration, and validation commands.

V2-B passes when:

- `--parallel 1`, `2`, `3`, and `5` are accepted in dry-run planning.
- Invalid parallel values fail before execution.
- `--parallel > 1` execute mode remains blocked until V2-A event-first completion/result writes are available.
- Codex missing/non-zero failures are captured without hidden merge, push, deploy, or production operations.
- Integration apply blocks HIGH-risk and non-bookkeeping conflicts, and queue bookkeeping conflicts are regenerated from the read model.
