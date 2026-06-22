# Agent Registry And Dynamic Agent Pool Design Report

## Agent

`agent-4`

## Branch

`agent-4-dashboard-mobile-rbac`

## Task

- Task ID: `AGENT-PLATFORM-V3-A4-AGENT-REGISTRY`
- Batch ID: `AGENT-PLATFORM-V3-ROUND1-20260622`
- Title: Agent Registry and dynamic Agent Pool design
- Domain: `agent-registry-dynamic-pool`
- Risk: `MEDIUM`

## Status

DONE

## Changed Files

- `docs/release/agent-platform-v3-agent-registry-design.md`
- `docs/testing/agent-platform-v3-agent-registry-checklist.md`
- `ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md`
- `ops/agent-orchestrator/results/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.json`

## Registry Review

Reviewed:

- `ops/agent-orchestrator/agent-registry/agent-registry.schema.json`
- `ops/agent-orchestrator/agent-registry/agent-registry.example.json`
- `ops/agent-orchestrator/agent-router-rules.json`
- `ops/agent-orchestrator/specs/TECH-AGENT-PLATFORM-V3.md`

Findings:

- The registry schema parses as JSON and defines version, update time, agent list, status enum, risk enum, path lists, priority, and fallback order.
- The registry example parses as JSON and covers `agent-1`, `agent-2`, `agent-3`, `agent-4`, and `agent-5`.
- All five example agents are currently `ACTIVE`.
- The example includes registry ownership for Agent Registry and dynamic Agent Pool under `agent-4`.
- Current router compatibility is preserved by keeping the same owner ids and by documenting router-to-registry field mapping.

## Validation

| Command | Result |
|---|---|
| `git status --short` | PASS. Initial status was clean before task edits. |
| `test -f docs/release/agent-platform-v3-agent-registry-design.md` | PASS. |
| `test -f docs/testing/agent-platform-v3-agent-registry-checklist.md` | PASS. |
| `node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.schema.json','utf8')); JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/agent-registry/agent-registry.example.json','utf8'));"` | PASS. |
| `test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A4-AGENT-REGISTRY.md` | PASS. |
| `git diff --check` | PASS. |
| `git status --short` | PASS. Only expected allowed-path files are changed. |

## Skipped

| Item | Reason |
|---|---|
| Local commit | Task has `allow_commit=false`. |
| `complete-task.mjs` writer | The script also appends event files and rebuilds queue/read-model JSON outside the task's allowed paths. A result JSON was written directly under the allowed `ops/agent-orchestrator/results` path instead. |
| Browser/mobile inspection | No frontend page or UI implementation was modified. |
| Production, deploy, migration, seed, cleanup, merge, push | Explicitly forbidden by task boundaries. |

## Remaining Migration Questions

1. Confirm whether the future live registry should be `agent-registry.example.json`, a new `agent-registry.json`, or an event/read-model artifact.
2. Decide whether `fallback_order` replaces router `fallback_priority` or remains a registry-only tie-breaker during migration.
3. Add a semantic validator for unique `agent_id`, unique fallback order, owner set parity with router rules, and domain parity with current router domains.
4. Decide how dispatcher should treat existing locks when an agent changes from `ACTIVE` to `PAUSED`, `MAINTENANCE`, or `DISABLED`.
5. Decide whether registry status changes need append-only event records for auditability.

## Risks

- The current schema validates shape but does not fully enforce cross-agent uniqueness or router parity by itself.
- The registry is not yet wired into planner or dispatcher code; the design intentionally keeps router compatibility as the migration guard.
- Because `complete-task.mjs` was not run, queue status and event read models were not updated by this worker to avoid disallowed path writes.

## Merge Recommendation

YES, after orchestrator review confirms that the skipped `complete-task.mjs` writer is acceptable for this path-boundary-limited worker task.
