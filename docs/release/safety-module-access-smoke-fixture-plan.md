# JinHu Smart Park safety module access smoke fixture plan

## 1. Purpose

This plan describes how to prepare local or test-only fixtures for the safety module full-open phase 2b access smoke. The target smoke command is:

```bash
pnpm safety:smoke:access
```

The fixture must allow the smoke script to verify safety and video security menu visibility, page access, read-only API access, negative authorization checks, high-risk permission denial, and enterprise data scope boundaries.

## 2. Scope and boundaries

- Use only `local`, `test`, or `ci` environments.
- Do not connect to production domains, production IPs, production databases, or production accounts.
- Do not write passwords, tokens, keys, database credentials, or generated smoke credentials to Git.
- Do not modify business code, smoke assertions, production config, seed files, or migration files to make the smoke pass.
- Do not grant high-risk permissions to normal, enterprise, unauthorized, overdue-only, dual-statistics, or single-statistics smoke users.
- Do not use `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true` or `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true` as release evidence.

## 3. Current local baseline

Read-only preflight confirmed the repository is on `docs/safety-access-smoke-fixture-plan`, based on `origin/main`, with a clean worktree before this document was added.

The local Docker PostgreSQL database is reachable. Migration history shows:

| Migration | Local status |
| --- | --- |
| `000144_safety_full_open_permission_menu_patch.sql` | `succeeded` |
| `000145_safety_phase1_review_followup.sql` | `succeeded` |

Earlier local setup also completed `pnpm db:migrate` and `ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod`. `TENANT_ID=10000001 PARK_ID=20000001 pnpm db:check:init` did not fully pass because the local database contains dev/regression test contamination, but bootstrap admin, tenant, park, permissions, core roles, and role-permission baseline were present.

Local data counts observed during fixture planning:

| Entity | Count |
| --- | ---: |
| `sys_user` | 20 |
| `sys_role` | 17 |
| `sys_permission` | 708 |
| `biz_park_tenant` | 10 |
| `biz_safety_hazard` | 12 |
| `biz_safety_inspect_task` | 7 |
| `biz_safety_emergency_event` | 3 |
| `biz_safety_work_permit` | 0 |

Existing local users are not enough for the full seven-account smoke matrix. Most login-capable existing users are super-admin or regression leftovers, and several regression users have no role binding. Existing safety hazards and emergency events are all linked to the same `biz_park_tenant`, so they are not enough to prove same-park cross-enterprise isolation.

## 4. Existing commands and reusable scripts

The current `package.json` exposes the expected local database and smoke commands:

| Command | Purpose |
| --- | --- |
| `pnpm db:up` | Start local Docker PostgreSQL |
| `pnpm db:migrate` | Execute forward SQL migrations |
| `pnpm db:seed:prod` | Apply production-safe baseline seed when `ALLOW_PRODUCTION_SEED=yes` is set |
| `pnpm db:seed:dev` | Apply development-only seed |
| `pnpm db:bootstrap:admin` | Create or ensure a first admin account |
| `pnpm db:check:init` | Validate initialization baseline |
| `pnpm safety:smoke:access` | Execute phase 2b safety access smoke |

Reusable implementation patterns exist, but there is no current safe command that prepares the complete phase 2b fixture:

- `scripts/bootstrap-admin.sh` and `scripts/verify-api-login-dockerexec.sh` can create or ensure a bootstrap admin only.
- `scripts/e2e/s5a-safety-smoke.mjs` shows a local-test pattern for creating temporary users and roles, but it is a scenario smoke, not a reusable seven-account fixture command.
- `apps/api/src/modules/users` exposes user management APIs that can create users and assign roles when called by an authorized admin, but there is no dedicated command that creates the exact phase 2b permission matrix and enterprise scoped data.
- `scripts/smoke-cleanup.sh` cleans older smoke users by prefix; it does not prepare this fixture.

## 5. Database entities required for fixture

The fixture depends on the following existing database entities. Sensitive columns such as password hashes and encrypted platform secrets must not be printed or copied into documentation.

| Area | Table | Key fields needed by fixture |
| --- | --- | --- |
| Users | `sys_user` | `id`, `tenant_id`, `park_id`, `username`, `display_name`, `password_hash`, `is_enabled`, `status`, `is_deleted`, `remark` |
| Roles | `sys_role` | `id`, `tenant_id`, `park_id`, `code`, `name`, `role_type`, `data_scope`, `is_super`, `is_system`, `is_builtin`, `status`, `is_enabled`, `is_deleted`, `remark` |
| Permissions | `sys_permission` | `id`, `tenant_id`, `park_id`, `code`, `name`, `resource`, `action`, `permission_type`, `api_method`, `api_path`, `frontend_route`, `is_deleted` |
| Role permissions | `rel_role_perm` | `tenant_id`, `park_id`, `role_id`, `permission_id`, `is_deleted`, `remark` |
| User roles | `rel_user_role` | `tenant_id`, `park_id`, `user_id`, `role_id`, `is_deleted`, `remark` |
| User parks | `rel_user_park` | `tenant_id`, `user_id`, `park_id`, `is_default`, `status`, `is_deleted` |
| User orgs | `rel_user_org` | `tenant_id`, `park_id`, `user_id`, `org_id`, `is_primary`, `is_deleted` |
| Tenant | `sys_tenant` | `id`, `tenant_id`, `park_id`, `tenant_code`, `tenant_name`, `status`, `is_deleted` |
| Park | `biz_park` | `id`, `tenant_id`, `park_id`, `park_code`, `park_name`, `status`, `is_deleted` |
| Enterprise | `biz_park_tenant` | `id`, `tenant_id`, `park_id`, `company_name`, `park_tenant_code`, `status`, `is_deleted` |
| Hazard | `biz_safety_hazard` | `id`, `tenant_id`, `park_id`, `hazard_code`, `hazard_title`, `park_tenant_id`, `status`, `overdue_flag`, `is_deleted` |
| Hazard logs | `biz_safety_hazard_status_log` | `hazard_id`, `before_status`, `after_status`, `action`, `operator_id`, `op_time` |
| Inspect tasks | `biz_safety_inspect_task` | `id`, `tenant_id`, `park_id`, `task_code`, `handler_id`, `handler_name`, `status`, `is_deleted` |
| Emergency events | `biz_safety_emergency_event` | `id`, `tenant_id`, `park_id`, `emergency_code`, `park_tenant_id`, `status`, `is_deleted` |
| Work permits | `biz_safety_work_permit` | `id`, `tenant_id`, `park_id`, `permit_code`, `apply_park_tenant_id`, `status`, `is_deleted` |
| Video alerts | `video_alert` | `id`, `tenant_id`, `park_id`, `camera_id`, `alert_code`, `process_status`, `is_deleted` |
| Video cameras | `camera_device` | `id`, `tenant_id`, `park_id`, `camera_code`, `camera_name`, `status`, `is_deleted` |
| Video evidence | `video_evidence` | `id`, `tenant_id`, `park_id`, `camera_id`, `source_type`, `source_id`, `status`, `is_deleted` |
| Video platform | `video_platform_config` | `id`, `tenant_id`, `park_id`, `platform_type`, `platform_name`, `status`, `is_deleted` |
| Migration history | `sys_schema_migration_history` | `filename`, `status`, checksum/timing columns |

The permissions required by phase 2b are already defined in the local database:

| Permission | API path | Frontend route |
| --- | --- | --- |
| `safety_inspect_task:my` | `/api/v1/safety/my-inspect-tasks` | `/safety/my-inspect-tasks` |
| `safety_hazard:read` | `/api/v1/safety/hazards` | `/safety/hazards` |
| `safety_hazard:overdue` | `/api/v1/safety/hazards/overdue` | `/safety/hazards/overdue` |
| `safety_emergency_statistics:read` | `/api/v1/safety/emergency-work-permit-statistics` | `/safety/emergency-dashboard` |
| `safety_work_permit_statistics:read` | `/api/v1/safety/emergency-work-permit-statistics` | `/safety/emergency-dashboard` |

Relevant page/menu permissions are also present:

```text
safety:operations-terminal
safety:my-inspect-tasks
safety:hazards
safety:hazards-overdue
safety:emergency-dashboard
```

Video read permissions are present for dashboard, alerts, cameras, evidence, and platform configs. Video high-risk permissions are also present and must not be granted to non-admin smoke users.

## 6. Seven-account smoke matrix

The existing built-in roles are not clean enough for all smoke accounts. For example, `SAFETY_MANAGER` and `PROPERTY_MANAGER` include high-risk permissions such as hazard close/manage-all or work-permit stop/void, so the full smoke should use dedicated local/test fixture roles with a `SAFETY_SMOKE_` prefix.

### ADMIN

| Item | Plan |
| --- | --- |
| Purpose | Prove admin can see all safety and video security entries and read APIs |
| Minimum role | Existing `SUPER_ADMIN` in local/test only |
| Minimum permissions | Super-admin equivalent full access |
| Must not miss | Safety menus, video security menus, read APIs |
| Data scope | `all` |
| Environment variables | `SAFETY_SMOKE_ADMIN_USERNAME`, `SAFETY_SMOKE_ADMIN_PASSWORD` |
| Verification points | Login, `/auth/me`, full menu list, all allowed read checks return `2xx` |

### NORMAL

| Item | Plan |
| --- | --- |
| Purpose | Prove field/normal user can use the operations terminal through `safety_inspect_task:my` |
| Minimum role | `SAFETY_SMOKE_NORMAL` |
| Minimum permissions | `safety:operations-terminal`, `safety:my-inspect-tasks`, `safety_inspect_task:my` |
| Must not have | `safety_inspect_task:manage_all`, any high-risk safety/video permission |
| Data scope | Park or self-scoped test data; handler should match a test inspect task when possible |
| Environment variables | `SAFETY_SMOKE_NORMAL_USERNAME`, `SAFETY_SMOKE_NORMAL_PASSWORD` |
| Verification points | `/operations/terminal` visible, `safety_inspect_task:my` present, `manage_all` absent, high-risk denylist absent |

### UNAUTHORIZED

| Item | Plan |
| --- | --- |
| Purpose | Prove users without safety/video permissions cannot see or directly access protected entries |
| Minimum role | `SAFETY_SMOKE_UNAUTHORIZED` or a login-only role with no safety/video permissions |
| Minimum permissions | Login context only; no safety or video permissions |
| Must not have | Any `safety:*`, `safety_*`, `video:*`, `video_*`, or high-risk permission |
| Data scope | Park-level binding can exist for login context, but no safety/video role grants |
| Environment variables | `SAFETY_SMOKE_UNAUTHORIZED_USERNAME`, `SAFETY_SMOKE_UNAUTHORIZED_PASSWORD` |
| Verification points | Operations terminal, overdue hazards, emergency dashboard hidden; direct protected APIs return `401` or `403` |

### ENTERPRISE

| Item | Plan |
| --- | --- |
| Purpose | Prove enterprise-side user reads only own safety data |
| Minimum role | `SAFETY_SMOKE_ENTERPRISE` |
| Minimum permissions | `safety:hazards`, `safety_hazard:read` for default scoped endpoint `/safety/hazards?page=1&page_size=5` |
| Must not have | Super-admin, `data_scope=all`, any high-risk safety/video permission |
| Data scope | Enterprise-scoped to one test `biz_park_tenant.id` |
| Environment variables | `SAFETY_SMOKE_ENTERPRISE_USERNAME`, `SAFETY_SMOKE_ENTERPRISE_PASSWORD`, `SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID`, `SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID`, `SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID` |
| Verification points | `/auth/me` is not super-admin, scope is not all, scoped endpoint returns only records with expected tenant, park, and enterprise id |

### OVERDUE_HAZARD

| Item | Plan |
| --- | --- |
| Purpose | Prove `safety_hazard:overdue` is independent from normal hazard read |
| Minimum role | `SAFETY_SMOKE_OVERDUE_HAZARD` |
| Minimum permissions | `safety:hazards-overdue`, `safety_hazard:overdue` |
| Must not have | `safety_hazard:read`, hazard close/delete/manage-all, any high-risk permission |
| Data scope | Park-scoped overdue hazard data |
| Environment variables | `SAFETY_SMOKE_OVERDUE_HAZARD_USERNAME`, `SAFETY_SMOKE_OVERDUE_HAZARD_PASSWORD` |
| Verification points | `/safety/hazards/overdue` visible and API returns `2xx`; `/safety/hazards` hidden and API returns `401` or `403`; detail open must not fail on status logs or dictionary permission absence |

### DUAL_STATISTICS

| Item | Plan |
| --- | --- |
| Purpose | Prove emergency/work-permit dashboard requires both statistics permissions |
| Minimum role | `SAFETY_SMOKE_DUAL_STATISTICS` |
| Minimum permissions | `safety:emergency-dashboard`, `safety_emergency_statistics:read`, `safety_work_permit_statistics:read` |
| Must not have | Emergency or work-permit manage/approve/reject/stop/close/delete permissions, any high-risk permission |
| Data scope | Park-scoped statistics data; work-permit table may be empty if endpoint supports empty `2xx` responses |
| Environment variables | `SAFETY_SMOKE_DUAL_STATISTICS_USERNAME`, `SAFETY_SMOKE_DUAL_STATISTICS_PASSWORD` |
| Verification points | Dashboard visible; `/safety/emergency-work-permit-statistics` returns `2xx`; high-risk denylist absent |

### SINGLE_STATISTICS

| Item | Plan |
| --- | --- |
| Purpose | Prove one statistics permission alone is not enough for the emergency/work-permit dashboard |
| Minimum role | `SAFETY_SMOKE_SINGLE_STATISTICS` |
| Minimum permissions | Exactly one of `safety_emergency_statistics:read` or `safety_work_permit_statistics:read` |
| Must not have | The other statistics permission, `safety:emergency-dashboard`, and any high-risk permission |
| Data scope | Park-scoped login context |
| Environment variables | `SAFETY_SMOKE_SINGLE_STATISTICS_USERNAME`, `SAFETY_SMOKE_SINGLE_STATISTICS_PASSWORD` |
| Verification points | Dashboard hidden; direct statistics API returns `401` or `403`; high-risk denylist absent |

## 7. Enterprise scoped data requirements

The enterprise scope fixture should include at least:

| Data | Requirement |
| --- | --- |
| Tenant | Use a local/test tenant, normally `10000001` |
| Park | Use a local/test park, normally `20000001` |
| In-scope enterprise | A fake local/test `biz_park_tenant` used as `SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID` |
| Enterprise user | Bound to the tenant, park, and in-scope enterprise through the project-supported data-scope mechanism |
| In-scope safety record | At least one `biz_safety_hazard` for the in-scope enterprise |
| Out-of-scope safety record | At least one `biz_safety_hazard` for a different enterprise in the same tenant and park |

The default smoke scoped endpoint is:

```text
/safety/hazards?page=1&page_size=5
```

That endpoint is preferable because local safety hazards already include `tenant_id`, `park_id`, and `park_tenant_id`, which can support tenant, park, and enterprise comparisons. Existing local hazard records are all linked to a single enterprise, so an out-of-scope hazard must be created before a full enterprise boundary test can be trusted.

The full smoke must set:

```text
SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID
```

Every returned scoped endpoint record must expose verifiable tenant, park, and enterprise fields. A response with no records, records without recognizable scope fields, or records without an enterprise boundary field must remain blocked for full phase 2b.

## 8. Recommended fixture preparation approach

The recommended next implementation step is to add a dedicated local/test fixture preparation script. Manual SQL is possible but risky because the role matrix is easy to over-grant, and the enterprise scope proof requires both positive and negative data.

Suggested script:

```text
scripts/e2e/prepare-safety-access-smoke-fixtures.mjs
```

This should be a separate, explicitly approved change. It should not be added during the current documentation-only planning step.

The fixture should create dedicated records with stable prefixes such as:

```text
SAFETY_SMOKE_ADMIN
SAFETY_SMOKE_NORMAL
SAFETY_SMOKE_UNAUTHORIZED
SAFETY_SMOKE_ENTERPRISE
SAFETY_SMOKE_OVERDUE_HAZARD
SAFETY_SMOKE_DUAL_STATISTICS
SAFETY_SMOKE_SINGLE_STATISTICS
```

It should be idempotent and should upsert or safely replace only same-prefix smoke fixture data. It should not alter existing production-safe seed records or built-in role definitions.

## 9. Proposed fixture script contract

### Inputs

Required:

```text
SAFETY_FIXTURE_ENVIRONMENT=local|test|ci
SAFETY_FIXTURE_CONFIRM=prepare-local-safety-smoke
SAFETY_FIXTURE_TENANT_ID
SAFETY_FIXTURE_PARK_ID
```

Database connection should use the project's existing local/test environment variables, for example `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The script must reject production-like hosts, database names, URLs, and environments before opening a database connection.

Optional:

```text
SAFETY_FIXTURE_API_BASE_URL
SAFETY_FIXTURE_OVERWRITE=true
SAFETY_FIXTURE_PRINT_EXPORTS=true
```

### Outputs

The script should print a redacted summary:

```text
Environment:
Tenant:
Park:
Created or updated roles:
Created or updated users:
In-scope enterprise:
Out-of-scope enterprise:
In-scope hazard:
Out-of-scope hazard:
High-risk permissions granted to non-admin users: 0
```

It may print a local-only shell export block for the current operator:

```bash
export SAFETY_SMOKE_ENVIRONMENT=local
export SAFETY_SMOKE_API_BASE_URL="http://127.0.0.1:3001/api/v1"
export SAFETY_SMOKE_ADMIN_USERNAME="..."
export SAFETY_SMOKE_ADMIN_PASSWORD="..."
export SAFETY_SMOKE_NORMAL_USERNAME="..."
export SAFETY_SMOKE_NORMAL_PASSWORD="..."
export SAFETY_SMOKE_UNAUTHORIZED_USERNAME="..."
export SAFETY_SMOKE_UNAUTHORIZED_PASSWORD="..."
export SAFETY_SMOKE_ENTERPRISE_USERNAME="..."
export SAFETY_SMOKE_ENTERPRISE_PASSWORD="..."
export SAFETY_SMOKE_OVERDUE_HAZARD_USERNAME="..."
export SAFETY_SMOKE_OVERDUE_HAZARD_PASSWORD="..."
export SAFETY_SMOKE_DUAL_STATISTICS_USERNAME="..."
export SAFETY_SMOKE_DUAL_STATISTICS_PASSWORD="..."
export SAFETY_SMOKE_SINGLE_STATISTICS_USERNAME="..."
export SAFETY_SMOKE_SINGLE_STATISTICS_PASSWORD="..."
export SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID="..."
export SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID="..."
export SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID="..."
```

Passwords must be generated for local/test only and printed only to the operator's terminal. The script must not write them into repository files.

### Forbidden behavior

The script must not:

- Run when `SAFETY_FIXTURE_ENVIRONMENT` is missing or production-like.
- Connect to production domains, production IPs, production database names, or shared production hosts.
- Modify `database/seeds`, `database/migrations`, application source files, package files, or workflow files.
- Grant high-risk permissions to non-admin smoke roles.
- Grant `safety_hazard:read` to the `OVERDUE_HAZARD` fixture role.
- Grant both statistics permissions to the `SINGLE_STATISTICS` fixture role.
- Enable `SAFETY_SMOKE_ALLOW_PARTIAL_MATRIX=true` or `SAFETY_SMOKE_ALLOW_ENTERPRISE_SCOPE_UNVERIFIED=true`.
- Log password hashes, tokens, encrypted video platform secrets, or raw database credentials.

## 10. Environment variables

The full smoke should run only after the fixture operator exports the complete matrix:

```text
SAFETY_SMOKE_ENVIRONMENT
SAFETY_SMOKE_API_BASE_URL
SAFETY_SMOKE_ADMIN_USERNAME
SAFETY_SMOKE_ADMIN_PASSWORD
SAFETY_SMOKE_NORMAL_USERNAME
SAFETY_SMOKE_NORMAL_PASSWORD
SAFETY_SMOKE_UNAUTHORIZED_USERNAME
SAFETY_SMOKE_UNAUTHORIZED_PASSWORD
SAFETY_SMOKE_ENTERPRISE_USERNAME
SAFETY_SMOKE_ENTERPRISE_PASSWORD
SAFETY_SMOKE_OVERDUE_HAZARD_USERNAME
SAFETY_SMOKE_OVERDUE_HAZARD_PASSWORD
SAFETY_SMOKE_DUAL_STATISTICS_USERNAME
SAFETY_SMOKE_DUAL_STATISTICS_PASSWORD
SAFETY_SMOKE_SINGLE_STATISTICS_USERNAME
SAFETY_SMOKE_SINGLE_STATISTICS_PASSWORD
SAFETY_SMOKE_ENTERPRISE_EXPECTED_TENANT_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_PARK_ID
SAFETY_SMOKE_ENTERPRISE_EXPECTED_ENTERPRISE_ID
```

Optional only when the local API requires explicit scope headers or non-default scoped endpoint:

```text
SAFETY_SMOKE_TENANT_ID
SAFETY_SMOKE_PARK_ID
SAFETY_SMOKE_ENTERPRISE_SCOPED_ENDPOINT
```

## 11. Risks and blocked items

- Current local data does not provide a complete seven-account matrix.
- Existing built-in roles are too broad for the specialized negative smoke users.
- Existing local hazards and emergency events are all tied to one enterprise, so same-park cross-enterprise isolation cannot be proven yet.
- `biz_safety_work_permit` currently has no records; this is acceptable only if the statistics endpoint returns `2xx` with an empty work-permit side.
- The data-scope binding mechanism for enterprise users must be verified against the current API authorization and query filtering behavior before fixture data is considered complete.
- The local database contains dev/regression contamination, so fixture users and data should be isolated with a clear `SAFETY_SMOKE_` prefix and should not rely on ambient regression accounts.

## 12. Next step

Recommended next phase:

1. Confirm whether a dedicated fixture script is acceptable.
2. Add `scripts/e2e/prepare-safety-access-smoke-fixtures.mjs` in a separate implementation branch with the contract above.
3. Run it only against local/test.
4. Export the generated `SAFETY_SMOKE_*` variables in the current shell.
5. Start the local API.
6. Execute `pnpm safety:smoke:access`.
7. Record the redacted result in `docs/release/safety-module-full-open-phase-2-access-smoke-record.md`.
