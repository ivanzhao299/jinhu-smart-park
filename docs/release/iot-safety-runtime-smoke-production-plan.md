# IoT Safety Runtime Smoke Production Plan

Task: `PROD-20260621-002-A3-IOT-SAFETY-SMOKE`  
Batch: `PROD-EVIDENCE-20260621-002`  
Owner: `agent-3`  
Date: 2026-06-21

## Purpose

This document defines a production-safe inspection plan for safety, IoT, unified action execution, alert visibility, automatic hazard visibility, duplicate prevention, and energy reversal evidence.

It is a planning artifact only. It does not approve production writes, deployment, migration, seed, cleanup, Docker prune, auth changes, or direct database modification.

## Execution Classes

| Class | Meaning | Production rule |
|---|---|---|
| Local / pre-production full execution | Full smoke scripts may create, update, close, cancel, soft-delete, or post test data against local, CI, staging, UAT, or other approved non-production targets. | Allowed when the target is clearly non-production and uses smoke-only credentials and data. |
| Production read-only sampling | Operators may use approved production accounts to sample login context, menu visibility, list/detail reads, statistics, dashboards, logs, and existing evidence records. | Requires production target confirmation and approved read-only credentials, but must not create, update, delete, post, close, cancel, acknowledge, resolve, or soft-delete records. |
| Production write-path requiring approval | Any command or manual step that mutates production runtime or financial state. | Requires explicit human approval, run marker, target, owner, cleanup/reconciliation plan, backup/rollback posture, and evidence template before execution. |

## Static Validation Commands

These commands do not target runtime business data and are safe to run from the repository root.

| Command | Class | Evidence required |
|---|---|---|
| `git status --short` | Local repository read-only | Worktree state before and after edits. |
| `pnpm typecheck` | Local engineering gate | Pass/fail output and package scope. |
| `node --check scripts/e2e/s5a-safety-smoke.mjs` | Local syntax check | Syntax pass/fail only. |
| `node --check scripts/e2e/s5b-emergency-permit-smoke.mjs` | Local syntax check | Syntax pass/fail only. |
| `node --check scripts/e2e/safety-module-access-smoke.mjs` | Local syntax check | Syntax pass/fail only. |
| `node --check scripts/e2e/s9d1-unified-action-executor-smoke.mjs` | Local syntax check | Syntax pass/fail only. |
| `git diff --check` | Local repository whitespace check | Pass/fail output. |

## Runtime Smoke Command Classification

| Command or check | Coverage | Local / pre-production full execution | Production read-only sampling | Production write-path requiring approval |
|---|---|---:|---:|---:|
| `node scripts/e2e/prepare-safety-access-smoke-fixtures.mjs` | Safety access fixture users, roles, enterprise scope, hazard records. | Yes, only with `SAFETY_FIXTURE_ENVIRONMENT=local|test|staging|ci` and `SAFETY_FIXTURE_ALLOW_WRITE=yes`. | No. | Yes. It creates or updates access and safety records. |
| `node scripts/e2e/safety-module-access-smoke.mjs` | Safety access, menu visibility, high-risk permission absence, enterprise scope, S5/S8 read surfaces. | Yes, with `SAFETY_SMOKE_ENVIRONMENT=local|test|staging|ci`; script blocks production-like targets. | Use equivalent approved production GET sampling only; do not bypass the script target guard. | Not applicable unless new production fixtures are created separately. |
| `node scripts/e2e/s5a-safety-smoke.mjs` | S5A safety inspection, field execution, automatic inspection hazard creation, hazard closure, duplicate task and linked-action protection, safety statistics. | Yes. | Sample approved existing safety menus, hazards, overdue hazards, statistics, tenant 360, and unit hazard reads. | Yes. Full script creates users, roles, points, templates, plans, tasks, files, hazards, and temporarily toggles module state. |
| `node scripts/e2e/s5b-emergency-permit-smoke.mjs` | S5B emergency plans, emergency events, work permits, emergency/work-permit statistics, file upload policy. | Yes. | Sample approved existing emergency/work-permit lists and statistics only if those modules are approved for target visibility. | Yes. Full script creates files and safety emergency/work-permit records and can toggle module state. |
| `node scripts/e2e/s9a-iot-device-hub-smoke.mjs` | S9A IoT device hub, gateways, protocols, tenant isolation, duplicate device behavior. | Yes. | Sample approved existing device, gateway, and protocol lists. | Yes. Full script creates or updates IoT device hub data. |
| `node scripts/e2e/s9b-iot-runtime-alert-smoke.mjs` | S9B runtime metrics, IoT alerts, alert lifecycle, offline recovery, alert visibility. | Yes. | Sample existing alert list/detail/dashboard records and recent runtime event visibility. | Yes. Full script creates devices, metrics, alerts, and changes alert states. |
| `node scripts/e2e/s9c-iot-rule-engine-smoke.mjs` | S9C rule execution, alert action, invalid action rejection, webhook allowlist, audit. | Yes. | Sample existing enabled rules, recent execution logs, and audit presence. | Yes. Full script creates rules and executes actions. |
| `node scripts/e2e/s9d-iot-scene-center-smoke.mjs` | S9D scene templates, scene instances, manual/automatic triggers, disabled-scene rejection, audit. | Yes. | Sample existing scene templates, instances, and recent execution logs. | Yes. Full script creates and triggers scenes. |
| `node scripts/e2e/s9d1-unified-action-executor-smoke.mjs` | Unified action executor, linked rule/scene execution, automatic hazard visibility, duplicate hazard prevention, illegal action rejection, cross-tenant action rejection. | Yes. | Sample existing rule/scene execution logs and approved existing alert-sourced hazard visibility across safety endpoints. | Yes. Full script creates devices, rules, scenes, an alert-sourced safety hazard, and soft-deletes smoke-created hazards. |
| `node scripts/e2e/s9e-energy-meter-monitor-smoke.mjs` | S9E meters, readings, abnormal reverse reading, energy alerts, alert lifecycle, dashboard. | Yes. | Sample existing meters, recent readings, abnormal alerts, and dashboard statistics. | Yes. Full script creates meters/readings and acknowledges, resolves, or closes alerts. |
| `node scripts/e2e/s9f-energy-billing-tenant-smoke.mjs` | S9F billing cycle calculation, allocation, disputes, posting to receivables, repeated-post idempotency. | Yes, preferably staging only. | Sample approved existing billing cycles/items and read-only receivable linkage. | Yes. Full script creates billing cycles/items and posts receivables; finance approval is required. |
| `node scripts/e2e/s9f1-energy-billing-adjustment-reversal-smoke.mjs` | S9F1 adjustment and full reversal, repeat reversal idempotency, duplicate reversal denial, adjustment controls. | Yes, preferably staging only. | Sample approved existing adjustment/reversal records and linked receivables. | Yes. Full script creates, approves, posts, and cancels billing adjustments; finance approval is required. |

## Production Read-Only Sampling Plan

Production read-only sampling must use approved accounts and must not disclose real account names, phone numbers, tokens, tenant names, customer names, addresses, or connection strings in evidence.

| Area | Suggested read-only sample | Pass condition |
|---|---|---|
| Safety access | `/auth/me` for approved admin, normal field role, unauthorized role, overdue-hazard role, statistics role, and enterprise-scoped role. | Required menus and permissions are present, unauthorized/high-risk permissions are absent, and role scope is constrained. |
| S5A safety visibility | `/safety/statistics`, `/safety/hazards`, `/safety/hazards/overdue`, `/safety/my-inspect-tasks`, approved tenant 360 and unit hazard reads. | Data is visible only to authorized roles and statistics/list endpoints return normal responses. |
| S5B emergency/work permit visibility | Emergency and work-permit list/statistics reads only when those modules are approved for target visibility. | Approved menus and read endpoints are visible; deferred modules remain hidden if launch scope excludes them. |
| S9A device hub | Device, gateway, protocol, and dashboard list reads. | Existing records render without cross-tenant leakage. |
| S9B alert visibility | IoT alert list/detail/dashboard reads for recent approved alert records. | Alert appears in the expected list and dashboard surfaces with redacted evidence. |
| S9C/S9D rule and scene logs | Rule list, scene list, and recent execution log reads. | Unified execution fields are present where available and no unexpected failed action surge appears. |
| S9D1 automatic hazard visibility | An approved existing alert-sourced hazard, or an approved production write-path hazard, is sampled through `/safety/hazards`, tenant 360, unit hazards, and `/safety/statistics`. | The same hazard identifier is visible in every required safety surface. |
| Duplicate prevention | Read existing source linkage counts for approved marker/source IDs through application APIs or DBA-approved read-only queries. | One active linked hazard/action/receivable exists per source when the business rule requires uniqueness. |
| S9E energy reverse reading | Read approved abnormal reverse-reading and alert records. | Reverse reading is marked abnormal and linked alert visibility is present. |
| S9F/S9F1 energy reversal | Read approved adjustment/reversal and receivable-linkage records. | Full reversal amount and duplicate-reversal denial evidence are visible from approved existing records. |

## Approved Write-Path Requirements

Before any production write-path smoke, record all fields below:

| Field | Requirement |
|---|---|
| Approval | Human approver, approval ticket, scope, command list, time window, and rollback/cleanup owner. |
| Target | Production environment identifier and API origin redacted to non-secret form. |
| Commit | Release commit hash and clean worktree confirmation before execution. |
| Marker | `PROD_SMOKE_A3_<YYYYMMDDHHmm>_<ticket>` in names, remarks, reasons, `raw_payload.smoke`, and evidence notes wherever the API supports it. |
| Idempotency | `X-Idempotency-Key` prefix `prod-a3-iot-safety-<run_id>-<step>-<uuid>` for every retryable write. |
| Accounts | Role labels only, not usernames or secrets. Credentials must be supplied out of band. |
| Data scope | Approved tenant, park, unit, enterprise, meter, billing item, and hazard identifiers, redacted or hashed in evidence. |
| Before counts | Relevant list/statistics counts before writes, including linked hazard/action/receivable counts for duplicate-prevention checks. |
| Created IDs | Created device, rule, scene, alert, hazard, meter, reading, billing cycle, billing item, adjustment, receivable, file, task, and permit IDs where applicable. |
| Assertions | HTTP status, response request ID, result status, linked record counts, and visibility endpoints checked. |
| Cleanup | Exact cleanup or reconciliation action, responsible owner, timestamp, status, and reason for any retained test record. |
| Logs | Audit/op-log request IDs and redacted log references. |
| Decision | Pass, Conditional-Go, or No-Go with owner and next action. |

## Cleanup And Reconciliation Rules

- Local and pre-production runs may use script cleanup behavior, then verify by marker that no active smoke records remain except intended audit evidence.
- Production write-path cleanup must use supported business APIs or approved administrative procedures. Direct SQL update, hard delete, truncate, reset, destructive seed, or storage pruning is not part of this plan.
- Safety hazards created for smoke must be closed, cancelled, or soft-deleted only through approved business behavior, and audit history must remain intact.
- IoT devices, rules, and scenes created for smoke must be disabled or retired after evidence capture unless the approval states they should remain as controlled test fixtures.
- Alert lifecycle writes must leave a reason containing the marker and must not close or ignore real operational alerts.
- Energy billing, receivable, adjustment, and reversal records may be financially active. They must be retained, reconciled, or reversed according to finance approval; they must not be manually deleted.
- File uploads must use approved file types and marker-bearing remarks, and cleanup must use the file module's supported delete behavior when approved.

## No-Go Rules

Declare No-Go for the IoT/safety release gate when any of these conditions occur:

- Safety access fails for an approved role, including missing required menu/API access, unexpected high-risk permission, unauthorized access success, or unverified enterprise scope in a full matrix run.
- S5A safety smoke or equivalent approved sampling cannot prove safety inspection, hazard visibility, statistics, tenant/unit scope, and duplicate task or linked-action protection.
- S5B emergency/work-permit smoke or equivalent approved sampling fails for an approved launch scope, or a deferred emergency/work-permit path appears when it should remain hidden.
- IoT alert visibility fails: created or approved alert records do not appear in expected list, detail, dashboard, lifecycle, or audit surfaces.
- Automatic IoT-created hazard visibility fails in any required surface: `/safety/hazards`, `/park-tenants/:id/360`, `/park-units/:id/hazards`, or `/safety/statistics`.
- Duplicate linked actions are created, including more than one active hazard for the same IoT hazard source or repeated billing post/reversal creating duplicate receivable or adjustment effects.
- Unified action executor returns non-unified result payloads, accepts illegal action types, or allows cross-tenant device actions to succeed.
- Energy reversal fails: reverse readings are not abnormal when expected, reversal amount is not the negative original final amount, repeat reversal post is not idempotent, or duplicate full reversal is not denied.
- Any production write-path command is run without recorded approval, marker, target, cleanup/reconciliation plan, and evidence fields.
- Any smoke command modifies auth, CI, Docker, deploy, migration, seed, or production environment configuration.

## Release Decision Use

This plan supports the broader release evidence batch. A Go decision for this domain requires either:

1. Full local/pre-production S5/S9 smoke pass plus production read-only sampling pass, with no approved production writes needed, or
2. Full local/pre-production S5/S9 smoke pass plus approved production write-path evidence pass, including cleanup/reconciliation evidence.

Conditional-Go is allowed only for non-P0/P1 residual risks with owner, mitigation, and deadline. Any No-Go rule above blocks release until fixed or explicitly removed from launch scope by the release owner.
