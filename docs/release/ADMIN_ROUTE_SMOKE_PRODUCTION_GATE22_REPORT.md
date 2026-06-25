# Admin Route Smoke Production Gate-22 Report

Date: 2026-06-25

## Verdict

PASS

## Production Run

- GitHub Actions gate run: `28162595114`
- Gate run id: `gate22-admin-route-smoke-20260625T100600Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Gate production DB write: `false`
- Gate deployment executed: `false`
- Gate migration executed: `false`

## Remediation Before PASS

The first Gate-22 run found a real production API validation issue:

- Failed GitHub Actions gate run: `28162334865`.
- Failed run id: `gate22-admin-route-smoke-20260625T100118Z`.
- Failure: `/attachments?page=1&page_size=5&biz_type=system` returned HTTP `400`.
- Cause: `biz_type` and `biz_id` were accepted by the controller signature but not declared in the query DTO used by the global validation pipe.
- Fix commit: `a3e5b15 fix(api): allow attachment list filters`.
- Production deploy run: `28162471981`.

No schema change was introduced by the fix. The production API deploy rebuilt and restarted the API service, then production health checks passed before Gate-22 was rerun.

## Web Route Smoke

Gate-22 verified 15 backend administration routes:

| Route | Result |
| --- | --- |
| `/system/users` | PASS |
| `/system/roles` | PASS |
| `/system/orgs` | PASS |
| `/system/permissions` | PASS |
| `/system/dicts` | PASS |
| `/system/modules` | PASS |
| `/system/branding` | PASS |
| `/system/tenants` | PASS |
| `/system/audit/op-logs` | PASS |
| `/system/audit/login-logs` | PASS |
| `/system/data-scopes` | PASS |
| `/system/field-policies` | PASS |
| `/system/files` | PASS |
| `/system/attachments` | PASS |
| `/system/code-rules` | PASS |

Web route smoke count: `15`.

## API Read Surface Smoke

Gate-22 verified 17 backend administration API read surfaces:

| API | Count | Result |
| --- | ---: | --- |
| `/users?page=1&page_size=5` | 5 | PASS |
| `/roles?page=1&page_size=5` | 5 | PASS |
| `/roles/tree` | 24 | PASS |
| `/orgs?page=1&page_size=5` | 5 | PASS |
| `/permissions?page=1&page_size=5` | 5 | PASS |
| `/permissions/tree` | 318 | PASS |
| `/dict-types?page=1&page_size=5` | 5 | PASS |
| `/modules?page=1&page_size=5` | 5 | PASS |
| `/platform-modules?page=1&page_size=5` | 5 | PASS |
| `/tenants?page=1&page_size=5` | 1 | PASS |
| `/audit/op-logs?page=1&page_size=5` | 5 | PASS |
| `/audit/login-logs?page=1&page_size=5` | 5 | PASS |
| `/data-scopes?page=1&page_size=5` | 5 | PASS |
| `/field-policies?page=1&page_size=5` | 5 | PASS |
| `/files?page=1&page_size=5` | 5 | PASS |
| `/attachments?page=1&page_size=5&biz_type=system` | 0 | PASS |
| `/code-rules?page=1&page_size=5` | 5 | PASS |

API read surface smoke count: `17`.

## Safety Evidence

- PASS: Gate-22 performed read-only web and API checks only.
- PASS: Gate-22 did not execute a deployment.
- PASS: Gate-22 did not execute a migration.
- PASS: Gate-22 did not perform production DB writes.
- PASS: Gate-22 did not perform destructive operations.

## Final Verdict

Gate-22 passed after the attachment query DTO remediation. Production backend administration routes and read surfaces are reachable, renderable, and returning valid responses on the verified production target.
