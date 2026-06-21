# RBAC Menu Dashboard Permission Release Gate

Date: 2026-06-21
Task: `PROD-20260621-002-A4-RBAC-MENU-GATE`
Scope: RBAC, first-release menu, dashboard visibility, route denial, and permission consistency.

## 1. Purpose

This gate defines the release checks required before the RBAC, menu, and dashboard surface can be accepted for production launch.

It is a release-check plan only. It does not change API, Web, package, migration, seed, auth, CI, Docker, deploy, or production environment behavior. Production sampling is read-only unless a release owner separately approves a controlled write-path smoke with test marker and cleanup evidence.

## 2. Environment Policy

| Environment | Allowed RBAC/menu checks | Not allowed by default | Evidence required |
|---|---|---|---|
| Local | Syntax checks, typecheck, static menu whitelist, RBAC smoke, idempotency smoke | Real production credentials or production DB | Command logs and changed-file audit |
| Pre-production | Full RBAC/menu execution, controlled test-account route denial, dashboard browser sampling, approved write-path smoke | Destructive cleanup, reset, truncate, dev seed | Command logs, screenshots, target URL, account labels |
| Production | Login, read-only menu/dashboard sampling, read-only `/users/me` or equivalent context inspection, direct-route denial sampling | Write-path e2e, permission edits, seed, cleanup, module toggles | Human approval, screenshots/logs, target URL, account labels, timestamp |

Production sampling requires explicit human approval before execution. Credentials, tokens, production passwords, and real account names must not be written into evidence.

## 3. Required Accounts

Use account labels in evidence. Store actual credentials out of band.

| Account label | Required properties | Used for |
|---|---|---|
| `RBAC_SUPER_ADMIN_SAMPLE` | Super-admin or equivalent first administrator; scoped to the target tenant and park | Dashboard load, first-release menu visibility, permission/context consistency |
| `RBAC_STANDARD_ROLE_SAMPLE` | Approved ordinary role with a documented permission set; not super-admin | Positive standard-role menu and dashboard checks |
| `RBAC_DENIED_ROUTE_SAMPLE` | Ordinary role missing at least one sampled menu/page/API permission | Negative route denial and hidden-menu checks |
| `RBAC_DASHBOARD_LIMITED_SAMPLE` | Optional role with intentionally limited dashboard permissions | Dashboard widget/card permission consistency |

Before production use, the release owner must approve:

- target environment and base URLs;
- account labels and role purpose;
- read-only scope;
- screenshot/log retention location;
- no production permission mutation during the sample.

## 4. Target URLs And Surfaces

Replace placeholders with the approved target values.

| Surface | Target |
|---|---|
| Web login | `${WEB_BASE_URL}/login` |
| Dashboard | `${WEB_BASE_URL}/dashboard` |
| User management | `${WEB_BASE_URL}/system/users` |
| Asset paths | `${WEB_BASE_URL}/assets/parks`, `${WEB_BASE_URL}/assets/unit-status-board`, `${WEB_BASE_URL}/assets/statistics` |
| Leasing first-release paths | `${WEB_BASE_URL}/leasing/contracts`, `${WEB_BASE_URL}/leasing/receivables`, `${WEB_BASE_URL}/leasing/payments` |
| Work order paths | `${WEB_BASE_URL}/workorders`, `${WEB_BASE_URL}/workorders/list` |
| Operations terminal | `${WEB_BASE_URL}/operations/terminal` |
| Safety first-release paths | `${WEB_BASE_URL}/safety/dashboard`, `${WEB_BASE_URL}/safety/inspect-points`, `${WEB_BASE_URL}/safety/inspect-templates`, `${WEB_BASE_URL}/safety/inspect-plans`, `${WEB_BASE_URL}/safety/inspect-tasks`, `${WEB_BASE_URL}/safety/my-inspect-tasks`, `${WEB_BASE_URL}/safety/hazards`, `${WEB_BASE_URL}/safety/hazards/overdue` |
| Read-only user context | `${API_BASE_URL}/users/me` with an approved browser/session token; do not record the token |

Non-first-release exposure samples must be selected from the approved launch policy. If the launch policy says these areas remain closed, sample at least three of these paths and confirm they are not visible in the menu and are denied or unavailable by direct route:

- `/iot/dashboard`
- `/energy/dashboard`
- `/robots/overview`
- `/admin/video-security/dashboard`
- `/safety/emergencies`
- `/safety/work-permits`
- `/leasing/leads`
- `/leasing/refunds`
- `/leasing/invoices`

## 5. Check Matrix

| Check ID | Evidence area | Pre-production execution | Production read-only sample | Go condition | No-Go condition |
|---|---|---|---|---|---|
| A4-RBAC-01 | Super-admin context | Run RBAC smoke and confirm admin login, tenant, park, roles, permissions, and enabled modules | Log in as `RBAC_SUPER_ADMIN_SAMPLE`; capture dashboard and `/users/me` context summary with secrets redacted | Super-admin reaches dashboard and has expected tenant/park context and permissions | Super-admin cannot log in, cannot open dashboard, lacks expected context, or shows cross-tenant/park mismatch |
| A4-RBAC-02 | Standard role positive visibility | Use approved standard role in pre-production browser; capture visible menus and dashboard | Log in as `RBAC_STANDARD_ROLE_SAMPLE`; capture visible left menu and dashboard | Only role-authorized first-release menus and dashboard content appear | Standard role loses required first-release menu or sees admin-only/non-approved menu |
| A4-RBAC-03 | Denied route | Directly open a route/API the role lacks | Directly open one approved denied route without clicking write actions | UI/API rejects with login redirect, 403, disabled page, or equivalent no-access behavior | Unauthorized route/API succeeds or exposes protected data |
| A4-MENU-01 | First-release menu whitelist | Run `node scripts/e2e/first-release-menu-whitelist.mjs` and inspect required path assertions | Browser sample verifies required first-release menu entries for approved roles | Required first-release menu paths are present for authorized roles | Any required first-release menu is missing |
| A4-MENU-02 | Non-first-release exposure | Compare visible menu with approved launch policy | Browser sample verifies closed paths are hidden; direct route is denied or unavailable | Closed modules remain hidden/unavailable according to launch policy | Non-first-release menu is visible or direct route is usable without explicit launch approval |
| A4-DASH-01 | Dashboard visibility | Browser sample in pre-production across admin and limited roles | Browser sample in production across approved accounts | Dashboard renders, and widgets/cards match role permissions and enabled modules | Blank dashboard, auth loop, missing required widget, or unauthorized widget visible |
| A4-PERM-01 | Permission consistency | Compare menu/page/API result against `/users/me` permissions and role design | Capture read-only context summary; no tokens in evidence | Menu visibility, direct route behavior, and permission context agree | Menu shows access not backed by permissions, or API allows access while UI hides it for permission reasons |
| A4-IDEMP-01 | Write-path protection context | Run idempotency smoke only in local/pre-production approved target | Production write-path sample is skipped unless separately approved | Local/pre-production missing-key, replay, and conflict semantics pass | Missing-key write succeeds, replay duplicates data, or conflict is not detected |

## 6. Pre-Production Command Set

Run from the repository root after the target API is ready. Use environment variables, not committed credentials.

```bash
git status --short
pnpm typecheck
node --check scripts/e2e/s1-rbac-std-fix-smoke.mjs
node --check scripts/e2e/first-release-menu-whitelist.mjs
node --check scripts/e2e/first-release-idempotency.mjs
node scripts/e2e/first-release-menu-whitelist.mjs
E2E_API_BASE=<preprod_api>/api/v1 E2E_TENANT_ID=<tenant> E2E_PARK_ID=<park> E2E_ADMIN_USERNAME=<label> E2E_ADMIN_PASSWORD=<secret_from_vault> node scripts/e2e/s1-rbac-std-fix-smoke.mjs
API_BASE_URL=<preprod_api>/api/v1 ADMIN_USERNAME=<label> ADMIN_PASSWORD=<secret_from_vault> TEST_RUN_ID=<release_marker> node scripts/e2e/first-release-idempotency.mjs
git diff --check
git status --short
```

Notes:

- `s1-rbac-std-fix-smoke.mjs` disables and restores tenant modules as part of its authorization check. Do not run it against production.
- `first-release-idempotency.mjs` creates regression-marked user and work-order data. Do not run it against production without separate written approval, marker, and cleanup record.
- `first-release-menu-whitelist.mjs` is a static source check. It does not replace target browser sampling.

## 7. Production Sampling Procedure

Production sampling must be read-only by default.

1. Record approval: release owner, operator, target URL, date/time, account labels, and approved scope.
2. Confirm no pending app-code, migration, seed, auth, CI, Docker, deploy, or env file change is part of this sampling.
3. Log in through `${WEB_BASE_URL}/login` as `RBAC_SUPER_ADMIN_SAMPLE`.
4. Capture dashboard screenshot and left-menu screenshot. Redact personal data if visible.
5. Capture read-only user context summary from browser devtools or an approved read-only command. Do not store token values.
6. Repeat menu and dashboard screenshots for `RBAC_STANDARD_ROLE_SAMPLE`.
7. Open the approved denied route as `RBAC_DENIED_ROUTE_SAMPLE`; capture rejection screenshot or HTTP status log.
8. Sample approved closed/non-first-release paths according to the launch policy; capture hidden-menu evidence and direct-route denial evidence.
9. Fill the evidence table in the runbook and have the release owner sign Go, Conditional-Go, or No-Go.

## 8. Evidence Record Fields

Each check record must include:

- check ID;
- environment;
- target Web URL or API path;
- account label and role purpose;
- command or browser action;
- expected result;
- actual result;
- screenshot path or command-log path;
- approver;
- timestamp with timezone;
- operator;
- pass/fail decision;
- follow-up task ID for any failure or accepted residual risk.

## 9. Go / Conditional-Go / No-Go

### Go

- All A4 checks required for the release scope pass in local or pre-production.
- Production read-only sampling has release-owner approval and passes for super-admin, standard role, denied route, first-release menu, non-first-release exposure policy, dashboard visibility, and permission consistency.
- Any skipped production write-path smoke has an explicit reason, and no release owner asked for it as a blocker.
- No secrets, tokens, production passwords, or real account names are stored in evidence.

### Conditional-Go

- Only P2/P3 visibility issues remain.
- Each residual issue has an owner, user impact, mitigation, deadline, and release-owner acceptance.
- No P0/P1 RBAC/menu/dashboard issue remains open.

### No-Go

- Super-admin cannot log in, cannot open `/dashboard`, or has tenant/park context mismatch.
- Standard role sees admin-only or unauthorized menus, pages, APIs, or dashboard widgets.
- A denied direct route/API succeeds or exposes protected data.
- Any required first-release menu entry is missing for an authorized role.
- Any non-first-release menu or route is exposed contrary to the approved launch policy.
- Dashboard renders blank, loops on auth, hides required cards, or shows unauthorized cards.
- Menu visibility, route access, and `/users/me` permission context disagree.
- Production sampling is attempted without approval or records secrets/tokens/passwords.
- Any write-path production smoke is run without separate approval, marker, cleanup plan, and rollback awareness.

