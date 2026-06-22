# Agent Platform V3 User Flow Acceptance Checklist

Date: 2026-06-22
Status: low-risk documentation acceptance checklist

## 1. Scope

This checklist validates the user-facing ANKSEN Agent Studio V3 documentation created for the productization and user-flow task.

It is limited to documentation review. It must not run production deploy, migration, seed, cleanup, reset, prune, truncate, database operations, merge, push, or agent execution.

## 2. File Existence Checks

| Check | Expected result | Status |
|---|---|---|
| `docs/release/anksen-agent-studio-v3-user-flow.md` exists. | User flow doc is present. | Pending reviewer check |
| `docs/release/agent-platform-v3-productization-notes.md` exists. | Productization notes are present. | Pending reviewer check |
| `docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md` exists. | Checklist is present. | Pending reviewer check |
| `ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md` exists. | Task report is present. | Pending reviewer check |

## 3. User Flow Content Checks

| Check | Expected result | Status |
|---|---|---|
| Natural-language goal entry is documented. | The flow starts from an operator-entered goal. | Pending reviewer check |
| Goal Engine review is documented. | Current state, target state, gaps, risks, and recommended tasks are visible. | Pending reviewer check |
| Planner Agent draft is documented. | REQ, TECH, task queue, dispatch, and validation plan drafts are explained. | Pending reviewer check |
| Dry-run review is documented. | The operator can inspect generated work before execution. | Pending reviewer check |
| Human approval gate is documented. | Execution is blocked until explicit approval. | Pending reviewer check |
| Agent-cycle handoff is documented. | Approved work enters the existing claim, execute, validate, report flow. | Pending reviewer check |
| Progress and gap review is documented. | The flow returns to remaining goal gaps after task results. | Pending reviewer check |

## 4. Productization Content Checks

| Check | Expected result | Status |
|---|---|---|
| ANKSEN Agent Studio positioning is clear. | The product is positioned as approval-gated goal-driven agent work. | Pending reviewer check |
| User roles are listed. | Goal sponsor, operator, reviewer, agent owner, QA/release reviewer, and auditor needs are covered. | Pending reviewer check |
| Product principles are documented. | Approval, evidence, bounded autonomy, role-aware work, and repeatable progress are covered. | Pending reviewer check |
| V3 capabilities are connected to product value. | Goal Engine, Planner Agent, Agent Registry, dry run, approval, agent-cycle, and progress review are explained. | Pending reviewer check |
| Non-goals are explicit. | Unattended production operations, merge, push, deploy, migration, seed, reset, cleanup, and bypassed approval are excluded. | Pending reviewer check |

## 5. Safety And Boundary Checks

| Check | Expected result | Status |
|---|---|---|
| No frontend implementation changes are required. | Documentation only. | Pending reviewer check |
| No `apps/**` or `packages/**` files are changed. | Business and UI code remain untouched. | Pending reviewer check |
| No `database/**` files are changed. | No migrations or seed changes. | Pending reviewer check |
| No `infra/**`, `.github/**`, Docker, deploy, auth, or env files are changed. | Runtime and production configuration remain untouched. | Pending reviewer check |
| No secrets, credentials, production accounts, or connection strings are introduced. | Docs contain no sensitive material. | Pending reviewer check |
| No production or destructive command is required. | Checklist remains low-risk. | Pending reviewer check |

## 6. Suggested Low-Risk Commands

Run from the repository root:

```bash
git status --short
test -f docs/release/anksen-agent-studio-v3-user-flow.md
test -f docs/release/agent-platform-v3-productization-notes.md
test -f docs/testing/agent-platform-v3-user-flow-acceptance-checklist.md
test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A1-PRODUCT-DOCS.md
git diff --check
git status --short
```

Optional path-boundary review:

```bash
git status --short | awk '{print $2}' | grep -Ev '^(docs/release/|docs/testing/|ops/agent-orchestrator/reports/|ops/agent-orchestrator/results/|ops/agent-orchestrator/events/|ops/agent-orchestrator/queue/)'
```

The optional command should print nothing for a clean documentation-only worker result, except that required `complete-task.mjs` bookkeeping may refresh orchestrator event and queue read-model files.

## 7. Acceptance Result Template

```text
Result: PASS / FAIL
Reviewed by:
Date:
Docs reviewed:
Commands run:
Failed checks:
Skipped checks and reasons:
Remaining documentation gaps:
```

