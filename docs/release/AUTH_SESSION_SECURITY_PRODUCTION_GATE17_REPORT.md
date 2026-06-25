# Auth And Session Security Production Gate-17 Report

Date: 2026-06-25

## Verdict

PASS

Gate-17 verified that production authentication and session security controls are active and observable. The gate used policy/source checks, schema checks, protected API checks, refresh-token rejection checks, origin rejection checks, and a controlled failed-login audit write.

## Run Evidence

- GitHub Actions run: `28160346399`
- Job: `83398983417`
- Commit under test: `222b2919a8ed0aede210353ccf849eec385b2c0b`
- Gate run ID: `gate17-auth-session-security-20260625T092459Z`
- API base: `http://127.0.0.1:3010/api/v1`
- Web base: `http://127.0.0.1:3011`
- Tenant: `10000001`
- Park: `20000001`
- Production DB write: `audit_only`

## Policy Evidence

- API container `NODE_ENV=production`.
- `JWT_SECRET` is configured and was not printed.
- Password lockout policy effective: `true`.
- Refresh cookie origin check effective: `true`.
- Allowed web origin is configured.
- Refresh cookie SameSite: `lax`.

## Source Security Evidence

The production source includes:

- Auth pre-validation rate-limit middleware.
- Credential and stable auth rate limits.
- Password failure lockout policy.
- Refresh cookie origin check.
- HttpOnly refresh cookie handling.
- Refresh token rotation.
- Login audit recording.

## Schema Evidence

| Schema Area | Required Columns Verified | Result |
| --- | ---: | --- |
| `sys_user` password lockout state | 4 | PASS |
| `sys_auth_refresh_token` rotation state | 4 | PASS |
| `sys_login_log` audit state | 4 | PASS |

## API Security Evidence

| Check | Expected | Result |
| --- | --- | --- |
| Authenticated `/auth/me` | HTTP 200 | PASS |
| Invalid refresh token | HTTP 401 | PASS |
| Invalid refresh cookie origin | HTTP 403 | PASS |
| Idempotent `/auth/logout-cookie` | HTTP 200 | PASS |
| Invalid login attempt | HTTP 401 | PASS |

## Controlled Audit Write Evidence

- Gate username: `gate17-nonexistent-gate17-auth-session-security-20260625T092459Z`
- Failed login audit rows before: `0`
- Failed login audit rows after: `1`
- Scope: audit-only write to `sys_login_log`.
- No real user password was used.
- No real account was locked.

## Final Verdict

PASS: Auth/session security policies, schemas, API rejections, origin checks, and audit logging are production-verifiable.
