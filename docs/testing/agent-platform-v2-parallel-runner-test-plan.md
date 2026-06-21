# Agent Platform V2 Parallel Runner Test Plan

Task: `AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER`

## Required Validation

Run from the repository root:

```bash
git status --short
node --check ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

## Focused CLI Checks

Default parallelism:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run
```

Expected:

- Prints `Parallelism: 1`.
- Prints `Planned parallel batches`.
- Does not execute Codex.
- Does not write `ops/agent-orchestrator/runs/agent-run-plan.md` unless `--write-plan` or `--apply` is used.

Accepted parallel values:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 1
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 2
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 3
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 5
```

Expected:

- Each command exits 0.
- Each command prints the selected `Parallelism`.
- Each command prints planned batches and per-task log paths.
- No Codex agent is executed.

Rejected parallel values:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 0
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel 4
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --dry-run --parallel all
```

Expected:

- Each command exits non-zero.
- The error says the value is invalid and lists `1`, `2`, `3`, and `5`.
- No Codex agent is executed.

Parallel execution block:

```bash
node ops/agent-orchestrator/scripts/run-claimed-agent-prompts.mjs --apply --execute --parallel 2 --precheck-only
```

Expected:

- Execution precheck fails.
- The failure says `--apply --execute --parallel > 1` is blocked until event-sourced task completion/result writes are available.
- No Codex agent is executed.

## Regression Risks

- The default runner path must remain plan-first and no-write.
- `orchestratorctl.mjs agent-cycle --dry-run` must continue to call the runner with default serial planning behavior.
- Existing guardrails against merge, push, deploy, production operations, database cleanup/reset, seed, and migration must remain visible in runner output and docs.
