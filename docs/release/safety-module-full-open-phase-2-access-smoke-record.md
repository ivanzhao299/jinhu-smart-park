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
- Full phase 2b verification requires the complete account matrix: admin, normal, unauthorized, and enterprise.
- Partial matrix mode is only for script debugging and requires `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true`; it cannot be recorded as a complete phase 2b pass.

## 4. Account Matrix

| Account type | Purpose | Required permission | Expected result |
| --- | --- | --- | --- |
| Admin | Full entry verification | `SUPER_ADMIN` | All target entries visible |
| Normal inspect user | Operations terminal verification | `safety_inspect_task:my` | Operations terminal visible |
| Overdue hazard user | Overdue hazard verification | `safety_hazard:overdue` | Overdue hazards visible |
| Dual-statistics user | Emergency/work-permit dashboard verification | `safety_emergency_statistics:read` and `safety_work_permit_statistics:read` | Emergency dashboard visible |
| Single-statistics user | Negative verification | Only one statistics read permission | Hidden or rejected |
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
- High-risk actions are not opened to normal roles.
- The smoke script returns `0`.

Enterprise scope expectations may be provided with:

```text
SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID
```

If the scoped endpoint has no records or no recognizable scope fields, full phase 2b verification fails by default. `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true` may be used only for debugging and must not be treated as full release evidence.

## 7. Stop Conditions

- Admin cannot log in.
- `/auth/me` fails.
- Any of the three phase 1 aligned entries violates the expected permission rule.
- Unauthorized users can access protected entries.
- Enterprise users can see data outside their allowed scope.
- Enterprise scoped endpoint cannot prove scope and no explicit debug override is set.
- Normal users receive high-risk permissions.
- Required account matrix is incomplete without `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true`.
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
