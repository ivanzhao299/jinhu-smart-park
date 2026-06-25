# Persona Login Production Gate-21 Report

Date: 2026-06-25

## Verdict

PASS

## Production Run

- GitHub Actions run: `28161997927`
- Gate run id: `gate21-persona-login-20260625T095507Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Production DB write: `temporary_persona_users_and_login_audit`
- Deployment executed: `false`
- Migration executed: `false`

## Scope

Gate-21 verified that the 9 production role-pack personas can complete real password login, load permissions, access authenticated self-service endpoints, and leave auditable login evidence.

The gate created temporary persona users only for the duration of the smoke test. Temporary users, role bindings, park bindings, refresh tokens, and identity rows were cleaned up after evidence collection. Login audit rows were retained as production evidence.

## Persona Login Evidence

| Persona role | Role permission links | Login | Login permission count | `/auth/me` | `/users/me` |
| --- | ---: | --- | ---: | --- | --- |
| `PARK_GENERAL_MANAGER` | 27 | PASS | 28 | PASS | PASS |
| `PARK_OPERATOR` | 52 | PASS | 53 | PASS | PASS |
| `CUSTOMER_SERVICE` | 11 | PASS | 12 | PASS | PASS |
| `SECURITY_MANAGER` | 52 | PASS | 53 | PASS | PASS |
| `SECURITY_GUARD` | 29 | PASS | 30 | PASS | PASS |
| `SAFETY_INSPECTOR` | 15 | PASS | 16 | PASS | PASS |
| `IOT_MANAGER` | 140 | PASS | 141 | PASS | PASS |
| `TENANT_ADMIN` | 13 | PASS | 14 | PASS | PASS |
| `TENANT_STAFF` | 6 | PASS | 7 | PASS | PASS |

## Audit Evidence

- Persona role count: `9`.
- Persona login pass count: `9`.
- Successful login audit rows: `9`.
- Refresh token rows before cleanup: `9`.
- Active temporary persona users after cleanup: `0`.
- Temporary password hash generated inside the API container without printing the cleartext secret in logs.

## Safety Evidence

- PASS: temporary persona users were soft-deleted.
- PASS: temporary role and park bindings were soft-deleted.
- PASS: temporary refresh tokens were revoked and soft-deleted.
- PASS: login audit rows were retained as production evidence.
- PASS: no business data was modified.
- PASS: no deployment was executed.
- PASS: no migration was executed.

## Final Verdict

Gate-21 passed. All 9 production persona roles can complete real password login, receive role permissions, call `/auth/me`, call `/users/me`, and leave auditable login evidence on the verified production target.
