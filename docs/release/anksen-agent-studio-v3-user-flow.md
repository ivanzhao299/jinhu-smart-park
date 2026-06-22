# ANKSEN Agent Studio V3 User Flow

Date: 2026-06-22
Status: planning-only product documentation
Related plan: `docs/release/AGENT_PLATFORM_V3_PLAN.md`

## 1. Purpose

ANKSEN Agent Studio V3 turns an operator's natural-language product or engineering goal into a reviewed, approval-gated agent work cycle.

The intended operator flow is:

```text
natural-language goal
-> Goal Engine
-> gap analysis and target state
-> Planner Agent
-> draft REQ / TECH / task queue / validation plan
-> dry-run review
-> human approval
-> agent-cycle execution
-> progress and gap review
```

This document explains the user-facing flow for operators. It does not enable unattended execution and does not change product code, business data, migrations, deployment, auth, CI, Docker, or production configuration.

## 2. Operator Entry Point

The V3 flow starts when an operator enters a goal in plain language, for example:

```text
继续把 Agent Studio 提升到 98%
```

The operator should be able to provide:

- a goal statement;
- optional target maturity or target date;
- known constraints, such as docs-only, no production operations, or no app code changes;
- preferred validation level, such as dry-run only, docs checks, typecheck, or release smoke;
- approval contacts for generated work.

The first product promise is that the operator describes the desired outcome, not a manually split task list.

## 3. Goal Review

After goal entry, the Goal Engine prepares a structured goal state for review.

The operator reviews:

- current maturity and evidence;
- target maturity;
- capability scores;
- gaps;
- milestones;
- recommended task candidates;
- risk level;
- recommended agent owners.

The operator can accept the goal state, edit the goal constraints, or stop the flow before any queue or execution action is taken.

## 4. Planner Draft

After the operator accepts the goal state, the Planner Agent prepares draft planning artifacts:

- REQ summary;
- TECH summary;
- task queue candidates;
- agent assignments;
- allowed and forbidden paths;
- risk assessment;
- validation commands;
- expected outputs.

The planner output is still a draft. At this point, generated tasks must not be treated as execution-ready work unless the operator explicitly approves them.

## 5. Dry-Run Review

Before approval, ANKSEN Agent Studio shows a dry-run review.

The review should answer these operator questions:

- What work would be created?
- Which agent would own each task?
- Which files or path groups are allowed?
- Which files or path groups are forbidden?
- Which checks would run?
- Which actions are blocked without human approval?
- Does any task touch production, auth, deploy, Docker, CI, database, migration, seed, or business code?

The dry run is a safety checkpoint. It should not dispatch agents, modify production data, merge, push, deploy, migrate, seed, reset, prune, or clean up runtime state.

## 6. Approval Gate

The approval gate is the boundary between planning and execution.

An operator may approve:

- the goal state;
- the planner draft;
- the generated task queue;
- the dispatch plan;
- the validation plan.

Approval should be explicit and auditable. V3 must continue to stop before execution when:

- generated tasks include a high-risk path;
- ownership is missing;
- validation commands are missing;
- the worktree is unexpectedly dirty;
- the request includes production deploy, migration, seed, reset, cleanup, or production data writes;
- the request includes merge or push without explicit approval;
- the request expands beyond the reviewed scope.

## 7. Agent-Cycle Execution

After approval, the system may enter the existing agent-cycle flow.

The execution flow should remain familiar:

```text
claim task
-> complete scoped work
-> run required validation
-> record result
-> report changed files, checks, skipped checks, risks
```

The operator should see task progress, result artifacts, failed checks, blocked tasks, and remaining gaps. The V3 product experience is not just task dispatch; it is a goal progress loop.

## 8. Progress And Gap Review

When agent-cycle work finishes, the operator reviews whether the goal moved closer to the target.

The review should include:

- completed tasks;
- validation results;
- remaining gaps;
- blocked capabilities;
- changed risk posture;
- next recommended tasks;
- whether another approval is needed for the next loop.

This keeps the system focused on the user's target state rather than only on individual task completion.

## 9. Operator Safety Expectations

Operators should be able to trust these V3 safety rules:

- Natural-language input creates planning output first, not immediate execution.
- Planner output stays draft until approved.
- Agent execution requires a reviewed dispatch plan.
- High-risk work requires explicit human approval.
- Production operations are never unattended.
- Merge, push, deploy, migration, seed, reset, cleanup, and production data writes are out of scope unless separately approved.
- Each completed task records changed files, validation, skipped checks, and remaining risks.

## 10. Expected V3 Operator States

| State | Operator meaning | Allowed next action |
|---|---|---|
| Goal Draft | Goal has been entered but not accepted. | Edit, cancel, or request analysis. |
| Goal Review | Current state, target state, gaps, and risks are ready. | Approve goal state or revise constraints. |
| Planner Draft | REQ, TECH, task queue, dispatch, and validation drafts exist. | Run dry-run review or revise planner output. |
| Awaiting Approval | Dry-run review is ready and execution is blocked. | Approve, reject, or request changes. |
| Approved For Agent-Cycle | Operator has approved the reviewed plan. | Claim and execute tasks through agent-cycle. |
| In Progress | Agents are working on approved tasks. | Monitor progress, failures, and blockers. |
| Review Results | Tasks have reported completion or failure. | Accept results, request fixes, or start another goal loop. |

## 11. Documentation Gaps

This product flow still needs future alignment with:

- final UI labels and screen structure;
- role and permission matrix for goal approval;
- final Goal Engine and Planner Agent schema behavior;
- audit log presentation;
- operator-facing error and blocked-state messages.

