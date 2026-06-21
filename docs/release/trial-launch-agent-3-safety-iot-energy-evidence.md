# Trial Launch Agent 3 Safety, IoT, And Energy Evidence

## Scope

- Task: `TRIAL-20260621-001-A3-IOT-SAFETY`
- Agent: `agent-3`
- Branch: `agent-3-ops-iot-safety`
- Environment: local API `http://127.0.0.1:3001/api/v1`
- Database: local Docker PostgreSQL from `infra/docker/docker-compose.yml`
- Date: 2026-06-21

This run covered S5 safety, S9 IoT, unified action executor, alert visibility, duplicate-prevention behavior, and energy billing reversal evidence for trial-launch readiness.

## Write-Path Safety And Cleanup

- No production target was configured. `E2E_API_BASE` and `SAFETY_SMOKE_API_BASE_URL` were not set to a remote host; scripts used local defaults or explicit local values.
- `prepare-safety-access-smoke-fixtures.mjs` was run with `SAFETY_FIXTURE_ENVIRONMENT=local` and `SAFETY_FIXTURE_ALLOW_WRITE=yes`; it only created or updated `SAFETY_SMOKE_` prefixed local/test fixture users, roles, enterprise records, data-scope rule, and hazard records.
- S5/S9 smoke scripts used timestamped smoke remarks, idempotency keys, and local fixture data.
- `s9d1-unified-action-executor-smoke.mjs` soft-deleted the IoT-created hazard rows created by that run after assertions.
- Local upload files created under `storage/files/10000001/20000001/20260621/` during this run were removed from the worktree after execution so they are not committed.
- The local database still contains smoke/audit evidence rows created by the scripts, as intended for local regression evidence.

## Command Results

| Command | Result | Notes |
|---|---|---|
| `node ops/agent-orchestrator/scripts/claim-task.mjs agent-3` | Pass | Claimed `TRIAL-20260621-001-A3-IOT-SAFETY`. |
| `git status --short` | Pass | Initial post-claim status showed queue metadata modified by claim. |
| `pnpm install --frozen-lockfile` | Pass | First attempt hit an interactive prompt; rerun with `CI=true` completed without lockfile changes. |
| `pnpm --filter @jinhu/shared build` | Pass | Required before workspace typecheck could resolve `@jinhu/shared`. |
| `pnpm typecheck` | Pass | Passed after dependency install and shared build. |
| `node scripts/e2e/s5a-safety-smoke.mjs` | Pass | Safety inspection, hazards, statistics, tenant 360, and unit hazards passed. |
| `node scripts/e2e/s5b-emergency-permit-smoke.mjs` | Pass | Initially failed because PDF-only `safety_emergency_plan` fixture uploaded PNG; passed after test-fixture-only fix. |
| `node scripts/e2e/safety-module-access-smoke.mjs` | Fail | Full matrix failed because NORMAL user menu did not include `/operations/terminal`. |
| `SAFETY_FIXTURE_ENVIRONMENT=local SAFETY_FIXTURE_ALLOW_WRITE=yes node scripts/e2e/prepare-safety-access-smoke-fixtures.mjs` | Pass | Prepared the seven-account local access matrix. |
| `SAFETY_SMOKE_* node scripts/e2e/safety-module-access-smoke.mjs` | Fail | All checks passed except NORMAL menu visibility for `/operations/terminal`. |
| `node scripts/e2e/s9a-iot-device-hub-smoke.mjs` | Pass | Device hub, gateway, protocol, duplicate prevention, tenant isolation, and audit passed. |
| `node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs` | Pass | Runtime metric events, alerts, state flow, offline recovery, and alert visibility passed. |
| `node scripts/e2e/s9c-iot-rule-engine-smoke.mjs` | Pass | Rule execution, alert action, invalid action rejection, webhook allowlist, and audit passed. |
| `node scripts/e2e/s9d-iot-scene-center-smoke.mjs` | Pass | Scene templates, scene trigger, disabled-scene rejection, tenant isolation, and audit passed. |
| `node scripts/e2e/s9d1-unified-action-executor-smoke.mjs` | Pass | Unified executor, automatic hazard visibility, and duplicate prevention passed. |
| `node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs` | Pass | Meter readings, IoT ingest, abnormal reverse reading, alerts, and dashboard passed. |
| `node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs` | Pass | Billing calculation, allocation, dispute block, posting, and repeated post idempotency passed. |
| `node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs` | Pass | Full reversal, repeat reversal idempotency, duplicate full reversal denial, and adjustment controls passed. |

## Evidence Highlights

- Safety hazard visibility: `s5a-safety-smoke.mjs` verified safety statistics, tenant 360 safety hazards, and unit safety hazards.
- Alert visibility: `s9b-iot-runtime-alert-smoke.mjs` verified dashboard realtime events and full alert lifecycle visibility.
- Unified action executor: `s9d1-unified-action-executor-smoke.mjs` verified rule test, manual scene trigger, metric-triggered scene, illegal action rejection, and cross-tenant action rejection.
- Automatic hazard visibility: `s9d1-unified-action-executor-smoke.mjs` created `CREATE_SAFETY_HAZARD` hazard `HZ-202606-000029` and verified the specific hazard through `/safety/hazards`, `/park-tenants/:id/360`, `/park-units/:id/hazards`, and `/safety/statistics`.
- Duplicate prevention: `s9d1-unified-action-executor-smoke.mjs` verified the second hazard trigger returned `idempotent === true`, returned the same `hazard_id`, and left exactly one active hazard for the tested source before cleanup. `s9f-energy-billing-tenant-smoke.mjs` verified repeated billing-cycle post is idempotent.
- Energy billing reversal: `s9f1-energy-billing-adjustment-reversal-smoke.mjs` verified full reversal amount, repeat reversal post idempotency, duplicate full reversal denial, positive/negative adjustments, draft cancellation, posted-cancel rejection, and tenant isolation.

## Fixture Fix

`scripts/e2e/s5b-emergency-permit-smoke.mjs` now uploads PDF fixtures for `safety_emergency_plan` and `safety_emergency_review`, matching `FILE_UPLOAD_BIZ_POLICY_MAP`. This is a test-fixture-only change and does not alter business behavior.

## Blocking Issue

`safety-module-access-smoke.mjs` remains failed for full access-matrix evidence:

- Failing assertion: `normal user menu missing /operations/terminal`
- Context: the NORMAL fixture has `safety_inspect_task:my`, and `/safety/my-inspect-tasks` is visible and readable, but `/operations/terminal` is absent from the returned menu.
- Impact: safety access-control/menu readiness is partial for trial launch; do not mark the full safety access matrix as passed.
- Proposed follow-up: create an Agent 4 or Agent 3/4 joint task to inspect menu construction and permission-route mapping for `/operations/terminal`, then rerun `SAFETY_SMOKE_* node scripts/e2e/safety-module-access-smoke.mjs`.

## Current Readiness Decision

Partial pass / blocked.

S5 safety core, S5 emergency/work-permit, S9 IoT, automatic hazard visibility, alert visibility, duplicate prevention, and energy reversal evidence passed locally. Full trial-launch readiness remains blocked by the safety module access smoke menu failure for `/operations/terminal`.
