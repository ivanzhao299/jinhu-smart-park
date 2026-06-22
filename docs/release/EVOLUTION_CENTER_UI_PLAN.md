# Evolution Center UI Plan

## Overview

Evolution Center is the Resident Observer surface for Agent Orchestrator. It is a platform-level view, not a worker agent page. The MVP should help the project owner understand whether the delivery factory is improving, stuck, or repeatedly hitting the same class of failure.

## Findings

The Findings view shows the latest observer output grouped by severity and area:

- Git / worktree
- Queue / locks / results
- Runner / Codex CLI
- Event Store
- Integration
- Validation
- Self-repair

Each finding should show message, suggested fix, risk, and whether auto-fix is allowed.

## Patterns

The Patterns view shows the failure pattern library:

- Pattern ID
- Title
- Symptoms
- Root causes
- Detection sources
- Occurrences
- Risk level
- Auto-fix eligibility
- Status

Top recurring failures should remain visible above the full table.

## Improvements

The Improvements view shows the backlog produced by the Evolution Planner:

- Improvement ID
- Linked pattern
- Priority
- Owner recommendation
- Risk level
- Validation plan
- Status

MVP actions are review-only. Creating real tasks still requires explicit approval.

## Learning Log

The Learning Log view lists historical observations and resolutions:

- Learning ID
- Pattern
- Incident
- Root cause
- Resolution
- Evidence references
- Follow-up
- Status

This should be append-friendly and filterable by pattern.

## Maturity

The Maturity view shows platform progress toward the current target:

- Current maturity score
- Target maturity score
- Capability areas
- Open gaps
- Recently resolved improvements
- Next recommended action

## Agent Performance

The Agent Performance view summarizes the five worker agents without creating an agent-6:

- Agent role
- Recent tasks
- Run log outcomes
- Commit/integration status
- Audit status
- Repeated blockers

The UI should make it clear that Resident Observer is a platform capability, not a worker agent.
