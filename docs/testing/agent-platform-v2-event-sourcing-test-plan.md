# Agent Platform V2 Event Sourcing Test Plan

## 1. Scope

This plan verifies the first event-sourcing queue foundation for Agent Orchestrator. The phase is orchestrator-only and must not modify business code, production data, migrations, seeds, deploy scripts, Docker, auth, CI, or infrastructure.

## 2. Safety Rules

- Do not run Agent tasks during this test plan.
- Do not run `bootstrap-event-store.mjs --apply` unless the operator explicitly approves event file creation.
- Do not run `rebuild-queue-read-model.mjs --apply` unless the operator explicitly approves queue JSON regeneration.
- Do not run production deploy, production migration, production seed, database reset, cleanup, or destructive file operations.
- Treat `task-queue.json`, `task-locks.json`, and `task-results.json` as compatibility read models during this phase.

## 3. Syntax Checks

Run:

```bash
node --check ops/agent-orchestrator/scripts/lib/event-store-utils.mjs
node --check ops/agent-orchestrator/scripts/bootstrap-event-store.mjs
node --check ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs
```

Expected:

- All commands pass.
- No files are changed.

## 4. Bootstrap Dry Run

Run:

```bash
node ops/agent-orchestrator/scripts/bootstrap-event-store.mjs --dry-run
```

Expected:

- Command prints planned event count.
- Command prints event type counts.
- Command prints `mode: dry-run; no event files were written`.
- `git status --short` does not gain event JSON files from this command.

## 5. Bootstrap Apply Idempotency

Only run after explicit approval:

```bash
node ops/agent-orchestrator/scripts/bootstrap-event-store.mjs --apply
node ops/agent-orchestrator/scripts/bootstrap-event-store.mjs --apply
```

Expected:

- First run writes deterministic bootstrap events.
- Second run reports existing/skipped events instead of writing duplicates.
- Event files remain append-only.
- Existing queue JSON remains compatible.

## 6. Rebuild Dry Run

Run:

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --dry-run
```

Expected:

- Command prints task event count.
- Command prints changed summary for queue, locks, and results.
- Command prints `mode: dry-run; no compatibility JSON files were written`.
- Existing `queue/*.json` files are not modified.

## 7. Rebuild Apply Schema Compatibility

Only run after explicit approval:

```bash
node ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs --apply
```

Expected:

- `task-queue.json` still has `$schema`, `version`, `updated_at`, and `tasks`.
- Each task still keeps required task queue fields.
- `task-locks.json` still has `version`, `updated_at`, and `locks`.
- `task-results.json` still has `version`, `updated_at`, and `results`.
- `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs` still passes.

## 8. Existing Compatibility Checks

Run after dry-run checks:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
```

Expected:

- Existing queue/lock/result compatibility remains intact.
- Doctor does not report event-store changes as business-code risk.
- Agent-cycle dry-run still plans from compatibility JSON.

## 9. Workspace Checks

Run:

```bash
git diff --check
pnpm typecheck
```

Expected:

- No whitespace errors.
- Typecheck passes.
- Changed files are limited to orchestrator scripts, orchestrator events placeholders, orchestrator docs/reports/specs, and release/testing docs.

## 10. No Business File Changes

Confirm no changes under:

```text
apps/**
packages/**
database/**
infra/**
.github/**
Docker / deploy / auth related files
```

Expected:

- No business code, schema, migration, seed, infra, CI, Docker, auth, deploy, or production operation changes.

## 11. Regression Risks

Known risks to monitor in later phases:

- Bootstrap events generated from historical compatibility JSON may preserve historical inconsistencies.
- Read model rebuild must not be used as a conflict resolver until event coverage is complete.
- Parallel runner execution must remain disabled for `--parallel > 1` until completion/result writes are event-first.
- Agents must not write compatibility JSON concurrently after event-first completion is introduced.
