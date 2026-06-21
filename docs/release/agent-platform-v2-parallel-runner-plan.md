# Agent Platform V2 Parallel Runner Plan

Task: `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER`

## Scope

This plan defines the `run-claimed-agent-prompts.mjs` parallel-runner interface for Agent Platform V2. The implementation keeps the existing serial execution path as the default safe mode and introduces bounded parallel planning output for future event-first execution.

In scope:

- Accept `--parallel 1`, `--parallel 2`, `--parallel 3`, and `--parallel 5`.
- Default to `--parallel 1`.
- Print planned parallel batches during dry-run.
- Preserve the existing no-deploy, no-push, no-merge, no-production-operation guardrails.
- Keep real execution serial until event-sourced completion/result writes exist.

Out of scope:

- Business code changes.
- Migrations, seed changes, deploy changes, Docker changes, CI changes, auth changes, SMS, or WeChat runtime configuration.
- Merge, push, production deploy, production data operation, or database reset.

## CLI Contract

Supported values:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 1
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 2
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 3
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 5
```

The default is equivalent to:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 1
```

Invalid values fail before execution, including `--parallel 0`, `--parallel 4`, and `--parallel all`.

## Planning Output

Dry-run and plan output must show:

- Selected parallelism.
- Execution policy.
- Planned parallel batches.
- Per-task owner, worktree, prompt file, run log file, branch, cleanliness, and suggested Codex command.
- Skipped items and skip reasons.

Runnable tasks are ordered by priority, `created_at`, owner, and task id before batching.

## Execution Policy

`--apply --execute --parallel 1` remains the only executable mode for now. It preserves the existing prechecks:

- Codex CLI must be detected.
- Main worktree must be clean except for the runner-generated plan file.
- Each agent worktree must be clean.
- Each task must have a matching active lock.
- Each task must still be `CLAIMED`.
- Each prompt file must exist and match `<task_id>-<agent>.prompt.md`.

`--apply --execute --parallel 2`, `--parallel 3`, and `--parallel 5` are accepted by the CLI but blocked by execution precheck until completion/result writes move to event sourcing.

## Per-Agent Outputs

Each runnable item has independent state:

- Prompt: `ops/agent-orchestrator/runs/<task_id>-<agent>.prompt.md`
- Worktree: the agent worktree path from `agents.config.json`
- Log: `ops/agent-orchestrator/runs/<task_id>-<agent>.run.log`
- Exit code: captured from the Codex CLI subprocess
- Summary row: task id, agent, worktree, prompt file, log file, start time, finish time, exit code, status, and failure reason

## Failure Strategy

Current executable mode is serial:

1. Run one task at a time.
2. If a task exits non-zero, stop immediately.
3. Print the aggregated summary for all started tasks.

Future event-first parallel mode must use this strategy:

1. Launch at most `parallel` tasks.
2. After the first non-zero exit, stop launching new tasks.
3. Allow already-started tasks to finish.
4. Mark finished tasks as `success` or `failed`.
5. Mark skipped pre-run items as `skipped`.
6. Mark runnable but never-started tasks as `not_started`.
7. Print an aggregated summary with failure reasons and log paths.

## Event-Sourcing Dependency

Safe parallel execution cannot write completion state through shared queue JSON. Multiple agents finishing concurrently can create conflicting updates to `task-queue.json`, `task-locks.json`, and `task-results.json` during completion or later integration.

Parallel completion requires:

- One independent result event per task/agent.
- No direct concurrent writes to shared queue/result JSON.
- A read-model builder that regenerates legacy queue JSON centrally.

Until those conditions are met, `--parallel > 1` remains a dry-run and plan-preview capability only.

## Rollback

Rollback is straightforward:

- Run without `--parallel` or with `--parallel 1`.
- Keep using guarded serial `--apply --execute --parallel 1`.
- Remove generated `agent-run-plan.md` if the plan was written during apply-mode testing.
