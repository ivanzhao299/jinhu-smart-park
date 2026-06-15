# JinHu Smart Park safety module full-open release acceptance summary

## 1. Purpose

This document summarizes the safety module full-open workstream for release acceptance: completed phases, verification evidence, covered permission boundaries, remaining risks, release gate recommendations, and the current acceptance decision.

It is a release acceptance summary. It does not replace staging/test release evidence, does not modify the permission model, and does not grant or revoke any production permissions.

## 2. Scope and boundaries

- This summary records release readiness evidence for the safety module full-open workstream.
- It does not modify business code, seed data, migrations, workflows, package files, permission sources, or production configuration.
- It does not replace a staging/test release-grade access smoke run.
- Fixture preparation is forbidden in production.
- Production must not receive smoke users, smoke roles, smoke hazards, or fixture enterprises.
- Production verification should be read-only and must not run destructive or write-oriented smoke setup.

## 3. Phase completion summary

| Phase | Scope | Result | Evidence |
| --- | --- | --- | --- |
| Phase 1 menu / permission alignment | Aligned operations terminal, overdue hazards, and emergency/work-permit dashboard menu permissions | Completed | `000144_safety_full_open_permission_menu_patch.sql`; phase 1 record |
| Phase 1 review follow-up | Aligned page guards and statistics API metadata | Completed | `000145_safety_phase1_review_followup.sql`; phase 1 record |
| Overdue route follow-up | Kept `/safety/hazards/overdue` on its own route | Completed | Phase 1 record; overdue route no longer redirects into the normal hazard pathname |
| Overdue read-only follow-up | Made overdue-only view tolerant of missing status-log and dictionary permissions | Completed | Phase 1 record |
| Phase 2 access smoke script | Added safety access smoke verification | Completed | `scripts/e2e/safety-module-access-smoke.mjs` |
| Smoke hardening | Added full account matrix, `2xx` allowed-read checks, enterprise scoped endpoint checks, high-risk denylist, and production target guard | Completed | Phase 2 record; smoke script |
| Fixture plan | Designed local/test fixture preparation | Completed | `safety-module-access-smoke-fixture-plan.md` |
| Fixture script | Added local/test fixture preparation command | Completed | `scripts/e2e/prepare-safety-access-smoke-fixtures.mjs`; `pnpm safety:fixtures:access` |
| Tenant-wide upsert follow-up | Aligned fixture upserts with tenant-wide unique keys | Completed | Fixture plan and script |
| Enterprise scope stability | Prevented existing tenant-wide enterprise scope rule retargeting | Completed | Fixture script |
| Enterprise scope preflight | Blocked conflict/drift before fixture writes | Completed | Fixture script |
| Runtime contract alignment | Aligned fixture data-scope status and `scope_config` parsing with `DataScopeService` runtime semantics | Completed | Fixture script; #165 merged into `main` |
| Phase 3 role matrix and data scope plan | Defined role matrix, action matrix, data scope model, and stop rules | Completed | `safety-module-role-matrix-data-scope-verification-plan.md` |
| Local phase 2b fixture-run rerun | Ran fixture, local API, and full access smoke | Completed as local development evidence | Phase 2 record: smoke exit code `0` |

## 4. Verified evidence

- Local migration history recorded `000144_safety_full_open_permission_menu_patch.sql` as `succeeded`.
- Local migration history recorded `000145_safety_phase1_review_followup.sql` as `succeeded`.
- Fixture rerun succeeded after tenant-wide upsert and enterprise scope stability fixes.
- Seven-account smoke matrix completed: `ADMIN`, `NORMAL`, `UNAUTHORIZED`, `ENTERPRISE`, `OVERDUE_HAZARD`, `DUAL_STATISTICS`, and `SINGLE_STATISTICS`.
- Local `pnpm safety:smoke:access` completed with exit code `0`.
- High-risk denylist checks passed for all non-admin smoke accounts.
- Enterprise scoped hazard records matched expected tenant, park, and enterprise identifiers.
- Same-park out-of-scope enterprise hazard data was not visible to the enterprise smoke user.
- `OVERDUE_HAZARD` could access overdue hazards and was denied ordinary hazard access.
- `DUAL_STATISTICS` passed emergency/work-permit dashboard positive verification.
- `SINGLE_STATISTICS` was denied the dual-statistics dashboard and API.
- `UNAUTHORIZED` user direct protected API access was rejected.
- Final local record did not require workflow, script, app, seed, migration, package, or lockfile changes.

## 5. Role and permission coverage

| Smoke account | Coverage |
| --- | --- |
| `ADMIN` | Admin login, `/auth/me`, full safety/video menu visibility, and allowed read APIs. |
| `NORMAL` | `safety_inspect_task:my`, `/operations/terminal`, my inspect tasks, and absence of `manage_all`. |
| `UNAUTHORIZED` | Menu hiding and direct API rejection for protected safety/video entries. |
| `ENTERPRISE` | Enterprise-scoped safety data with tenant, park, and enterprise field verification. |
| `OVERDUE_HAZARD` | `safety_hazard:overdue` positive access and ordinary hazard negative access. |
| `DUAL_STATISTICS` | Emergency/work-permit dashboard positive access with both statistics permissions. |
| `SINGLE_STATISTICS` | Single-statistics negative access for the combined dashboard and API. |

These accounts are the automated minimum gate. Broader business roles such as park operations admin, hazard handler, video security operator, and read-only auditor remain mapped in the phase 3 role matrix for release planning.

## 6. Data scope coverage

| Scope | Current coverage |
| --- | --- |
| Tenant scope | Enterprise smoke records must match the expected tenant id. |
| Park scope | Enterprise smoke records must match the expected park id. |
| Enterprise/company scope | Enterprise smoke records must match the expected enterprise id, and same-park out-of-scope enterprise data must be invisible. |
| Self scope | Covered indirectly through `NORMAL` my-inspection access; deeper self-scope variants remain future role-specific verification. |
| Handler scope | Identified in phase 3 as a required release model; dedicated handler fixture is not part of the current seven-account smoke. |
| `manage_all` scope | Verified absent from non-admin smoke accounts where relevant. |

The current local smoke proves the enterprise scoped endpoint in local data. Staging/test should repeat the same gate with independent non-production fixture data before release-grade acceptance.

## 7. High-risk permission coverage

The smoke denylist covers high-risk action families including:

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

Non-admin smoke accounts did not receive denylisted safety or video permissions in the local phase 2b runs. Any future grant of these permissions to ordinary, enterprise, or operator roles requires separate authorization, data-scope, audit-log, and rollback acceptance.

## 8. Fixture and smoke gate status

- Fixture script has production guard checks for environment, API target, database host, database name, and production-like markers.
- Fixture writes require `SAFETY_FIXTURE_ENVIRONMENT=local|test|ci` and `SAFETY_FIXTURE_ALLOW_WRITE=yes`.
- Fixture script performs enterprise scope preflight before writes.
- Existing tenant-wide `SAFETY_SMOKE_ENTERPRISE_SCOPE` is treated as immutable fixture state and is not retargeted across parks.
- Fixture data-scope validation is aligned with `DataScopeService` runtime behavior: `status === "enabled"` and `tenantCompanyIds ?? ids`.
- Local access smoke has passed with the full seven-account matrix and no partial/debug override.
- Staging/test access smoke has not yet been recorded.

## 9. Release gate recommendation

| Gate | Status | Recommendation |
| --- | --- | --- |
| Local development evidence | Completed | Accepted as development and regression evidence. |
| Staging/test release evidence | Pending | Repeat fixture plus `pnpm safety:smoke:access` in a prepared non-production staging/test environment. Treat this as required release-candidate evidence. |
| Production preflight | Pending by design | Run read-only checks only. Do not run fixture, do not write smoke data, and do not execute destructive operations. |

Production must not be used to prepare or run fixture data. If production verification appears to require smoke writes, stop the release and redesign the preflight.

## 10. Remaining risks and limitations

- Staging/test full smoke rerun has not been completed.
- Multi-park concurrent fixture support remains intentionally unsupported by the tenant-wide enterprise scope singleton design.
- Fixture preparation is forbidden in production.
- High-risk action workflows such as delete, close, force close, void, approve, reject, stop, review, archive, create inspection, and create hazard still require separate acceptance.
- Dedicated read-only auditor and video security operator fixtures are not yet part of the automated smoke gate.
- Embedded video evidence flows remain a later focused verification item.
- Local dev seed contamination exists in the local database history and must not be treated as release-grade evidence.

## 11. Failure stop rules for release candidate

Stop release-candidate acceptance if any of the following occurs:

- Staging/test `pnpm safety:smoke:access` returns non-zero.
- The seven-account matrix is incomplete.
- Enterprise scoped records cannot prove tenant, park, and enterprise boundaries.
- Any high-risk denylist permission is present on a non-admin smoke account.
- Unauthorized users can see or access protected safety/video entries.
- Overdue-only users can access ordinary hazards.
- Single-statistics users can access the combined emergency/work-permit dashboard or API.
- Fixture production guard fails or can be bypassed.
- Production validation requires writing smoke accounts, roles, enterprises, hazards, or other fixture data.
- Allowed read APIs return unallowlisted non-`2xx` statuses.

## 12. Final decision

Current local full-open verification is accepted as development evidence.

The safety module should not be marked as release-grade accepted until the same gate is repeated in a staging/test environment with independent non-production data.

## 13. Next step

Recommended next step: enter `safety module full-open phase 2b-staging-run` to produce release-grade staging/test evidence.

If the current milestone only requires local closure, proceed to the first release acceptance summary with this document marked as local-complete and staging-pending.
