# Cost-Controlled Development Mode

Effective 2026-09-06. This is the repository default for current and subsequent
continuous development tasks. It reduces wasted computation, not scope, quality,
necessary tests, security, or end-to-end acceptance. Continue useful work normally.

## A–E execution loop

1. **A — Minimal analysis:** confirm working directory, branch, worktree/dirty state
   and any actual live process. Read only the task's modules, recent changes,
   interfaces, tests and required configuration. Reuse the existing task note,
   repository map, architecture/ADR and previous evidence. Use relevant ranges of
   large files; no default monorepo scan or repeated architecture reconstruction.
2. **B — Batch implementation:** analyze once, make the main coherent changes,
   preserving existing branches, worktrees, dirty changes and other active tasks.
3. **C — Targeted verification:** file/module tests, affected package tests, type
   checks and lint. Reserve full suites for merge, milestone acceptance or genuine
   cross-module impact. Do not rerun an unchanged failing test without new evidence.
4. **D — Evidence-driven repair:** fix the specific observed failure. Prefer local
   Shell, Git, ripgrep, AST/static analysis, type checks and existing logs over extra
   model calls. A failure does not restart the whole workflow.
5. **E — Final verification:** prove the required behavior and save a compact state
   handoff. Do not declare completion from a narrow check or leave obvious debt.

For large work, use independently verifiable subtasks, one clear active subtask at
a time. Save its state at completion; do not carry dozens of context rounds or
re-read all history between subtasks. A handoff records commit, actual process/run
identity, changes, tests, root cause, retry count and next action, without secrets.

## Retry budget and blocking

- The same error/root cause permits **at most 2 automatic repair attempts**.
- If both fail, stop blind retries. Record the original error, both attempted
  remedies, current diff, test results and most likely cause. Perform one focused
  root-cause analysis before any new repair path.
- Environment, dependency, permission, external-service and configuration failures
  must not be handled by speculative business-code edits.
- If still unresolved, mark the affected task `BLOCKED`, preserve diagnostics and
  identify the necessary evidence/change. Do not loop indefinitely. Product-level
  goal status must also respect the product's separate blocked-audit rules.
- A process observation timeout is not a failure or permission to restart it.
  Recheck the same live handle; never start duplicate runners from a stale lock file.

## COST_GUARD

Enter `COST_GUARD` immediately for any of:

- More than 10 substantial model interactions on the same task.
- The same test failure occurring 3 or more times.
- Repeated large reads of the same files or repeated analysis/tests by agents.
- Prolonged work without effective changes or evidence changing the next action.
- Repeated planning/summaries without implementation progress.

Stop new agents and ineffective retries, condense context, identify the real blocker,
and execute only one minimal corrective path. Do not reduce acceptance criteria,
skip necessary tests/type/security checks, use a temporary bypass, or stop useful
development simply to conserve calls. No unbounded autonomous loops.

## Models, concurrency and output

- Default: 1 agent. At most 2–3 agents for demonstrably independent work; never
  overlap ownership, repeat analysis, or run duplicate tests. Use fewer if the
  environment has a lower limit. Migration writers remain strictly serial.
- Where the environment genuinely exposes model/reasoning selection, use lower
  cost for mechanical work, medium for ordinary development, and higher only for
  architecture, cross-module refactors, stubborn defects or security. Return to
  normal after the hard part. Never claim a model setting changed without evidence.
- Prefer one coherent execution batch over repeated model calls for confirmation,
  reinterpretation or summarization. Cache immutable evidence; refresh mutable
  Git/runtime/CI state when relevant, not merely to repeat an unchanged status.
- Keep routine messages brief: results, errors, tests, diff and blockers. Report
  meaningful changes and required interaction; avoid repetitive plans/status text.
  Use a concise summary at each task boundary, preserving required platform updates.

## Cost Summary (required)

```text
Task:
Status:
Files changed:
Tests run:
Retries:
Approx model rounds:
Repeated scans avoided:
Blocked issues:
Next step:
```

Record actual attempts and approximate rounds, not invented dollar costs. Distinguish
previous evidence from this task's new runs, synthetic tests from real-data/runtime
validation, and deployment success from successful production data import.
