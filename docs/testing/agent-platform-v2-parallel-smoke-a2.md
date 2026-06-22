# Agent Platform V2 Parallel 2 Smoke Checklist

Task: `AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2`
Owner: `agent-2`
Scope: orchestrator validation only. Do not change product code, production configuration, migrations, seeds, Docker, CI, deploy files, or production data.

## Preconditions

- Work from the repository root.
- Confirm the task is claimed by `agent-2` before recording completion.
- Use dry-run or read-only commands for dispatch, commit, integration, and doctor orientation unless the orchestrator owner explicitly approves a mutating command.
- Do not merge, push, deploy, run production operations, or create a local commit from this agent task.

## Checklist

| Area | Check | Safe command or evidence |
| --- | --- | --- |
| Dispatch preview | Parallel 2 dispatch should be previewed without changing queue, locks, prompts, or branches. | `node ops/agent-orchestrator/scripts/dispatch-ready-agents.mjs --dry-run` |
| Claimed locks | Claimed tasks should have one active matching lock, no duplicate lock, and no active lock for completed tasks. | `node ops/agent-orchestrator/scripts/check-dispatch-status.mjs` |
| Parallel 2 run plan | Claimed prompt execution should be planned in batches of at most 2 before execution. | `node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 2` |
| Run logs | Each executed prompt should have a corresponding `ops/agent-orchestrator/runs/*.run.log`; recent logs should be visible to doctor. | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` |
| Complete-task recording | Each agent should record final status with `complete-task.mjs`; result JSON and event/read-model updates should match the task outcome. | `node ops/agent-orchestrator/scripts/complete-task.mjs --task-id <task> --agent <agent> --status DONE --commit-hash "" --changed-files <files> --commands-run <commands> --passed-checks <checks> --failed-checks "" --notes <notes>` |
| Commit-agent-results | Agent branch commits should be previewed first, with allowed-path and risk checks visible before any apply step. | `node ops/agent-orchestrator/scripts/commit-agent-results.mjs --dry-run` |
| Integration | Integration should be previewed before applying merges or branch updates. | `node ops/agent-orchestrator/scripts/integrate-agent-results.mjs --dry-run` |
| Final doctor | Doctor should run after completion/commit/integration preview to surface queue, lock, result, run-log, and validation drift. | `node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor` |

## Mutating Steps Owned By Orchestrator

- `dispatch-ready-agents.mjs` without `--dry-run` may claim tasks and write prompts, queue, locks, dispatch report, and events.
- `run-claimed-agent-prompts.mjs --apply --execute --parallel 2` may execute Codex prompts and write run logs.
- `commit-agent-results.mjs --apply` may create local commits on agent branches.
- `integrate-agent-results.mjs --apply` may create or update integration branches.
- `orchestratorctl.mjs doctor --fix-apply` may apply only doctor-approved low-risk repairs.

These steps are not run by this smoke task. This task only documents the checklist and records its own completion.

## Completion Criteria

- Checklist file exists and names dispatch, claimed locks, run logs, `complete-task.mjs`, `commit-agent-results`, integration, and final doctor checks.
- Task report exists with safe commands and remaining risks.
- `complete-task.mjs` records the actual validation result for `AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2`.
- Final `git status --short` shows only task-scoped documentation plus orchestrator completion bookkeeping.
