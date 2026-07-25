# RBAC Menu Dashboard Permission Release Checks

Date: 2026-06-21
Related release gate: [RBAC Menu Dashboard Permission Release Gate](../release/rbac-menu-dashboard-permission-release-gate.md)

## 1. Purpose

This runbook is the execution companion for the Agent 4 RBAC/menu/dashboard release gate. It lists the commands, browser samples, evidence fields, and pass/fail rules for pre-production execution and production read-only sampling.

## 2. Static And Syntax Checks

Run these from the repository root before publishing any evidence:

```bash
git status --short
pnpm typecheck
node --check scripts/e2e/s1-rbac-std-fix-smoke.mjs
node --check scripts/e2e/first-release-menu-whitelist.mjs
node --check scripts/e2e/first-release-idempotency.mjs
git diff --check
git status --short
```

Pass criteria:

- TypeScript typecheck passes.
- The three e2e scripts parse successfully.
- `git diff --check` reports no whitespace errors.
- Worktree status contains only expected task files and orchestrator metadata.

## 3. Pre-Production Full Execution

Pre-production is the default place to run the full RBAC/menu command set because two checks can mutate controlled test state.

```bash
node scripts/e2e/first-release-menu-whitelist.mjs
E2E_API_BASE=<preprod_api>/api/v1 E2E_TENANT_ID=<tenant> E2E_PARK_ID=<park> E2E_ADMIN_USERNAME=<account_label> E2E_ADMIN_PASSWORD=<secret_from_vault> node scripts/e2e/s1-rbac-std-fix-smoke.mjs
API_BASE_URL=<preprod_api>/api/v1 ADMIN_USERNAME=<account_label> ADMIN_PASSWORD=<secret_from_vault> TEST_RUN_ID=<release_marker> node scripts/e2e/first-release-idempotency.mjs
```

Evidence to keep:

| Command | Evidence | Pass condition | No-Go condition |
|---|---|---|---|
| `first-release-menu-whitelist.mjs` | Full command log | Required first-release paths and compatibility symbols pass | Script exits non-zero or reports missing required menu path |
| `s1-rbac-std-fix-smoke.mjs` | Full command log and target labels | Admin login, `/users/me`, module disable/restore, and module guard denial pass | Admin login fails, module is not restored, or disabled module access succeeds |
| `first-release-idempotency.mjs` | Full command log and test marker | Missing-key, replay, and conflict behavior pass | Missing-key write succeeds, replay duplicates, or conflict is not detected |

Do not run `s1-rbac-std-fix-smoke.mjs` against production because it disables and restores tenant modules. Do not run `first-release-idempotency.mjs` against production unless the release owner explicitly approves write-path sampling, marker, cleanup, and rollback handling.

## 4. Browser Sampling

Use browser sampling in pre-production and, after approval, production. Each screenshot filename should include environment, account label, check ID, and timestamp.

| Check ID | Account label | Browser action | Expected result |
|---|---|---|---|
| A4-RBAC-01 | `RBAC_SUPER_ADMIN_SAMPLE` | Log in, open `/dashboard`, capture `/users/me` context summary | Dashboard loads and context has expected tenant, park, roles, permissions, and enabled modules |
| A4-RBAC-02 | `RBAC_STANDARD_ROLE_SAMPLE` | Open dashboard and left menu | Only approved role-authorized menus and dashboard content appear |
| A4-RBAC-03 | `RBAC_DENIED_ROUTE_SAMPLE` | Directly open one approved denied route | Access is rejected by redirect, 403, disabled page, or equivalent no-access behavior |
| A4-MENU-01 | Super-admin and standard role | Inspect required first-release menu entries | Required first-release entries are visible when role-authorized |
| A4-MENU-02 | Standard or denied role | Inspect closed/non-first-release entries and direct URLs | Closed entries are hidden and direct route is denied or unavailable |
| A4-DASH-01 | Super-admin and limited role | Compare dashboard widgets/cards against permissions | Dashboard content matches permissions and enabled modules |
| A4-PERM-01 | Standard and denied role | Compare menu, direct route, and user context | Menu visibility and route access agree with permission context |

Production read-only sampling must not click create, update, delete, enable, disable, import, export, approve, void, generate, pay, waive, invoice, dispatch, or cleanup actions.

## 5. Menu Fallback Manual Interception

The automated Go-Live Browser UAT derives its page set from `/users/me` `menu_tree` or `menus`. It records `NO_VISIBLE_MENU_PAGE` and stops when both are empty, so that result is not evidence that the Web `dashboardMenus` fallback works.

Use this read-only Chrome procedure in Local or UAT with an approved standard-role account:

1. Log in, open `/dashboard`, open DevTools, and select **Sources > Overrides**.
2. Choose a local override folder, allow Chrome access, then reload the page.
3. In **Network**, locate the successful `/users/me` request, right-click it, and choose **Override content**.
4. In the overridden JSON response, set both `data.menu_tree` and `data.menus` to empty arrays. Do not change the user ID, tenant, park, roles, permissions, `is_super`, or enabled-module fields.
5. Save the override and reload `/dashboard`. Confirm in Network that `/users/me` is served from the local override.
6. Capture the rendered sidebar. It must not be empty, proving the Web used `dashboardMenus`; every visible link must still be allowed by the retained permissions and enabled modules.
7. Pick one permission-denied or module-disabled fallback path and open it directly. The page must reject access through redirect, 403, forbidden/disabled state, or equivalent no-access behavior.
8. Remove or disable the override, reload, and confirm the original backend-provided menu tree is restored.

Record:

- environment, commit, timestamp, and account label;
- the redacted overridden `/users/me` response showing only empty menu fields plus role/module/permission summaries;
- before/after sidebar screenshots;
- the denied direct-route result;
- confirmation that the override was removed.

Do not use a super-admin account as the only sample because `*` permission cannot prove fallback permission filtering. Local Overrides changes only the browser response; it must not be replaced with API writes, role edits, module toggles, or committed fixture data.

## 6. Evidence Table Template

Copy this table into the release evidence report for each target environment.

| Check ID | Environment | Target URL/API | Account label | Expected | Actual | Evidence path | Result | Approver | Timestamp |
|---|---|---|---|---|---|---|---|---|---|
| A4-RBAC-01 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-RBAC-02 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-RBAC-03 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-MENU-01 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-MENU-02 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-DASH-01 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-PERM-01 | `<local/preprod/prod>` | `<url>` | `<label>` | `<expected>` | `<actual>` | `<screenshot/log>` | `<PASS/FAIL>` | `<name>` | `<time>` |
| A4-MENU-FALLBACK-01 | `<local/uat>` | `<url>` | `<standard-role-label>` | `dashboardMenus` fallback renders and remains permission/module filtered | `<actual>` | `<override response/screenshots>` | `<PASS/FAIL>` | `<name>` | `<time>` |

## 7. Required Approval Record For Production

Before production sampling, record:

| Field | Value |
|---|---|
| Release owner approval | `<name/time>` |
| Operator | `<name>` |
| Target Web URL | `<url>` |
| Target API URL | `<url>` |
| Account labels approved | `<labels only>` |
| Scope | `read-only RBAC/menu/dashboard sampling` |
| Explicitly skipped | `write-path e2e, permission edits, module toggles, seed, cleanup` |
| Evidence destination | `<path/link>` |

## 8. Failure Handling

Stop the release gate and open a follow-up task if any of these happen:

- unauthorized access succeeds;
- required first-release menu is missing;
- non-first-release menu or route is exposed against the launch policy;
- fallback sidebar is empty, exposes a permission/module-denied entry, or permits a denied direct route;
- dashboard visibility does not match role permissions;
- `/users/me` context does not match the visible menu or route result;
- any production sampling writes data or changes permissions without approval.

