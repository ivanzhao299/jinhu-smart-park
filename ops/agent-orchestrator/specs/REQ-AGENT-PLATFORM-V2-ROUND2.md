# REQ: Agent Platform V2 Round 2

## 1. Requirement Goal

Advance Agent Orchestrator maturity from roughly 92% to 95%+ by planning:

- V2-C Project Runtime Memory.
- V2-D Smart E2E Selector.

This round is planning and task decomposition only. It does not implement business features, execute Agents, push, merge, deploy, or perform production operations.

## 2. Scope

### V2-C Project Runtime Memory

Goal: reduce repeated project scanning by giving Agents generated runtime inventories.

Required runtime inventories:

- `architecture.json`
- `api_inventory.json`
- `db_inventory.json`
- `module_inventory.json`
- `rbac_inventory.json`
- `workflow_inventory.json`
- `risk_inventory.json`

Planned directory:

```text
ops/agent-orchestrator/runtime/
```

Required commands:

- `runtime-generator.mjs --dry-run|--apply`
- `runtime-rebuild.mjs --dry-run|--apply`
- `runtime-validate.mjs --dry-run|--apply`

### V2-D Smart E2E Selector

Goal: select required validations from changed files and runtime inventories.

Required planned files:

- `selector-rules.json`
- `validation-matrix.json`
- `e2e-selector.mjs`

Inputs:

- changed files
- risk inventory
- module inventory

Outputs:

- required checks
- selected validations
- reasons
- skipped validations and why

Baseline checks must always remain:

- doctor
- audit
- typecheck

## 3. Non-Goals

Round 2 does not:

- modify `apps/**`
- modify `packages/**`
- modify `database/**`
- modify `infra/**`
- modify `.github/**`
- modify Docker, deploy, or auth files
- add migrations
- run Agents
- merge
- push
- deploy
- run production migration, seed, cleanup, reset, or production data writes

## 4. Functional Requirements

### 4.1 Runtime Memory

1. The system must define a runtime inventory directory under `ops/agent-orchestrator/runtime/`.
2. `architecture.json` must model modules, dependencies, and bounded contexts.
3. `api_inventory.json` must model controller, route, method, domain, and owner.
4. `db_inventory.json` must model database inventory without changing database schema.
5. `module_inventory.json` must map modules to paths, owners, risks, tests, and docs.
6. `rbac_inventory.json` must model menu, permission, guard, and role mapping.
7. `workflow_inventory.json` must model workflow, state, transition, and approver.
8. `risk_inventory.json` must model auth, RBAC, DB, workflow, finance, payment, and risk level.
9. Runtime generator/rebuild/validate commands must support `--dry-run` and `--apply`.
10. Dry-run must be no-write.

### 4.2 Smart E2E Selector

1. The selector must accept changed files as input.
2. The selector must read risk and module inventories.
3. The selector must output required checks.
4. The selector must always keep doctor, audit, and typecheck as baseline checks.
5. RBAC changes must select RBAC tests.
6. Finance changes must select finance tests.
7. Workflow changes must select workflow tests.
8. Low-risk docs-only changes may skip e2e with an explicit reason.
9. The selector must support `--dry-run`.
10. The selector must support `--explain`.

## 5. Agent Task Split

| Agent | Task ID | Responsibility |
|---|---|---|
| agent-5 | `AGENT-PLATFORM-V2-A5-RUNTIME-ARCH` | Runtime Memory overall architecture |
| agent-3 | `AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR` | Inventory generator/rebuild design |
| agent-4 | `AGENT-PLATFORM-V2-A4-E2E-SELECTOR` | Smart E2E Selector design |
| agent-2 | `AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION` | Compatibility, validation matrix, and runtime tests |

## 6. Acceptance Criteria

1. `docs/release/AGENT_PLATFORM_V2_ROUND2_PLAN.md` exists.
2. `REQ-AGENT-PLATFORM-V2-ROUND2.md` and `TECH-AGENT-PLATFORM-V2-ROUND2.md` exist.
3. `task-queue.json` contains 4 Round2 READY tasks.
4. `parallel-task-board.md` lists Round2 task ownership and expected outputs.
5. Queue, locks, and results JSON parse.
6. `check-dispatch-status` passes.
7. `doctor` runs.
8. `agent-cycle --dry-run` runs and does not execute Agents.
9. `git diff --check` passes.
10. `pnpm typecheck` passes.

## 7. Human Approval Requirements

Human approval remains mandatory for:

- `apps/**`
- `packages/**`
- `database/**`
- `infra/**`
- `.github/**`
- Docker, deploy, auth
- production deploy
- production migration
- production seed
- cleanup, reset, destructive operation
- production data writes
- merge and push
