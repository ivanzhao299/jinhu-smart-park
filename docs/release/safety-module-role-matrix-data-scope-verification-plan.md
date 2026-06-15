# JinHu Smart Park safety module role matrix and data scope verification plan

## 1. Purpose

This document defines the release-grade verification model for safety module role permissions, menu visibility, data scope, and failure gates before wider safety module opening.

It is a verification design, not a business implementation plan. It does not replace `pnpm safety:smoke:access`, does not modify production permissions, and does not grant any new role access by itself.

## 2. Scope and boundaries

- Design only: role matrix, data scope model, scenarios, pass criteria, stop rules, and release gate guidance.
- No business code, seed, migration, workflow, package, or permission-source changes are included in this phase.
- No permission expansion is implied by this document.
- Local smoke success is development evidence only; staging or test evidence is still required before release sign-off.
- Production must not run fixture preparation or write smoke users/data. Production checks should be read-only preflight only.
- High-risk actions remain behind dedicated permissions and audit records.

## 3. Current verified baseline

The current baseline comes from the completed safety full-open phases:

- Phase 1 aligned menu and permission semantics for the operations terminal, overdue hazards, and emergency/work-permit dashboard.
- Phase 1 review follow-up aligned page guards, `/safety/hazards/overdue` routing, and statistics API metadata.
- Overdue hazards now stay on `/safety/hazards/overdue` instead of redirecting into the normal hazard route.
- Overdue-only users can open the read-only overdue page without status-log or dictionary permission failures.
- Phase 2 added and hardened `scripts/e2e/safety-module-access-smoke.mjs`.
- Fixture planning and `scripts/e2e/prepare-safety-access-smoke-fixtures.mjs` now prepare the seven-account local/test matrix.
- Fixture tenant-wide upserts were fixed for roles, permissions, and data-scope bindings.
- The tenant-wide enterprise scope rule is now stable and is not retargeted across parks.
- Local phase 2b fixture run and rerun passed `pnpm safety:smoke:access` with exit code `0`.

## 4. Role model

Release verification should use business-facing roles and map them to the existing seven smoke account types.

| Role | Purpose | Typical scope | Smoke mapping |
| --- | --- | --- | --- |
| `SUPER_ADMIN` | Full safety and video security read/write visibility for release validation | All authorized tenant/park scope | `ADMIN` |
| Park operations admin | Daily park operations and cross-team coordination | Park | Covered by admin and later role-specific tests |
| Safety inspector | Execute assigned inspections and use the field operations terminal | Self or handler | `NORMAL` |
| Hazard handler | Read and handle assigned hazards without broad manage-all access | Handler/self or park as configured | Covered by future role-specific tests |
| Emergency/work permit operator | Operate emergency and work-permit flows with explicit lifecycle permissions | Park or handler | `DUAL_STATISTICS` covers read dashboard only |
| Video security operator | Read video dashboard, cameras, alerts, and evidence; high-risk actions require separate grants | Park | Admin read coverage plus future operator-specific tests |
| Enterprise user | Enterprise-side limited safety visibility | Enterprise/company | `ENTERPRISE` |
| Read-only auditor | Read-only safety/video oversight without workflow actions | Tenant/park read-only | Future role-specific test |
| Unauthorized user | Login-capable user with no safety/video access | None for safety/video | `UNAUTHORIZED` |

The seven-account smoke matrix is not a replacement for the business role model. It is the minimum automated release guard for the riskiest permission boundaries.

## 5. Module access matrix

Legend: `Y` = visible and accessible, `N` = hidden or rejected, `S` = scoped/conditional, `D` = dedicated smoke coverage.

| Entry | Required permission model | SUPER_ADMIN | Park ops admin | Safety inspector | Hazard handler | Emergency/work permit operator | Video security operator | Enterprise user | Read-only auditor | Unauthorized |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/safety/dashboard` | `safety_statistics:read` | Y | Y | S | S | S | N | S | Y | N |
| `/operations/terminal` | `safety_inspect_task:my` | Y | S | Y/D | N | N | N | N | N | N/D |
| `/safety/inspect-points` | `safety_inspect_point:read` | Y | Y | S | N | N | N | N | Y | N |
| `/safety/inspect-templates` | `safety_inspect_template:read` | Y | Y | S | N | N | N | N | Y | N |
| `/safety/inspect-plans` | `safety_inspect_plan:read` | Y | Y | S | N | N | N | N | Y | N |
| `/safety/inspect-tasks` | `safety_inspect_task:read` | Y | Y | S | N | N | N | N | Y | N |
| `/safety/my-inspect-tasks` | `safety_inspect_task:my` | Y | S | Y/D | N | N | N | N | N | N |
| `/safety/hazards` | `safety_hazard:read` | Y | Y | S | S | S | N | S/D | Y | N/D |
| `/safety/hazards/overdue` | `safety_hazard:overdue` | Y | S | N | S | N | N | N | S | N/D |
| `/safety/emergency-contacts` | `safety_emergency_contact:read` | Y | Y | N | N | S | N | N | Y | N |
| `/safety/emergency-plans` | `safety_emergency_plan:read` | Y | Y | N | N | S | N | N | Y | N |
| `/safety/emergencies` | `safety_emergency:read` | Y | Y | N | N | S | N | N | Y | N |
| `/safety/work-permits` | `safety_work_permit:read` | Y | Y | N | N | S | N | N | Y | N |
| `/safety/emergency-dashboard` | Both statistics read permissions | Y | S | N | N | Y/D | N | N | S | N/D |
| `/admin/video-security/dashboard` | `video_security_dashboard:read` | Y | S | N | N | N | Y | N | Y | N |
| `/admin/video-security/cameras` | `video_camera:read` | Y | S | N | N | N | Y | N | Y | N |
| `/admin/video-security/alerts` | `video_alert:read` | Y | S | N | N | N | Y | N | Y | N |
| `/admin/video-security/platform-configs` | `video_platform_config:read` | Y | S | N | N | N | S | N | S | N |

Any `S` entry must be backed by explicit permission grants and data scope rules in the target environment. It is not implicitly opened by this plan.

## 6. Action permission matrix

Legend: `Allow` = may be granted for that role class, `Deny` = must not be present by default, `Special` = requires a dedicated workflow/audit acceptance.

| Action family | SUPER_ADMIN | Park ops admin | Safety inspector | Hazard handler | Emergency/work permit operator | Video security operator | Enterprise user | Read-only auditor | Unauthorized |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `read` | Allow | Allow | Scoped | Scoped | Scoped | Scoped | Scoped | Allow | Deny |
| `create` | Allow | Special | Deny by default | Special | Special | Special | Deny by default | Deny | Deny |
| `update` | Allow | Special | Deny by default | Special | Special | Special | Deny | Deny | Deny |
| `delete` | Allow | Special | Deny | Deny | Deny | Deny | Deny | Deny | Deny |
| `my` | Allow | Scoped | Allow | Deny by default | Deny by default | Deny | Deny | Deny | Deny |
| `overdue` | Allow | Special | Deny by default | Special | Deny by default | Deny | Deny | Special read-only | Deny |
| `manage_all` | Allow | Special | Deny | Deny | Deny | Deny | Deny | Deny | Deny |
| `statistics:read` | Allow | Special | Deny by default | Deny by default | Allow when both permissions are present | Deny | Deny | Special | Deny |
| `approve` / `reject` | Allow | Special | Deny | Deny by default | Special | Deny | Deny | Deny | Deny |
| `void` / `close` / `force_close` | Allow | Special | Deny | Special only | Special only | Special for video alert close | Deny | Deny | Deny |
| `stop` / `review` / `archive` | Allow | Special | Deny | Deny by default | Special | Deny | Deny | Deny | Deny |
| `create_inspection` / `create_hazard` | Allow | Special | Deny by default | Special | Special | Special only | Deny | Deny | Deny |

Special grants must be validated with API-level permission checks, data scope checks, audit logs, and a separate high-risk action acceptance record.

## 7. Data scope model

Safety and video verification must treat permission and data scope as separate controls.

| Scope | Meaning | Required verification |
| --- | --- | --- |
| Tenant scope | Data remains inside the authenticated tenant. | Returned records must match expected `tenantId` / `tenant_id`. |
| Park scope | Data remains inside the current park. | Returned records must match expected `parkId` / `park_id`. |
| Enterprise/company scope | Enterprise users only see their own company/park tenant data. | Every returned record must expose and match `enterpriseId`, `enterprise_id`, `companyId`, `company_id`, or equivalent. |
| Self scope | A user sees only records assigned to or created by that user. | Inspect and handler scenarios must verify `handlerId`, `ownerId`, `createdBy`, or equivalent fields. |
| Handler scope | A handler sees only hazards/tasks/events assigned to that handler. | Positive and out-of-scope handler fixtures are required before release-grade proof. |
| Manage-all scope | A privileged override for cross-user/cross-handler views. | Must be absent from normal, enterprise, overdue-only, single-statistics, and unauthorized accounts. |

Required data-scope assertions:

- Enterprise users can read only their own enterprise safety records.
- Same-park out-of-scope enterprise records must be invisible.
- Inspectors can read their own task surfaces without `safety_inspect_task:manage_all`.
- Handler users must not inherit broad hazard/task visibility through read permission alone.
- Unauthorized users must receive menu hiding and direct API rejection.
- `SUPER_ADMIN` can be used for full visibility checks, but this must not be treated as ordinary user scope.

## 8. High-risk permission denylist

The high-risk denylist for ordinary, enterprise, unauthorized, overdue-only, dual-statistics, and single-statistics accounts includes at least these action families:

- `delete`
- `close`
- `force_close`
- `void`
- `approve`
- `reject`
- `override`
- `review`
- `stop`
- `archive`
- `manage_all`
- `create_inspection`
- `create_hazard`

Covered objects include:

- `safety_hazard`
- `safety_inspect_task`
- `safety_inspect_point`
- `safety_inspect_template`
- `safety_inspect_item`
- `safety_inspect_plan`
- `safety_emergency`
- `safety_emergency_contact`
- `safety_emergency_plan`
- `safety_work_permit`
- `video_alert`
- `video_camera`
- `video_platform_config`
- `video_evidence`

Default rule: ordinary roles must not receive these permissions. If a release requires any high-risk grant, it needs a separate acceptance checklist covering authorization, data scope, audit logging, and rollback.

## 9. Smoke account matrix mapping

| Smoke account | Risk covered |
| --- | --- |
| `ADMIN` | Full safety/video menu visibility and read API coverage. |
| `NORMAL` | Operations terminal and my-inspection access through `safety_inspect_task:my` without `manage_all`. |
| `UNAUTHORIZED` | Safety/video menu hiding and direct API rejection. |
| `ENTERPRISE` | Tenant, park, and enterprise data-scope proof against real scoped safety records. |
| `OVERDUE_HAZARD` | `safety_hazard:overdue` positive access and normal hazard negative access. |
| `DUAL_STATISTICS` | Emergency/work-permit dashboard allowed only when both statistics permissions exist. |
| `SINGLE_STATISTICS` | Single-statistics negative case for the emergency/work-permit dashboard and API. |

The seven smoke accounts are the minimum release gate. They do not cover all future role variants, high-risk workflows, or full video evidence behavior.

## 10. Verification scenarios

1. Administrator sees all target safety and video entries and all allowed read APIs return `2xx`.
2. Normal inspector can access `/operations/terminal` and `/safety/my-inspect-tasks` with `safety_inspect_task:my`.
3. Normal inspector does not have `safety_inspect_task:manage_all`.
4. Overdue-only user can see `/safety/hazards/overdue` and read `/safety/hazards/overdue`.
5. Overdue-only user cannot see `/safety/hazards` and direct normal hazard API access returns `401` or `403`.
6. Normal hazard read and overdue hazard read remain separate permissions.
7. Dual-statistics user can see `/safety/emergency-dashboard` and read `/safety/emergency-work-permit-statistics`.
8. Single-statistics user cannot see the dashboard and direct statistics API access returns `401` or `403`.
9. Enterprise user can read the scoped hazards endpoint and every returned record matches expected tenant, park, and enterprise values.
10. Same-park out-of-scope enterprise hazard data is not visible to the enterprise user.
11. Unauthorized user sees no safety/video protected entries and direct protected API calls return `401` or `403`.
12. Non-admin smoke users have no high-risk safety or video permissions.
13. Video security dashboard, cameras, alerts, and platform configs remain separated by video read permissions.
14. Optional dictionary or auxiliary APIs do not block dedicated read-only pages such as overdue hazards.

## 11. Pass criteria

Release-grade pass requires:

- Role matrix reviewed and complete for the release candidate.
- Full seven-account smoke matrix configured; no partial matrix mode.
- `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED` is not used.
- Enterprise expected tenant, park, and enterprise IDs are configured.
- Enterprise scoped endpoint returns records and every record has verifiable tenant, park, and enterprise fields.
- All allowed read API checks return `2xx`.
- Unauthorized direct API checks return `401` or `403`.
- High-risk denylist checks pass for all non-admin smoke users.
- Menu visibility and page/API permissions match the matrix.
- Local smoke has passed for development evidence.
- Staging/test smoke has passed for release-grade evidence.

## 12. Failure stop rules

Stop the release verification if any of the following occurs:

- Enterprise user can see out-of-scope tenant, park, or enterprise data.
- Enterprise scoped data cannot expose enterprise identity for every returned record.
- Unauthorized user can see or access safety/video protected entries.
- Single-statistics user can access `/safety/emergency-dashboard` or its statistics API.
- Overdue-only user can access the normal hazard list or normal hazard API.
- Normal user has `manage_all` or any high-risk permission.
- Any allowed read API returns `401`, `403`, `404`, `5xx`, or any unallowlisted non-`2xx`.
- Fixture data cannot prove enterprise scope.
- Smoke is run with incomplete account matrix.
- Production-like targets are detected before smoke login.
- Fixture preparation is attempted against production.

## 13. Release gate recommendation

Use three evidence levels:

| Evidence level | Allowed operations | Release meaning |
| --- | --- | --- |
| Local development evidence | Fixture writes allowed only with `SAFETY_FIXTURE_ENVIRONMENT=local` and `SAFETY_FIXTURE_ALLOW_WRITE=yes`; full smoke may run against local API. | Confirms implementation and scripts are internally consistent. |
| Staging/test release evidence | Fixture writes allowed only in prepared non-production data; full smoke must use seven accounts and expected enterprise IDs. | Required release-grade safety access evidence. |
| Production preflight | No fixture writes, no smoke test accounts, no destructive operations. Read-only checks only. | Confirms production target is not accidentally used for fixture/smoke writes. |

Do not run fixture preparation in production. Do not write smoke users, roles, or test hazards to production. Production release checks should use existing production-safe initialization and read-only operational preflight.

## 14. Remaining gaps

- Staging/test full smoke rerun has not yet been recorded.
- Multi-park concurrent fixture support is intentionally blocked by the tenant-wide enterprise scope rule design.
- Production verification is limited to read-only preflight; no production fixture path exists.
- High-risk action workflows such as delete, close, force close, void, approve, reject, stop, review, archive, create inspection, and create hazard need separate acceptance.
- Read-only auditor and video security operator need dedicated role fixtures if they become release-blocking roles.
- Video evidence embedded flows can be validated in a later focused phase.

## 15. Next step

If release-grade evidence is required, proceed to `safety module full-open phase 2b-staging-run` and repeat the full smoke in a prepared staging/test environment.

If local verification is enough for the current milestone, proceed to `safety module full-open phase 4: release acceptance summary`.
