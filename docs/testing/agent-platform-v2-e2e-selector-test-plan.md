# Agent Platform V2 E2E Selector Test Plan

Task: `AGENT-PLATFORM-V2-A4-E2E-SELECTOR`
Batch: `AGENT-PLATFORM-V2-ROUND2-20260622`
Owner: `agent-4`
Date: 2026-06-22

## 1. Scope

This test plan defines future validation coverage for the Smart E2E Selector. It is a planning artifact only and does not implement selector code, runtime JSON, fixtures, business code, database changes, infrastructure changes, auth changes, CI changes, Docker changes, deploy changes, migrations, seeds, or production behavior.

The selector must always retain these baseline checks:

```bash
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/audit-all-results.mjs --dry-run
pnpm typecheck
```

## 2. Test Invariants

- Tests must use fixture copies or inline fixture inputs, not mutate live orchestrator queue files.
- `--dry-run` and `--explain` must write nothing.
- Baseline checks must appear in every selector result.
- E2E suites may be skipped only with explicit reasons.
- Unknown high-risk changes must select conservative validation or require human approval.
- Malformed rules, malformed matrices, malformed inventories, duplicate IDs, and unknown validation IDs must fail before narrow output is trusted.
- No selector test performs Agent execution, merge, push, deploy, production migration, production seed, Docker cleanup, database reset, truncate, prune, or production data writes.

## 3. Fixture Inventory Set

| Fixture | Purpose | Required contents |
|---|---|---|
| `selector-rules-happy` | Valid rules for RBAC, finance, workflow, IoT/safety, docs-only, and unknown fallback. | `selector-rules.json` with stable IDs and reason text. |
| `validation-matrix-happy` | Valid baseline and selectable commands. | `validation-matrix.json` with doctor, audit dry-run, typecheck, and targeted E2E IDs. |
| `module-risk-inventory-happy` | Known module and risk classifications. | `module_inventory.json` and `risk_inventory.json` covering RBAC, finance, workflow, IoT, safety, docs. |
| `docs-only-low-risk` | Prove E2E skip behavior. | Changed files under `docs/release/**` and `docs/testing/**` with LOW risk. |
| `unknown-high-risk` | Prove conservative fallback. | Changed file not covered by module/risk inventory and outside docs-only paths. |
| `malformed-rules` | Prove strict rule parsing. | Invalid JSON, missing `version`, duplicate `rule_id`, invalid risk level, unknown validation ID. |
| `malformed-matrix` | Prove strict validation matrix parsing. | Missing baseline entry, duplicate `validation_id`, invalid command field, missing skip reason. |
| `missing-inventory` | Prove fail-closed behavior. | Required inventories absent or missing required fields. |

## 4. Selection Matrix

| Case | Changed files | Inventory hits | Expected selected validations | Expected explanation |
|---|---|---|---|---|
| SEL-01 RBAC guard | `apps/api/src/modules/auth/guards/roles.guard.ts` | risk `rbac`, module `auth` | Baseline, `rbac-menu-smoke`, `rbac-standard-smoke` | Matched `rbac-change`; guard changes can affect protected operations. |
| SEL-02 RBAC shared permissions | `packages/shared/src/permissions.ts` | risk `rbac`, module `shared` | Baseline, `rbac-menu-smoke`, `rbac-standard-smoke` | Shared permission contract change requires menu and permission visibility validation. |
| SEL-03 Finance receivable | `apps/api/src/modules/leasing/receivables.service.ts` | risk `finance`, module `leasing` | Baseline, `finance-leasing-regression`, `finance-idempotency-regression` | Receivable changes affect auditability and retry safety. |
| SEL-04 Finance payment | `apps/api/src/modules/leasing/payments.service.ts` | risk `payment`, module `leasing` | Baseline, `finance-leasing-regression`, `finance-payment-smoke`, `finance-idempotency-regression` | Payment application and duplicate-prevention checks are required. |
| SEL-05 Workflow state | `apps/api/src/modules/work-orders/workflow.service.ts` | risk `workflow`, module `workorders` | Baseline, `workflow-workorders-regression` | Workflow state or approver logic requires transition smoke coverage. |
| SEL-06 IoT runtime alert | `apps/api/src/modules/iot/runtime-alert.service.ts` | risk `iot`, module `iot` | Baseline, `iot-runtime-alert-smoke` | Runtime alert changes require IoT alert smoke coverage. |
| SEL-07 Safety hazard | `apps/api/src/modules/safety/hazards.service.ts` | risk `safety`, module `safety` | Baseline, `iot-safety-smoke` | Hazard or safety changes require safety smoke coverage. |
| SEL-08 IoT plus safety | `apps/api/src/modules/iot/runtime-alert.service.ts`, `apps/api/src/modules/safety/hazards.service.ts` | risk `iot`, `safety` | Baseline, `iot-runtime-alert-smoke`, `iot-safety-smoke` | Combined reasons, de-duplicated commands. |
| SEL-09 Unknown high-risk | `apps/api/src/modules/unknown-critical/handler.ts` | no inventory hit | Baseline, `full-first-release-regression` | Unknown path is treated as HIGH risk; human approval required. |
| SEL-10 Low-risk docs-only | `docs/release/example-plan.md`, `docs/testing/example-test-plan.md` | risk `docs`, LOW | Baseline only | E2E skipped because every changed file is known low-risk docs-only. |
| SEL-11 Mixed docs and finance | `docs/release/example-plan.md`, `apps/api/src/modules/leasing/payments.service.ts` | risk `docs`, `payment` | Baseline, finance validations | Docs-only skip is not applied because not all files are docs. |
| SEL-12 Duplicate command | Two RBAC files matching different RBAC rules | risk `rbac` | Baseline, one copy of each RBAC validation | Output combines matched files and reasons under one validation ID. |

## 5. Output Contract Cases

| Case | Input | Assertion |
|---|---|---|
| OUT-01 Baseline always present | Any changed file list | Doctor, audit dry-run, and typecheck appear exactly once. |
| OUT-02 Reasons required | Any selected validation | Each selected validation includes non-empty `matched_rules`, `matched_files`, and `reasons`. |
| OUT-03 Skips required | Any matrix validation not selected | `skipped_validations` includes the validation ID and reason. |
| OUT-04 Risk summary | Multiple risk tags | `highest_risk`, `risk_tags`, and `unknown_files` are stable and sorted. |
| OUT-05 Human approval flag | Unknown high-risk input | `human_approval_required` is `true`. |
| OUT-06 JSON stability | Same fixtures run twice | Output JSON is byte-stable except allowed timestamps, which should be absent by default. |

## 6. CLI Regression Cases

| Case | Command | Expected result |
|---|---|---|
| CLI-01 Dry-run default | `node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run` | Exits 0 with baseline checks and selected validations from default changed-file provider; writes nothing. |
| CLI-02 Explain mode | `node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain` | Exits 0 and prints selected rules, skipped rules, fallback state, and no-write statement. |
| CLI-03 Explicit changed files | `node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files docs/release/example.md --explain` | Exits 0; baseline only; explains docs-only E2E skip. |
| CLI-04 Comma parsing | `--changed-files a,b,c` | Trims whitespace, de-duplicates paths, sorts output. |
| CLI-05 Invalid path | `--changed-files ../secret.txt` | Exits non-zero before inventory reads; writes nothing. |
| CLI-06 Missing required inventory | Valid changed files but no `risk_inventory.json` | Exits non-zero or emits conservative fallback, never narrow docs-only output. |
| CLI-07 Unknown validation ID | Rule selects an ID absent from matrix | Exits non-zero before selection is trusted. |
| CLI-08 Duplicate IDs | Duplicate `rule_id` or `validation_id` | Exits non-zero with duplicate ID in error output. |

## 7. Negative Matrix

| Case | Risk covered | Setup | Expected result |
|---|---|---|---|
| NEG-01 Malformed rules JSON | Bad selector config | `selector-rules.json` cannot parse. | Non-zero exit, no narrow output, no writes. |
| NEG-02 Missing baseline doctor | Baseline weakening | Matrix omits doctor. | Non-zero exit; baseline cannot be disabled. |
| NEG-03 Missing baseline audit | Baseline weakening | Matrix omits `audit-all-results.mjs --dry-run`. | Non-zero exit; baseline cannot be disabled. |
| NEG-04 Missing baseline typecheck | Baseline weakening | Matrix omits `pnpm typecheck`. | Non-zero exit; baseline cannot be disabled. |
| NEG-05 Invalid risk level | Risk typo | Rule or inventory uses unknown risk level. | Non-zero exit with field path. |
| NEG-06 Unknown high-risk skipped | Unsafe narrowing | Unknown app path produces no E2E validation. | Test fails; selector must choose broad validation or require human approval. |
| NEG-07 Docs-only mixed with app path | Unsafe skip | Docs path plus app path. | E2E skip is rejected; app path rules apply. |
| NEG-08 Absolute path input | Path traversal | `/tmp/file.ts` or repo-escaping path. | Non-zero exit before selection. |
| NEG-09 Secret-like path emitted | Secret hygiene | Changed file resembles `.env.production`. | Output may show path but must not read file contents; human approval required. |
| NEG-10 Command execution attempted | Dry-run breach | Instrument command runner. | Selector must not execute selected validation commands. |

## 8. Future Implementation Validation Commands

When the selector is implemented, run:

```bash
node --check ops/agent-orchestrator/scripts/e2e-selector.mjs
node ops/agent-orchestrator/scripts/e2e-selector.mjs --dry-run --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files docs/release/example.md --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files apps/api/src/modules/leasing/payments.service.ts --explain
node ops/agent-orchestrator/scripts/e2e-selector.mjs --changed-files apps/api/src/modules/unknown-critical/handler.ts --explain
```

Task-level baseline validation remains:

```bash
git status --short
node ops/agent-orchestrator/scripts/check-dispatch-status.mjs
node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor
node ops/agent-orchestrator/scripts/orchestratorctl.mjs agent-cycle --dry-run
pnpm typecheck
git diff --check
git status --short
```

## 9. Acceptance Mapping

| Acceptance item | Test coverage |
|---|---|
| Designs selector rules, validation matrix, and selector behavior without implementation. | Sections 3 through 8 define fixture, matrix, CLI, and output behavior only. |
| Defines changed-files plus risk/module inventory inputs and selected validations plus reasons outputs. | Selection matrix, output cases, and CLI cases cover inputs and explanation output. |
| Covers RBAC, finance, workflow, IoT/safety, unknown high-risk, and low-risk docs-only examples. | `SEL-01` through `SEL-11`. |
| Requires doctor, audit dry-run, and typecheck as baseline checks. | Section 1, `OUT-01`, and `NEG-02` through `NEG-04`. |
| Does not modify forbidden business or production paths. | This plan is documentation-only and validation commands are no-agent/no-push/no-deploy. |

## 10. Remaining Test Risks

- Fixture paths in this plan must be adjusted if future runtime inventories choose different module or risk tag names.
- Selector narrowing should remain advisory until inventory validation proves complete coverage for HIGH and CRITICAL paths.
- Future tests must verify no-write behavior with pre/post checksums around rules, matrices, inventories, queue files, reports, and run logs.
