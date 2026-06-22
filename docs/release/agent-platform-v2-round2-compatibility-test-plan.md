# Agent Platform V2 Round2 Compatibility Test Plan

Task: `AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-2`
Date: 2026-06-22

## 1. Goal

This plan defines how Agent Platform V2 Round2 will prove compatibility while adding Project Runtime Memory and a Smart E2E Selector.

Compatibility means:

- Current orchestrator status, doctor, audit, typecheck, and dry-run cycle remain mandatory and runnable.
- Runtime inventories can be introduced as generated metadata without changing business source, database schema, deployment behavior, or production configuration.
- Runtime generator/rebuild/validate dry-run modes are no-write.
- Runtime apply modes are constrained to future approved writes under `ops/agent-orchestrator/runtime/**`.
- Smart E2E selection narrows only e2e/smoke choices, never baseline checks.
- Selector output is explainable from changed files, runtime inventories, and selector rules.

This plan is documentation-only. It does not implement runtime scripts, execute Agents, merge, push, deploy, run migrations, run seeds, run cleanup, modify business code, add business-code tests, or write production data.

## 2. Compatibility Contracts

| Contract | Required behavior |
|---|---|
| Baseline checks mandatory | Doctor, audit dry-run, and typecheck are always present in selector output and release validation. |
| Targeted e2e only | Selector may choose fewer e2e/smoke suites only when inventories and rules explain the decision. |
| Runtime metadata boundary | Inventories live under `ops/agent-orchestrator/runtime/**` and do not become business truth. |
| Dry-run no-write | Runtime generator, rebuild, validate, and selector dry-run/explain modes write nothing. |
| Apply boundary | Future runtime apply mode may write only approved runtime metadata paths, never app, package, database, infra, CI, Docker, deploy, auth, env, migration, seed, or production files. |
| Fail closed | Malformed inventories, duplicate keys, unknown risk levels, and malformed selector rules block selector trust. |
| Conservative unknowns | Unknown HIGH/CRITICAL risk paths select broad validation or require human approval. |
| Docs-only explanation | Docs-only e2e skip decisions must keep baseline checks and list skipped suites with reasons. |
| Current orchestrator compatibility | `check-dispatch-status`, `orchestratorctl doctor`, and `orchestratorctl agent-cycle --dry-run` continue to run before future runtime implementation. |
| No Agent execution | Planning and compatibility dry-runs do not launch Codex Agents or mutate Agent worktrees. |

## 3. Phase Plan

### Phase R0: Current Baseline

Purpose: prove existing orchestrator behavior still works before runtime memory or selector scripts are implemented.

Required checks:

```bash
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
```

Expected:

- Commands exit 0.
- Doctor remains a required baseline diagnostic.
- Agent-cycle dry-run performs no Agent execution, merge, push, deploy, or production operation.
- Typecheck remains required regardless of selected e2e scope.

### Phase R1: Runtime Inventory Introduction

Purpose: prove runtime inventory files can be added without changing existing orchestrator or business behavior.

Fixture checks:

- No runtime directory.
- Empty/minimal valid runtime directory.
- Valid single-module runtime slice.
- Malformed inventory JSON.
- Duplicate route and duplicate permission inventories.
- Unknown risk level inventory.

Expected:

- Absence of runtime files has a clear bootstrap path through generator dry-run.
- Valid inventories pass validation.
- Invalid inventories fail before selector output is trusted.
- Dry-run modes do not write inventory files or reports.

### Phase R2: Runtime Generator/Rebuild/Validate

Purpose: prove runtime scripts are deterministic and bounded.

Future dry-run checks:

```bash
node ops/agent-orchestrator/scripts/runtime-generator.mjs --dry-run
node ops/agent-orchestrator/scripts/runtime-rebuild.mjs --dry-run
node ops/agent-orchestrator/scripts/runtime-validate.mjs --dry-run
```

Future apply checks must run only against fixture copies:

```bash
node ops/agent-orchestrator/scripts/runtime-generator.mjs --apply
node ops/agent-orchestrator/scripts/runtime-rebuild.mjs --apply
node ops/agent-orchestrator/scripts/runtime-validate.mjs --apply
```

Expected:

- Dry-run prints planned inventory files, gaps, validation results, or diffs without writes.
- Apply writes only approved runtime metadata in isolated fixtures.
- Repeated apply with unchanged inputs produces deterministic JSON and no unrelated diffs.
- Runtime validation catches malformed inventories, duplicate routes, duplicate permissions, unknown owners, unknown risk levels, and missing selector coverage for HIGH/CRITICAL risk areas.

### Phase R3: Smart E2E Selector Explainability

Purpose: prove selector output is explainable and safe.

Future checks:

```bash
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files docs/release/example.md --explain
```

Expected output includes:

- Baseline checks.
- Selected validations.
- Skipped validations.
- Matched rule ids.
- Matched inventory source.
- Risk summary.
- Human approval flag when applicable.
- Reasons for every selected and skipped e2e/smoke suite.

### Phase R4: Targeted Validation Compatibility

Purpose: prove targeted e2e selection does not weaken mandatory validation.

Required cases:

| Change class | Required baseline | Targeted selector behavior |
|---|---|---|
| Docs-only LOW risk | Doctor, audit dry-run, typecheck. | Skip e2e with explicit reason. |
| RBAC/menu/guard | Doctor, audit dry-run, typecheck. | Select RBAC/menu and permission visibility checks. |
| Finance/payment/invoice | Doctor, audit dry-run, typecheck. | Select finance, leasing, payment, idempotency, and audit checks. |
| Workflow state/approver | Doctor, audit dry-run, typecheck. | Select workflow transition/approval checks. |
| DB/schema risk | Doctor, audit dry-run, typecheck. | Select DB/snapshot checks or require human approval. |
| Unknown HIGH/CRITICAL | Doctor, audit dry-run, typecheck. | Select conservative broad validation or require human approval. |

Expected:

- Baseline checks never disappear.
- E2E selection is smaller only when the rule and inventory evidence are complete.
- Negative or unknown cases fail closed.

### Phase R5: Agent-Cycle Integration Gate

Purpose: define the future gate before selector output is wired into `agent-cycle`.

Prerequisites:

- Runtime inventory validation passes in dry-run.
- Selector explain output is stable and complete.
- Baseline mandatory checks are covered by automated tests.
- Docs-only skip and unknown high-risk fallback negative tests pass.
- Agent-cycle dry-run remains no-agent/no-push/no-deploy.

Expected:

- Selector integration can print targeted validation plans.
- Failing runtime validation disables selector narrowing and falls back to broader validation.
- Human approval remains required for business-code, DB, infra, CI, Docker, deploy, auth, env, migration, seed, production operation, merge, or push scope expansion.

## 4. Negative Test Requirements

| Class | Required assertion |
|---|---|
| Malformed inventories | Invalid JSON or missing root fields fail before selector trust and write nothing. |
| Duplicate routes | Duplicate API `method + route` keys fail validation. |
| Duplicate permissions | Duplicate RBAC permission keys fail validation. |
| Unknown risk levels | Risk levels outside `LOW|MEDIUM|HIGH|CRITICAL` fail validation. |
| Unknown high-risk paths | Selector cannot skip e2e; it must choose broad validation or require human approval. |
| Docs-only skip decisions | Docs-only skip applies only to LOW-risk docs changes and must keep baseline checks. |
| Unknown validation ids | Selector rules referencing missing matrix entries fail loudly. |
| Dry-run mutation | Pre/post checksums prove no file, timestamp, queue, report, runtime, or run-plan changes. |
| Apply out of bounds | Any write outside approved runtime metadata paths fails before write. |

## 5. Release Gate Checklist

Before runtime memory is considered compatible:

- Runtime inventories validate with supported schemas and required fields.
- Duplicate routes and permissions are rejected.
- Unknown owners and risk levels are rejected.
- Dry-run generator/rebuild/validate checks are no-write.
- Apply behavior is proven only in isolated fixtures.
- Current status, doctor, audit, typecheck, and agent-cycle dry-run still pass.

Before smart selector narrowing is enabled:

- Baseline doctor, audit dry-run, and typecheck are mandatory in every selector output.
- Selector explain output covers selected and skipped validations.
- Docs-only LOW-risk changes skip e2e with explicit reasons.
- RBAC, finance, workflow, DB, and unknown high-risk changes map to targeted or conservative validation.
- Malformed runtime data disables selector narrowing.

## 6. Rollback And Recovery

Rollback remains simple because runtime memory is metadata:

- Ignore or remove generated runtime inventories in a fixture or reviewed rollback branch.
- Run current baseline commands without selector narrowing.
- If selector output is uncertain, use broad validation.
- If inventory validation fails, disable selector-driven e2e narrowing until repaired.
- Keep doctor, audit dry-run, and typecheck mandatory throughout rollback.
- Do not merge, push, deploy, run production operations, or modify business paths as part of rollback without explicit human approval.

## 7. Current Task Validation

For `AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION`, run:

```bash
git status --short
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

These commands validate that this planning-only change leaves current orchestrator scripts and repository checks compatible. They do not prove future runtime script behavior until those scripts and fixture tests are implemented.
