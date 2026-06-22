# Agent Platform V3 Planner Dry-Run Checklist

Task: `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME`
Batch: `AGENT-PLATFORM-V3-ROUND1-20260622`
Owner: `agent-3`
Date: 2026-06-22

## 1. Scope

This checklist defines no-write validation checks for Agent Platform V3 Planner output. It verifies that planner output can be reviewed as a draft for REQ, TECH, task queue, dispatch, and validation planning without mutating live orchestrator state or business code.

The checklist does not execute Agents, write queue records from planner output, merge, push, deploy, run migrations, run seeds, reset data, clean production resources, or modify `apps/**`, `packages/**`, `database/**`, `infra/**`, `.github/**`, Docker, deploy, auth, or environment files.

## 2. Preflight

Run preflight from the repository root:

```bash
git status --short
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));"
```

Preflight pass criteria:

- Working tree changes are known and inside the current task's allowed paths.
- `planner-output.schema.json` parses as JSON.
- No command in the dry-run plan writes queue, event, lock, result, business, database, auth, CI, Docker, deploy, or environment files.

## 3. No-Write Invariants

Every planner dry-run validation must preserve these invariants:

- No live task is created from planner output.
- No task status changes.
- No task lock is created or removed.
- No task event is appended.
- No aggregate task result is rewritten.
- No Agent prompt is executed.
- No branch is merged or pushed.
- No deploy, migration, seed, cleanup, reset, prune, truncate, or production data operation is run.
- No business-code path changes.
- Any generated artifact is a draft under an explicitly allowed planning path.

## 4. Checklist Matrix

| Check | Area | Validation | Pass criteria |
|---|---|---|---|
| DRY-01 | Schema parse | Parse `planner-output.schema.json`. | JSON parse exits 0. |
| DRY-02 | Required fields | Validate planner output contains all required top-level fields. | Missing fields fail before drafts are used. |
| DRY-03 | Strict fields | Reject undeclared fields in top-level and nested planner objects. | Extra fields fail validation. |
| DRY-04 | REQ mapping | Map `req_summary.title`, `body`, and `non_goals` into a REQ draft. | REQ draft is generated as review-only content. |
| DRY-05 | TECH mapping | Map `tech_summary.title`, `body`, task paths, risks, outputs, and validations into a TECH draft. | TECH draft is generated as review-only content. |
| DRY-06 | Task candidates | Validate every task candidate has owner, domain, priority, risk, path boundaries, acceptance, validations, approval flag, and outputs. | Invalid candidates fail before queue draft creation. |
| DRY-07 | Queue draft | Convert task candidates into draft queue rows only in memory or an approved draft artifact. | `ops/agent-orchestrator/queue/task-queue.json` is unchanged. |
| DRY-08 | Event-first boundary | Confirm live queue writes are not attempted. | No `task.created`, lock, or result read-model file is written. |
| DRY-09 | Agent assignments | Validate assignment owners and task ids reference known candidates. | Unknown owners or orphan task ids fail validation. |
| DRY-10 | Dispatch preview | Validate dispatch modes are `dry-run`, `requires-human-approval`, or `ready-after-approval`. | Preview does not claim, lock, or execute tasks. |
| DRY-11 | Risk approval | Check `risk_assessment.requires_human_approval`, task `requires_human_approval`, and blocked paths. | Approval-required work remains blocked until explicit approval. |
| DRY-12 | Path boundaries | Compare every expected output and allowed path against task boundaries. | Business, database, infra, auth, CI, Docker, deploy, and env paths are rejected unless a later approved task explicitly allows them. |
| DRY-13 | Validation commands | Classify every proposed command by write risk. | Write, deploy, migration, seed, cleanup, reset, merge, push, and Agent execution commands are rejected for planner dry-run. |
| DRY-14 | Expected outputs | Confirm output paths are drafts and have clear purposes. | Draft outputs stay inside approved planning paths. |
| DRY-15 | No-write evidence | Compare `git status --short` before and after dry-run checks. | Only expected planning/report/result files appear. |

## 5. Negative Checks

Future automated planner validation should include fixture cases for:

| Case | Input defect | Expected result |
|---|---|---|
| NEG-01 | Malformed planner JSON. | Parse fails, no files written. |
| NEG-02 | Missing `source_goal_id`. | Validation fails before artifact generation. |
| NEG-03 | Missing `req_summary.non_goals` or `tech_summary.non_goals`. | Validation fails because summary objects are incomplete. |
| NEG-04 | Extra undeclared field in a task candidate. | Validation fails because schema objects are strict. |
| NEG-05 | Owner outside `agent-1` through `agent-5`. | Validation fails before dispatch preview. |
| NEG-06 | Priority outside `P0` through `P3`. | Validation fails before queue draft. |
| NEG-07 | Risk outside `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`. | Validation fails before approval gate. |
| NEG-08 | Dispatch mode outside the declared enum. | Validation fails before dispatch preview. |
| NEG-09 | Expected output under a forbidden path. | Validation fails path-boundary review. |
| NEG-10 | Validation command contains deploy, migration, seed, reset, cleanup, merge, push, or Agent execution. | Validation plan is rejected for planner dry-run. |
| NEG-11 | `requires_human_approval` is true but dispatch mode is treated as executable. | Validation fails approval gate. |
| NEG-12 | Planner output attempts to create queue lifecycle state directly. | Validation fails event-first boundary. |

## 6. Suggested No-Write Evidence Pattern

For a future planner CLI dry-run, capture before and after state:

```bash
git status --short
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));"
# future example only:
# node ops/agent-orchestrator/scripts/planner-dry-run.mjs --input fixture/planner-output.json --no-write
git diff --check
git status --short
```

Pass criteria:

- The schema parse command exits 0.
- Future planner dry-run exits 0 for valid fixtures and non-zero for negative fixtures.
- `git diff --check` exits 0.
- `git status --short` shows no unexpected writes.
- Queue, event, lock, result, business, database, auth, CI, Docker, deploy, and environment paths remain unchanged.

## 7. Current Task Validation

For `AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME`, run:

```bash
git status --short
test -f docs/release/agent-platform-v3-planner-runtime.md
test -f docs/testing/agent-platform-v3-planner-dry-run-checklist.md
node -e "JSON.parse(require('fs').readFileSync('ops/agent-orchestrator/planner/planner-output.schema.json','utf8'));"
test -f ops/agent-orchestrator/reports/AGENT-PLATFORM-V3-A3-PLANNER-RUNTIME.md
git diff --check
git status --short
```

These commands validate the current planning artifacts and planner schema parse status. They do not execute Agents, write queue records from planner output, or run production operations.
