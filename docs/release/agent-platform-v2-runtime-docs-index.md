# Agent Platform V2 Runtime Docs Index

Task: `AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX`
Batch: `AGENT-PLATFORM-V2-RESOURCE-READINESS-20260622`
Owner: `agent-1`
Date: 2026-06-22

## 1. Purpose

This index maps the Agent Platform V2 runtime documentation set across release docs, testing docs, orchestrator reports, and result artifacts.

It is a documentation index only. It does not introduce runtime behavior, business code, database changes, CI changes, deployment behavior, auth behavior, Docker behavior, migrations, seeds, production configuration, or production data changes.

## 2. Runtime Documentation Map

| Runtime area | Owner | Release documentation | Testing documentation | Report | Result artifact |
|---|---|---|---|---|---|
| Compatibility and V2 validation baseline | `agent-2` | `docs/release/agent-platform-v2-compatibility-test-plan.md` | `docs/testing/agent-platform-v2-validation-matrix.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A2-VALIDATION-COMPAT.json` |
| Event-first read model and results | `agent-3` | `docs/release/agent-platform-v2-read-model-plan.md` | `docs/testing/agent-platform-v2-read-model-test-plan.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A3-READ-MODEL-RESULTS.json` |
| Parallel runner planning | `agent-4` | `docs/release/agent-platform-v2-parallel-runner-plan.md` | `docs/testing/agent-platform-v2-parallel-runner-test-plan.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A4-PARALLEL-RUNNER.json` |
| Event-sourcing queue architecture | `agent-5` | `docs/release/agent-platform-v2-event-sourcing-queue-design.md` | `docs/testing/agent-platform-v2-event-sourcing-test-plan.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A5-EVENT-SOURCING-ARCH.json` |
| Runtime memory architecture | `agent-5` | `docs/release/agent-platform-v2-runtime-memory-architecture.md` | `docs/testing/agent-platform-v2-runtime-memory-validation-matrix.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A5-RUNTIME-ARCH.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A5-RUNTIME-ARCH.json` |
| Runtime inventory generator planning | `agent-3` | `docs/release/agent-platform-v2-inventory-generator-design.md` | `docs/testing/agent-platform-v2-inventory-generator-test-plan.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A3-INVENTORY-GENERATOR.json` |
| Runtime validation and selector compatibility | `agent-2` | `docs/release/agent-platform-v2-round2-compatibility-test-plan.md` | `docs/testing/agent-platform-v2-runtime-memory-validation-matrix.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A2-RUNTIME-VALIDATION.json` |
| Smart E2E selector planning | `agent-4` | `docs/release/agent-platform-v2-smart-e2e-selector-design.md` | `docs/testing/agent-platform-v2-e2e-selector-test-plan.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A4-E2E-SELECTOR.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A4-E2E-SELECTOR.json` |
| Parallel smoke A2 checklist | `agent-2` | None; checklist-only smoke task. | `docs/testing/agent-platform-v2-parallel-smoke-a2.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A2.json` |
| Parallel smoke A3 checklist | `agent-3` | None; checklist-only smoke task. | `docs/testing/agent-platform-v2-parallel-smoke-a3.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-PARALLEL-SMOKE-A3.json` |
| Runtime docs index and discoverability checklist | `agent-1` | `docs/release/agent-platform-v2-runtime-docs-index.md` | `docs/testing/agent-platform-v2-runtime-docs-index-checklist.md` | `ops/agent-orchestrator/reports/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.md` | `ops/agent-orchestrator/results/AGENT-PLATFORM-V2-A1-RUNTIME-DOCS-INDEX.json` |

## 3. Ownership Cross-Links

| Owner | Runtime responsibility reflected in docs | Primary docs to review before follow-up work |
|---|---|---|
| `agent-1` | Documentation index, runtime artifact discoverability, and cross-link readiness. | This index and `docs/testing/agent-platform-v2-runtime-docs-index-checklist.md`. |
| `agent-2` | Compatibility gates, validation matrices, runtime validation, and fail-closed selector requirements. | `docs/testing/agent-platform-v2-validation-matrix.md`, `docs/release/agent-platform-v2-round2-compatibility-test-plan.md`, and `docs/testing/agent-platform-v2-runtime-memory-validation-matrix.md`. |
| `agent-3` | Event read-model/result planning and runtime inventory generator planning. | `docs/release/agent-platform-v2-read-model-plan.md`, `docs/testing/agent-platform-v2-read-model-test-plan.md`, `docs/release/agent-platform-v2-inventory-generator-design.md`, and `docs/testing/agent-platform-v2-inventory-generator-test-plan.md`. |
| `agent-4` | Parallel runner planning and Smart E2E Selector planning. | `docs/release/agent-platform-v2-parallel-runner-plan.md`, `docs/testing/agent-platform-v2-parallel-runner-test-plan.md`, `docs/release/agent-platform-v2-smart-e2e-selector-design.md`, and `docs/testing/agent-platform-v2-e2e-selector-test-plan.md`. |
| `agent-5` | Event-sourcing queue architecture and Project Runtime Memory architecture. | `docs/release/agent-platform-v2-event-sourcing-queue-design.md`, `docs/testing/agent-platform-v2-event-sourcing-test-plan.md`, and `docs/release/agent-platform-v2-runtime-memory-architecture.md`. |

## 4. Runtime Memory Reading Order

Use this order when onboarding to follow-up implementation or review work:

1. `docs/release/agent-platform-v2-runtime-memory-architecture.md` for the generated metadata boundary and the seven planned runtime inventory files.
2. `docs/release/agent-platform-v2-inventory-generator-design.md` for planned generator, rebuild, validate, dry-run, apply, and duplicate-conflict behavior.
3. `docs/testing/agent-platform-v2-runtime-memory-validation-matrix.md` for inventory fixtures, command cases, selector cases, negative cases, and baseline checks.
4. `docs/release/agent-platform-v2-smart-e2e-selector-design.md` for changed-file inputs, selector rules, validation matrix contracts, and explainability requirements.
5. `docs/testing/agent-platform-v2-e2e-selector-test-plan.md` for selector fixtures, CLI cases, output cases, and fail-closed behavior.
6. `docs/release/agent-platform-v2-round2-compatibility-test-plan.md` for the staged release gate sequence and rollback expectations.

## 5. Authority And Guardrails

- Agent Platform V2 runtime inventories are generated orchestrator metadata, not business truth.
- Source code, database migrations, production-safe seed rules, auth/RBAC contracts, release procedures, and production configuration remain authoritative.
- Runtime docs may describe future scripts or directories, but future implementation tasks must still enforce dry-run defaults, path boundaries, no secret reads, deterministic output, and fail-closed validation.
- Smart E2E selection may narrow E2E or smoke suites only when runtime inventories validate and the selector explains selected and skipped checks.
- Baseline checks stay mandatory in selector planning: orchestrator doctor, audit dry-run, and workspace typecheck.
- Unknown high-risk paths, malformed runtime inventories, duplicate routes, duplicate permissions, unsupported risk levels, and missing HIGH/CRITICAL coverage must block narrow validation.

## 6. Artifact Discovery Shortcuts

Use these read-only patterns to find the current V2 runtime artifacts:

```bash
find docs/release -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort
find docs/testing -maxdepth 1 -type f -name 'agent-platform-v2-*.md' | sort
find ops/agent-orchestrator/reports -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.md' | sort
find ops/agent-orchestrator/results -maxdepth 1 -type f -name 'AGENT-PLATFORM-V2*.json' | sort
```

The companion checklist is `docs/testing/agent-platform-v2-runtime-docs-index-checklist.md`.
