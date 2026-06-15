# JinHu Smart Park safety module full-open phase 2 access smoke record

## 1. Purpose

This phase verifies the actual access result after the phase 1 safety menu and permission migration has been applied. It focuses on whether safety and video security entries, page menus, and read-only APIs follow the aligned permission rules.

## 2. Boundaries

- Do not run this verification against production.
- Do not modify production data.
- Do not execute destructive actions.
- Do not expand role permissions.
- Do not update snapshot baselines.
- Do not treat this smoke as a full security acceptance test.
- The script must reject production-like API targets before login.
- `SAFETY_SMOKE_ENVIRONMENT` is required and must be one of `local`, `test`, `staging`, or `ci`.

## 3. Preconditions

- Phase 1 has been merged into the target test branch or environment.
- `database/migrations/000144_safety_full_open_permission_menu_patch.sql` has been executed in the test database.
- Phase 2b access smoke must include `database/migrations/000145_safety_phase1_review_followup.sql` after `000144` so page guards and statistics API metadata match the reviewed permission model.
- Test database fixtures are ready.
- Test accounts are ready and do not use real production passwords.
- API service is running and reachable.
- Web menu source has been confirmed as `/auth/me` or `/users/me` user context menus.
- Test accounts are scoped to the intended tenant and park.
- Full phase 2b verification requires the complete account matrix: admin, normal, unauthorized, enterprise, overdue hazard, dual-statistics, and single-statistics.
- Partial matrix mode is only for script debugging and requires `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true`; it cannot be recorded as a complete phase 2b pass.
- Full phase 2b verification requires `SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID` to detect same-park cross-enterprise data leaks.
- Before running phase 2b, confirm `/safety/hazards/overdue` stays on the overdue route and is not redirected into `/safety/hazards?overdue_only=true`, otherwise the layout guard may apply the normal hazard permission.
- `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true` is only a debug override; any run using it must end as blocked/debug-only and cannot be recorded as a full pass.
- Phase 2b should also verify the overdue hazard user can open a hazard detail drawer without status-log or dictionary permission failures.
- If local/test fixture data is not ready, use `docs/release/safety-module-access-smoke-fixture-plan.md` as the preparation plan; this is a blocked pre-smoke state, not a phase 2b pass.
- Local/test operators can prepare the required fixture data with `pnpm safety:fixtures:access` after setting `SAFETY_FIXTURE_ENVIRONMENT=local|test|ci` and `SAFETY_FIXTURE_ALLOW_WRITE=yes`; fixture success is not smoke success.

## 4. Account Matrix

| Account type | Purpose | Required permission | Expected result |
| --- | --- | --- | --- |
| Admin | Full entry verification | `SUPER_ADMIN` | All target entries visible |
| Normal inspect user | Operations terminal verification | `safety_inspect_task:my` | Operations terminal visible |
| Overdue hazard user | Overdue hazard permission verification | `safety_hazard:overdue` without `safety_hazard:read` | Overdue hazards visible/readable; normal hazards hidden/rejected |
| Dual-statistics user | Emergency/work-permit dashboard positive verification | `safety_emergency_statistics:read` and `safety_work_permit_statistics:read` | Emergency dashboard visible and readable |
| Single-statistics user | Emergency/work-permit dashboard negative verification | Exactly one statistics read permission | Dashboard hidden and API rejected |
| Unauthorized user | Rejection verification | No safety permission | Hidden or rejected |
| Enterprise user | Data scope verification | Enterprise-side minimum permission | Only related data visible |

## 5. Entry List

- `/operations/terminal`
- `/safety/hazards/overdue`
- `/safety/emergency-dashboard`
- `/safety/dashboard`
- `/safety/inspect-tasks`
- `/safety/my-inspect-tasks`
- `/safety/hazards`
- `/safety/emergencies`
- `/safety/work-permits`
- `/admin/video-security/dashboard`
- `/admin/video-security/alerts`

## 6. Passing Criteria

- Admin checks pass.
- Users with required permissions can see the corresponding entries.
- Users without required permissions cannot see the entries or receive a rejection on direct API access.
- All allowed read checks return HTTP `2xx`; any `4xx` or `5xx` response is a failure unless explicitly allowlisted in the script.
- Enterprise users read a real scoped safety endpoint and cannot cross tenant, park, or enterprise data boundaries.
- Full runs compare enterprise scope fields against `SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID`; tenant/park-only checks are not sufficient.
- Every enterprise scoped endpoint record must expose verifiable tenant, park, and enterprise scope fields in full runs; records without recognizable fields or without an enterprise field fail the smoke.
- The overdue hazard account must prove both sides of the permission boundary: `/safety/hazards/overdue` is allowed and `/safety/hazards` is hidden or rejected.
- The overdue hazard account should open a list item detail successfully; lacking `safety_hazard:read` must not trigger a status-log `403` page error, and lacking dictionary permissions must only degrade labels.
- High-risk actions are not opened to normal roles.
- The smoke script returns `0`.

Enterprise scope expectations may be provided with:

```text
SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID
```

If the scoped endpoint has no records, if any returned record has no recognizable scope fields, or if any returned record lacks an enterprise boundary field, full phase 2b verification fails by default. `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true` may be used only for debugging; any run with this flag is blocked/debug-only, returns non-zero, and must not be recorded as a complete phase 2b pass.

## 7. Stop Conditions

- Admin cannot log in.
- `/auth/me` fails.
- Any of the three phase 1 aligned entries violates the expected permission rule.
- Unauthorized users can access protected entries.
- Enterprise users can see data outside their allowed scope.
- Enterprise scoped endpoint cannot prove scope and no explicit debug override is set.
- Any enterprise scoped endpoint record cannot prove tenant, park, and enterprise scope during a full run.
- `SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID` is missing.
- Overdue hazard account can see or access the normal hazards entry/API.
- Normal users receive high-risk permissions.
- Required account matrix is incomplete without `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true`.
- Specialized overdue hazard, dual-statistics, or single-statistics accounts are missing or fail their dedicated assertions.
- Enterprise scope override is enabled; the run is debug-only and cannot be release evidence.
- `SAFETY_SMOKE_ENVIRONMENT` is missing or the API target is production-like.
- The smoke script returns non-zero.

## 8. Verification Result Template

```text
Branch:
Commit:
Environment:
Operator:
Date:
Migration executed:
API base URL:
Admin login:
Admin menu:
Operations terminal:
Overdue hazards:
Emergency dashboard:
Normal user access:
Unauthorized user rejection:
Enterprise data scope:
High-risk action rejection:
Smoke command:
Smoke result:
Final decision:
Blocking issues:
Follow-up owner:
```

## 9. Phase Conclusion

If this access smoke passes in a prepared test environment, phase 2 can be closed and the project can move to phase 3: role-based open matrix and data-scope focused verification.

## 10. Phase 2b Execution Record

```text
Branch: test/safety-access-smoke-execution
Commit: 4cd0fda
Environment: Not configured
API base URL: Not configured
Migration 000144: File present in branch; execution in target environment not verified
Migration 000145: File present in branch; execution in target environment not verified
Admin account: Not configured
Normal account: Not configured
Unauthorized account: Not configured
Enterprise account: Not configured
Enterprise expected tenant: Not configured
Enterprise expected park: Not configured
Enterprise expected enterprise: Not configured
Smoke command: Not executed
Smoke exit code: Not applicable
Admin result: Not run
Normal result: Not run
Unauthorized result: Not run
Enterprise result: Not run
High-risk permission result: Not run
Final decision: Blocked before smoke execution
Blocking issues: Missing SAFETY_SMOKE_ENVIRONMENT, SAFETY_SMOKE_API_BASE_URL, full account matrix, enterprise scope expectations, API readiness confirmation, migration execution confirmation, and enterprise scoped test data confirmation.
Follow-up owner: Test environment operator
```

## 11. Fixture Planning Record

```text
Branch: docs/safety-access-smoke-fixture-plan
Environment: local Docker database
Migration 000144: succeeded in local migration history
Migration 000145: succeeded in local migration history
Smoke command: Not executed
Smoke result: Blocked before fixture preparation
Blocking issues: No safe existing command creates the complete seven-account smoke matrix or same-park cross-enterprise scoped safety data. Existing local safety records are not sufficient to prove enterprise boundary checks.
Fixture plan: docs/release/safety-module-access-smoke-fixture-plan.md
Final decision: Do not record phase 2b as passed until local/test fixtures are prepared and the full smoke returns 0.
```

## 12. Fixture Script Record

```text
Branch: test/safety-access-smoke-fixtures
Fixture command: pnpm safety:fixtures:access
Fixture script: scripts/e2e/prepare-safety-access-smoke-fixtures.mjs
Allowed environments: local, test, ci
Write confirmation: SAFETY_FIXTURE_ALLOW_WRITE=yes
Smoke command: Not executed by fixture script
Smoke result: Not proven by fixture script
Final decision: Run the fixture script only against local/test/ci, export the generated SAFETY_SMOKE_* values, start the non-production API, then execute pnpm safety:smoke:access separately.
```

## 13. Fixture Run Record

```text
Branch: test/safety-access-smoke-fixture-run
Commit: 316d3a7
Environment: local
Date: 2026-06-15
API base URL: http://127.0.0.1:3001/api/v1
API startup note: Local API was started with POSTGRES_PORT=5432 to match the local Docker Postgres port mapping.
Migration 000144: succeeded in local migration history
Migration 000145: succeeded in local migration history
Fixture command: SAFETY_FIXTURE_ENVIRONMENT=local SAFETY_FIXTURE_ALLOW_WRITE=yes pnpm safety:fixtures:access
Fixture result: Passed; seven smoke users, roles, in-scope enterprise, out-of-scope enterprise, in-scope hazard, and out-of-scope hazard prepared.
Account matrix: Complete; ADMIN, NORMAL, UNAUTHORIZED, ENTERPRISE, OVERDUE_HAZARD, DUAL_STATISTICS, and SINGLE_STATISTICS configured.
Enterprise expected tenant: 10000001
Enterprise expected park: 20000001
Enterprise expected enterprise: e84e57dc-c4dd-496e-8ff0-a210cdcb65e7
Smoke command: pnpm safety:smoke:access
Smoke exit code: 0
ADMIN result: Passed; login, /auth/me, safety/video menu entries, and read APIs returned expected results.
NORMAL result: Passed; safety_inspect_task:my present, operations terminal visible, my inspect tasks API returned 200, manage_all absent.
UNAUTHORIZED result: Passed; protected menu entries hidden, overdue hazard and emergency statistics APIs rejected with 403, high-risk permissions absent.
ENTERPRISE result: Passed; non-super, constrained data scope, scoped hazards endpoint returned only expected tenant, park, and enterprise fields.
OVERDUE_HAZARD result: Passed; overdue hazards visible/readable, normal hazards hidden and direct API rejected with 403, safety_hazard:read absent.
DUAL_STATISTICS result: Passed; both statistics read permissions present, emergency dashboard visible, statistics API returned 200.
SINGLE_STATISTICS result: Passed; exactly one statistics permission present, emergency dashboard hidden, statistics API rejected with 403.
High-risk permission result: Passed for all non-admin smoke users.
Production guard result: Passed; smoke target accepted only local API target.
Partial matrix override: Not used.
Enterprise scope unverified override: Not used.
Final decision: Phase 2b local access smoke passed; recommend phase 2b local verification closure and proceed to phase 3 role matrix/data-scope专项验证.
Blocking issues: None for local fixture-run. Staging/test environment should repeat with its own non-production data before release sign-off.
Follow-up owner: Safety module release owner
```

## 14. Fixture Run Rerun Record

```text
Branch: test/safety-access-smoke-fixture-run-rerun
Commit: 88675b3
Environment: local
Date: 2026-06-15
API base URL: http://127.0.0.1:3001/api/v1
API startup note: Local API was started with POSTGRES_PORT=5432 to match the local Docker Postgres port mapping.
Migration 000144: succeeded in local migration history
Migration 000145: succeeded in local migration history
Fixture command: SAFETY_FIXTURE_ENVIRONMENT=local SAFETY_FIXTURE_ALLOW_WRITE=yes pnpm safety:fixtures:access
Fixture rerun result: Passed; tenant-wide role, permission, and data-scope upserts completed without duplicate-key errors.
Account matrix: Complete; ADMIN, NORMAL, UNAUTHORIZED, ENTERPRISE, OVERDUE_HAZARD, DUAL_STATISTICS, and SINGLE_STATISTICS configured.
Enterprise expected tenant: 10000001
Enterprise expected park: 20000001
Enterprise expected enterprise: e84e57dc-c4dd-496e-8ff0-a210cdcb65e7
Smoke command: pnpm safety:smoke:access
Smoke exit code: 0
ADMIN result: Passed; login, /auth/me, safety/video menu entries, and read APIs returned expected 2xx results.
NORMAL result: Passed; safety_inspect_task:my present, operations terminal visible, my inspect tasks API returned 200, manage_all absent.
UNAUTHORIZED result: Passed; protected menu entries hidden, overdue hazard and emergency statistics APIs rejected with 403, high-risk permissions absent.
ENTERPRISE result: Passed; non-super, constrained data scope, scoped hazards endpoint returned verifiable tenant, park, and enterprise fields matching expectations.
OVERDUE_HAZARD result: Passed; overdue hazards visible/readable, normal hazards hidden and direct API rejected with 403, safety_hazard:read absent.
DUAL_STATISTICS result: Passed; both statistics read permissions present, emergency dashboard visible, statistics API returned 200.
SINGLE_STATISTICS result: Passed; exactly one statistics permission present, emergency dashboard hidden, statistics API rejected with 403.
High-risk permission result: Passed for all non-admin smoke users.
Production guard result: Passed; smoke target accepted only local API target.
Partial matrix override: Not used.
Enterprise scope unverified override: Not used.
Final decision: Phase 2b local fixture rerun and access smoke passed after tenant-wide upsert follow-up; recommend phase 2b local verification closure and proceed to phase 3 role matrix/data-scope专项验证.
Blocking issues: None for local fixture rerun. Staging/test environment should repeat with its own non-production data before release sign-off.
Follow-up owner: Safety module release owner
```

## 15. Fixture Run Rerun V2 Record

```text
Branch: test/safety-access-smoke-fixture-run-rerun-v2
Commit: c388b9d
Environment: local
Date: 2026-06-15
API base URL: http://127.0.0.1:3001/api/v1
API startup note: Local API was started with POSTGRES_PORT=5432 to match the local Docker Postgres port mapping.
Migration 000144: succeeded in local migration history
Migration 000145: succeeded in local migration history
Fixture command: SAFETY_FIXTURE_ENVIRONMENT=local SAFETY_FIXTURE_ALLOW_WRITE=yes pnpm safety:fixtures:access
Fixture rerun result: Passed; seven smoke users, roles, in-scope enterprise, out-of-scope enterprise, in-scope hazard, and out-of-scope hazard prepared.
Enterprise scope rule result: Stable; existing SAFETY_SMOKE_ENTERPRISE_SCOPE passed preflight with park=20000001, dimension=tenant_company, scope_type=custom, status=enabled, and the expected enterprise scope.
Fixture duplicate/pollution check: Passed; active fixture counts were 7 users, 7 roles, 2 enterprises, and 2 hazards.
Account matrix: Complete; ADMIN, NORMAL, UNAUTHORIZED, ENTERPRISE, OVERDUE_HAZARD, DUAL_STATISTICS, and SINGLE_STATISTICS configured.
Enterprise expected tenant: 10000001
Enterprise expected park: 20000001
Enterprise expected enterprise: e84e57dc-c4dd-496e-8ff0-a210cdcb65e7
Smoke command: pnpm safety:smoke:access
Smoke exit code: 0
ADMIN result: Passed; login, /auth/me, safety/video menu entries, and read APIs returned expected 2xx results.
NORMAL result: Passed; safety_inspect_task:my present, operations terminal visible, my inspect tasks API returned 200, manage_all absent.
UNAUTHORIZED result: Passed; protected menu entries hidden, overdue hazard and emergency statistics APIs rejected with 403, high-risk permissions absent.
ENTERPRISE result: Passed; non-super, constrained data scope, scoped hazards endpoint returned verifiable tenant, park, and enterprise fields matching expectations.
OVERDUE_HAZARD result: Passed; overdue hazards visible/readable, normal hazards hidden and direct API rejected with 403, safety_hazard:read absent.
DUAL_STATISTICS result: Passed; both statistics read permissions present, emergency dashboard visible, statistics API returned 200.
SINGLE_STATISTICS result: Passed; exactly one statistics permission present, emergency dashboard hidden, statistics API rejected with 403.
High-risk permission result: Passed for all non-admin smoke users.
Production guard result: Passed; smoke target accepted only local API target.
Preflight result: Passed; enterprise scope preflight did not block the valid stable local fixture.
Partial matrix override: Not used.
Enterprise scope unverified override: Not used.
Final decision: Phase 2b local fixture rerun v2 and access smoke passed after enterprise scope preflight hardening; recommend moving to phase 4 release acceptance summary or repeating this gate in staging/test for release-grade evidence.
Blocking issues: None for local fixture rerun v2. Staging/test environment should repeat with its own non-production data before release sign-off.
Follow-up owner: Safety module release owner
```
