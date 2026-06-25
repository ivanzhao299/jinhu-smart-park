# Jinhu Smart Park Production Master Plan

Date: 2026-06-25

## Goal

Build Jinhu Smart Park into a production-ready smart park management system that can support one real park end to end:

- Organization, tenant, role, permission, data-scope, and audit administration.
- Asset, building, floor, unit, and occupancy management.
- Investment, tenant, contract, finance, payment, invoice, waiver, and refund operations.
- Inspection, hazard, emergency, work permit, and work order field operations.
- IoT device hub, alert center, energy metering, energy billing, video security, and cleaning robot operations.
- Production deployment, rollback, evidence gates, and safety audit trails.

## Current Production Evidence

### Completed Gates

| Gate | Area | Evidence | Result |
| --- | --- | --- | --- |
| Gate-1 | Safety inspection runtime | `gate1-safety-inspection-*` production reports | PASS |
| Gate-2 | Safety hazard closure | `SAFETY_HAZARD_PRODUCTION_GATE2_REPORT.md` | PASS |
| Gate-3 | Work order lifecycle | `WORK_ORDER_PRODUCTION_GATE3_REPORT.md` | PASS |
| Gate-4 | Admin RBAC and organization | `ADMIN_RBAC_PRODUCTION_GATE4_REPORT.md` | PASS |
| Gate-5 | Asset and unit lifecycle | `ASSET_UNIT_PRODUCTION_GATE5_REPORT.md` | PASS |
| Gate-6A | Leasing and finance read surface | `LEASING_FINANCE_SURFACE_PRODUCTION_GATE6A_REPORT.md` | PASS |
| Gate-6B | Leasing to effective contract lifecycle | `LEASING_CONTRACT_LIFECYCLE_PRODUCTION_GATE6B_REPORT.md` | PASS |
| Gate-7 | Finance lifecycle | `FINANCE_LIFECYCLE_PRODUCTION_GATE7_REPORT.md` | PASS |
| Gate-8 | Emergency and work permit lifecycle | `EMERGENCY_WORK_PERMIT_PRODUCTION_GATE8_REPORT.md` | PASS |
| Gate-9 | Tenant service entry lifecycle | `TENANT_SERVICE_ENTRY_PRODUCTION_GATE9_REPORT.md` | PASS |
| Gate-10 | IoT device and alert runtime | `IOT_ALERT_RUNTIME_PRODUCTION_GATE10_REPORT.md` | PASS |
| Gate-11 | Energy meter to billing lifecycle | `ENERGY_BILLING_PRODUCTION_GATE11_REPORT.md` | PASS |
| Gate-12 | Video security evidence lifecycle | `VIDEO_SECURITY_EVIDENCE_PRODUCTION_GATE12_REPORT.md` | PASS |
| Gate-13 | Robot operations governance | `ROBOT_OPERATIONS_GOVERNANCE_PRODUCTION_GATE13_REPORT.md` | PASS |
| Gate-14 | Mobile inspection UX | `MOBILE_INSPECTION_UX_PRODUCTION_GATE14_REPORT.md` | PASS |

### Gate-4 Production Counts

- Role pack enabled roles: 9
- Role pack roles with permissions: 9
- Role permission links: 345
- Role pack roles with data scope: 9
- Organizations: 15
- Enabled users: 21
- Permissions: 708
- Frontend route permissions: 130
- Operation audit logs: 29

## Capability Matrix

| Capability | Current Status | Production Gap |
| --- | --- | --- |
| System administration | PASS | Continue route-level smoke and admin UX polish |
| Role / permission / data scope | PASS | Add persona login smoke for each role pack |
| Organization structure | PASS | Add org tree create/update/delete guarded smoke |
| Asset management | PASS | Continue batch import and occupancy dashboard verification |
| Leasing CRM | PASS | Continue list/detail UX polish and role persona smoke |
| Contracts | PASS | Add contract change, renewal, and checkout gates |
| Finance | PASS | Add batch billing, checkout/refund, and finance KPI gates |
| Work orders | PASS | Add SLA escalation evidence and tenant portal UX smoke |
| Inspection tasks | PASS | Add mobile-friendly field smoke and role smoke |
| Hazard closure | PASS | Add dashboard KPI accuracy verification |
| Emergency / work permits | PASS | Add mobile field role smoke and dashboard KPI accuracy verification |
| IoT device hub | PASS | Add dry-run device command governance and device command masking |
| Energy metering / billing | PASS | Add public allocation, reversal, and finance KPI gates |
| Video security | PASS | Add real vendor adapter smoke only after credential and network governance approval |
| Cleaning robot | PASS | Add real vendor robot smoke only after credential, network, and site-operations approval |
| UI/UX | PARTIAL | Continue high-frequency workflow polish and mobile inspection UX |
| Security | PARTIAL | Add auth lockout, CSRF/origin, file-policy, and audit gate pack |
| Deployment / rollback | PASS | Keep release/rollback runbooks updated per gate |

## Execution Phases

### Phase 1: Local And Production Operation Baseline

Status: IN PROGRESS

Completed:

- Real park role pack and data scope baseline.
- Safety inspection production gate.
- Hazard closure production gate.
- Work order lifecycle production gate.
- Admin RBAC production gate.
- Asset and unit production lifecycle gate.
- Leasing and finance read-surface production gate.
- Leasing lead to effective contract lifecycle gate.
- Finance receivable, payment, invoice, and waiver lifecycle gate.
- Emergency event and work permit production lifecycle gate.
- Tenant service request to work order evaluation production lifecycle gate.
- IoT device, metric, point, heartbeat, metric report, alert, alert-to-work-order, dashboard, and audit production gate.
- Energy meter, confirmed reading, billing cycle, billing item, receivable posting, dashboard, and audit production gate.
- Video camera registry, no-secret stream config, snapshot evidence, alert lifecycle, hazard evidence attachment, dashboard, and audit production gate.
- Local cleaning robot registration, read surfaces, governed command dry-run, command logs, no-external-call evidence, and no-credential evidence production gate.
- High-frequency drawer/form UI/UX Sprint 1.
- Mobile inspection terminal progress, field readiness, sticky mobile footer, production web route, and inspection read-surface gate.

Remaining:

- Persona login smoke for the 9 production roles.
- Backend admin route smoke for system pages.

### Phase 2: Business Closed Loops

Target:

- Leasing lead -> tenant -> contract -> receivable -> payment -> invoice.
- Asset/unit status -> tenant contract -> operation service.
- Emergency/work permit lifecycle.
- Tenant service request -> work order -> evaluation.

Required Gates:

- Gate-6A Leasing and Finance Read Surface. PASS.
- Gate-6B Leasing to Contract Lifecycle. PASS.
- Gate-7 Finance Lifecycle. PASS.
- Gate-8 Emergency and Work Permit Lifecycle. PASS.
- Gate-9 Tenant Service Entry. PASS.

### Phase 3: IoT, Energy, Video, Robot Runtime

Target:

- IoT device registration, status, metric point, alert, and work order linkage.
- Energy meter readings, cycle settlement, tenant bill allocation, adjustment, and reversal.
- Video camera registry, stream configuration masking, alert dashboard, and evidence attachment.
- Cleaning robot read-only operations and governed command dry-run.

Required Gates:

- Gate-10 IoT Device and Alert Runtime. PASS.
- Gate-11 Energy Meter to Billing. PASS.
- Gate-12 Video Security Evidence. PASS.
- Gate-13 Robot Operations Governance. PASS.

### Phase 4: Productized UI/UX And Mobile Field Operation

Target:

- Unified design language for forms, drawers, tables, mobile cards, and status feedback.
- Mobile-first inspection execution.
- Tenant-facing and operator-facing workbench entry points.
- Accessibility and error-state improvements.

Required Gates:

- Gate-14 Mobile Inspection UX. PASS.
- Gate-15 Tenant Portal UX.
- Gate-16 Executive Dashboard Accuracy.

### Phase 5: Security, Compliance, And Production Operations

Target:

- Authentication lockout and refresh handling.
- CSRF/origin/file policy verification.
- Field permission and data masking smoke.
- Deployment, rollback, and backup restore rehearsal.

Required Gates:

- Gate-17 Auth and Session Security.
- Gate-18 Field Masking and File Policy.
- Gate-19 Backup Restore Drill.
- Gate-20 Production Go-Live Review.

## Next Immediate Actions

1. Continue UI/UX Sprint 2 for mobile inspection, tenant service entry, and emergency/work-permit field views.
2. Implement persona login smoke for the 9 production roles.
3. Add security gate pack for auth/session/file policy.
4. Add real vendor video adapter smoke only after credential and network governance approval.
5. Add real vendor robot smoke only after credential, network, and site-operations approval.

## Operating Rules

- All production writes must be controlled, traceable, and report-backed.
- Each production gate must upload markdown and JSON evidence.
- Destructive operations need an explicit rollback note.
- Secrets must not be printed in logs.
- Every change must pass local validation and CI before being considered accepted.
