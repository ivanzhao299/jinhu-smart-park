# Agent Studio V3 Goal Engine CLI Hardening

Date: 2026-06-22

## Scope

This note documents the Goal Engine `goal-to-queue` CLI contract after the V3-F hardening pass.

Changed scope is limited to orchestrator CLI behavior and release documentation. No business application code, database migration, production operation, auth configuration, CI workflow, Docker file, deployment script, seed, or runtime environment file is part of this change.

## Command Contract

The direct command now requires an explicit execution mode:

```bash
node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --apply
```

`orchestratorctl` enforces the same boundary:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text "继续把 Agent Studio 提升到 98%" --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs goal-to-queue --text "继续把 Agent Studio 提升到 98%" --apply
```

Calling either entry point without exactly one of `--dry-run` or `--apply` is a usage error. Passing both flags is also a usage error.

`orchestratorctl.mjs autonomous-loop` remains dry-run only. It rejects `--apply` and continues to chain goal-to-queue dry-run, Resident Observer dry-run, agent-cycle dry-run, and doctor.

Plain `orchestratorctl.mjs doctor` is report-only. If doctor returns `NO_GO`, the wrapper exits nonzero and does not launch self-repair apply. Operators must use an explicit repair command, starting with `orchestratorctl.mjs self-repair --dry-run`, before any apply repair is considered.

## Dry-Run Boundary

Dry-run mode is read-only.

It may:

- read the Agent Registry and router rules;
- construct the Goal Engine state, planner output, and queue task candidates in memory;
- validate generated task boundaries before printing output;
- print task owners, expected files, risks, and validation commands.

It must not write:

- goal generated artifacts;
- planner generated artifacts;
- `task.created` events;
- queue, lock, or result read models;
- evolution learning or state files;
- run logs, prompt files, commits, merges, pushes, deployment state, production data, database state, Docker state, or environment files.

## Apply Boundary

Apply mode is the only mode allowed to mutate orchestrator state.

The apply sequence is:

1. Build and validate generated tasks.
2. Create missing goal and planner generated artifacts without overwriting existing files.
3. Append deterministic `task.created` events using a stable idempotency key per generated task.
4. Rebuild compatibility queue, lock, and result read models from the event store.
5. Update evolution learning/state only when the goal-to-queue learning or next action is not already current.

The event store remains the source of truth for queue task creation. Compatibility JSON read models are rebuilt after event appends and are not the first write for queue state.

## Idempotency Contract

Repeated `--apply` for the same goal text and generated task set must be safe:

- existing goal/planner generated artifact files are preserved;
- duplicate `task.created` events are skipped by idempotency key or deterministic event id;
- queue read models are rebuilt from events;
- evolution learning/state files are not rewritten just to refresh timestamps when they already describe the same goal-to-queue outcome.

The command does not execute agents, claim tasks, merge branches, push branches, deploy, run migrations, seed data, reset databases, prune Docker, or touch business runtime code.

Plain doctor validation also follows that boundary: it can report `NO_GO`, but it must not apply self-repair unless an explicit fix or self-repair apply command is invoked by the operator.

## Operator Validation

Baseline checks for this boundary are:

```bash
node ops/agent-orchestrator/scripts/goal-to-queue.mjs --text "继续把 Agent Studio 提升到 98%" --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
pnpm typecheck
```

Before a real `--apply`, operators should review the dry-run output and confirm the generated task owners, allowed paths, forbidden paths, expected output files, and validation commands match the intended platform-only scope.
