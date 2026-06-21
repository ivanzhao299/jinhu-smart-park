# Orchestrator Spec Template

## Spec ID
SPEC-YYYYMMDD-N

## Linked Request
- Intake file:
- Request ID:

## REQ: Requirement Summary

### Goal

### Non-Goals

### Acceptance Criteria
1. 
2. 
3. 

### Safety Constraints
- No business code change outside explicitly allowed paths.
- No migration creation unless explicitly approved.
- No old migration edits.
- No auth, CI, Docker, deploy, SMS, or WeChat runtime changes unless explicitly approved.
- No secrets, tokens, passwords, production connection strings, or real production accounts.
- Merge, push, deploy, and production data operations require human confirmation.

## TECH: Task Decomposition

### Domain Mapping
| Domain | Agent | Reason |
|---|---|---|
| assets / space / tenant | agent-1 | |
| leasing / finance | agent-2 | |
| operations / IoT / safety | agent-3 | |
| dashboard / mobile / RBAC | agent-4 | |
| testing / release | agent-5 | |

### Proposed Tasks
| Task ID | Owner | Priority | Risk | Summary | Human Approval Required |
|---|---|---|---|---|---|
| | | | | | |

### Allowed Paths
- 

### Forbidden Paths
- apps/api unless explicitly scoped
- apps/web unless explicitly scoped
- packages unless explicitly scoped
- database/migrations
- database/seeds
- infra
- auth / CI / Docker / deploy related files unless explicitly approved

### Validation Plan
| Command | Owner | Required Before Merge | Notes |
|---|---|---:|---|
| pnpm typecheck | orchestrator / agent | yes | |

### Rollback / Stop Conditions
- Stop if any worktree is not clean before sync or merge.
- Stop if typecheck or relevant e2e fails.
- Stop if changed files exceed allowed paths or hit forbidden paths.
- Stop before merge, push, deploy, production data writes, or migration until human approval is recorded.

## Queue Generation Notes
- Queue file: `ops/agent-orchestrator/queue/task-queue.json`
- Locks file: `ops/agent-orchestrator/queue/task-locks.json`
- Results file: `ops/agent-orchestrator/queue/task-results.json`
