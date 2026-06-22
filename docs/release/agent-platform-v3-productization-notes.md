# Agent Platform V3 Productization Notes

Date: 2026-06-22
Status: planning-only product documentation
Related plan: `docs/release/AGENT_PLATFORM_V3_PLAN.md`

## 1. Product Positioning

ANKSEN Agent Studio is the operator-facing product layer for the Agent Platform.

The product positioning for V3 is:

> ANKSEN Agent Studio helps operators turn a natural-language goal into reviewed planning artifacts, approval-gated agent work, validation evidence, and measurable progress toward the target state.

V3 moves the platform from "execute known tasks" toward "plan and govern goal-driven work." It should not be positioned as an unattended production automation system.

## 2. Product Promise

For operators, V3 should provide four practical outcomes:

1. Convert a goal into structured work.
2. Make gaps, risk, ownership, and validation visible before execution.
3. Require explicit approval before generated work enters agent-cycle.
4. Preserve evidence after execution so the next loop starts from a clearer state.

## 3. Core User Roles

| Role | Primary job | V3 product need |
|---|---|---|
| Goal Sponsor | Defines the business or platform target. | Plain-language goal entry, target maturity, and outcome review. |
| Platform Operator | Runs the Agent Studio workflow. | Goal state review, dry-run review, approval controls, progress tracking. |
| Planner Reviewer | Reviews generated REQ, TECH, tasks, risks, and checks. | Clear planner output, owner assignment, validation coverage, non-goal enforcement. |
| Agent Owner | Executes or supervises assigned agent lane work. | Scoped tasks, allowed paths, forbidden paths, acceptance criteria, validation commands. |
| Release / QA Reviewer | Confirms checks and release safety. | Checklists, failed-check visibility, skipped-check reasons, remaining risk summary. |
| Auditor | Reviews evidence after the fact. | Result artifacts, changed files, approval state, commands run, no-merge/no-push evidence. |

## 4. Operator Workflow Surface

The V3 product surface should organize work around goal progress:

```text
Goal
-> Goal State
-> Planner Draft
-> Dry-Run Review
-> Approval
-> Agent-Cycle
-> Validation Evidence
-> Remaining Gaps
```

This means the primary user object is the goal, not an isolated task. Tasks are generated and executed only as reviewed steps toward that goal.

## 5. Product Principles

### Approval before action

Generated plans stay drafts until a human approves them. Approval must be explicit enough for an operator or auditor to understand who approved what and what was in scope.

### Evidence over optimism

The product should report validation commands, changed files, failed checks, skipped checks, and remaining risks. A green status without evidence is not enough for V3.

### Bounded autonomy

The system may automate planning, routing, draft generation, and dry-run validation. It must not silently cross into production operations, merge, push, deploy, migration, seed, reset, cleanup, or production data writes.

### Role-aware work

Planner output should assign work to agents based on registry or router rules. Operators should be able to see why an agent was selected and what boundaries apply to the task.

### Repeatable progress loop

After execution, results should update the operator's understanding of goal maturity, remaining gaps, and next recommended tasks.

## 6. V3 Product Capabilities

| Capability | Product value | User-facing artifact |
|---|---|---|
| Goal Engine | Turns natural language into a structured target and gap model. | Goal state with maturity, gaps, risks, and milestones. |
| Planner Agent | Turns goal state into execution-ready planning drafts. | REQ, TECH, task candidates, assignments, validation plan. |
| Agent Registry | Makes agent ownership visible and less hard-coded. | Agent lane profile, domains, limits, allowed paths, fallback order. |
| Dry-Run Review | Lets operators inspect planned work before execution. | Preview of tasks, owners, risks, checks, and blocked actions. |
| Approval Gate | Prevents unintended execution. | Approval state and scope record. |
| Agent-Cycle Handoff | Uses the existing orchestrator execution path after approval. | Claimed tasks, reports, result JSON, status updates. |
| Progress Review | Keeps attention on the goal, not only task completion. | Remaining gap summary and next-loop recommendation. |

## 7. Non-Goals

V3 productization does not mean:

- unattended production deploy;
- unattended migration, seed, cleanup, reset, backup restore, or production data write;
- automatic merge or push;
- bypassing human approval for generated task queues;
- replacing release owners, QA reviewers, or domain experts;
- allowing natural-language input to override forbidden paths;
- modifying business code without scoped approval;
- replacing current validation gates with AI judgment;
- promising a fixed maturity score without evidence.

## 8. First Release Packaging

For a first V3 release, ANKSEN Agent Studio should be packaged as an operator workflow with:

- goal entry and goal-state review;
- planner draft review;
- dry-run task and validation preview;
- approval gate;
- agent-cycle handoff;
- result and remaining-gap review;
- clear blocked states for unsafe or incomplete plans.

The first release should avoid broad claims about full autonomy. The strongest product message is controlled acceleration: planning and execution get faster, but the operator remains in charge of approval and risk.

## 9. Open Product Questions

- What role is allowed to approve generated task queues?
- Should approval be per goal, per planner draft, per task, or per risk tier?
- What UI language should distinguish dry-run drafts from execution-ready tasks?
- How should maturity score changes be supported by evidence?
- Which audit events must be visible in the product surface?
- How should blocked production-operation requests be explained to operators?

