# Seeds

Place environment-specific seed scripts here. Do not commit real passwords or production secrets.

## Production-safe Seeds

- `000001_s1_production_core.sql`
- `production/000003_s1_production_asset_bootstrap.sql`

Production execution:

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed
```

Execution scope:

- Initializes `sys_tenant` default tenant: `tenant_id=10000001`, `tenant_code=JH_DEFAULT`, `plan_code=GROUP`.
- Initializes S1/S2 permission points as system built-in permissions, including `parent_id`, `perm_path`, and `level` for the permission tree.
- Initializes SaaS placeholder permission tree nodes for `leasing`、`workorder`、`iot`、`energy`、`robot`、`video`、`bim`、`ai`、`cockpit`.
- Initializes default role templates: `SUPER_ADMIN`, `SYSTEM_ADMIN`, `AUDITOR`, `OPERATIONS_OWNER`, `EXECUTIVE`, `INVEST_MANAGER`, `INVEST_SPECIALIST`.
- Marks `SUPER_ADMIN` as `is_builtin=1`; other default business roles are `is_template=1` and can be copied into tenant custom roles.
- Initializes built-in role-permission relations.
- Initializes data scope rules: `all_parks`, `current_park`, `self_only`, `org_and_children`, and binds default template roles to baseline rules.
- Initializes field policies for mobile, ID card, bank account, amount, contract amount, payment serial, and file URL sensitive fields.
- Initializes default park organization metadata.
- Initializes S2-01 `biz_park` default record: `tenant_id=10000001`, `park_id=20000001`, `park_code=JH`.
- Initializes base dictionaries and dictionary items, including S2-A/S2-B房源用途、出租状态、装修状态字典。
- Initializes S2-B permissions for房源状态流转、导入、导出、资产统计。
- Initializes SaaS modules in `sys_module`: `system`, `asset`, `leasing`, `workorder`, `iot`, `energy`, `robot`, `video`, `bim`, `ai`.
- Initializes SaaS plans in `sys_plan`: `BASIC`, `PROFESSIONAL`, `ENTERPRISE`, `GROUP`.
- Initializes `rel_plan_module` and enables all `GROUP` modules for the default Jinhu tenant in `rel_tenant_module`.
- When当前园区还没有任何有效楼栋 / 楼层 / 房源时，补最小可用的基线资产结构：
  - 楼栋：`A1`、`A3`、`A5`
  - 楼层：`A1-F01`、`A1-F02`、`A3-F01`、`A5-F01`、`A5-F03`
  - 空间 / 房源：`A1-F01-U01`、`A1-F02-U01`、`A3-F01-U01`、`A5-F01-U01`、`A5-F03-U01`
  - 仅在当前园区资产表为空时写入，已有真实资产数据的环境不会覆盖

Production-safe seeds must not create fixed-password users, plaintext passwords, test phone numbers, or test emails.

Compatibility note: `000029_saas_scope_id_unification.sql` aligns historical S1 auth/RBAC scope columns to the SaaS string ID contract. Production and development seeds now use the same default scope: `tenant_id=10000001`, `park_id=20000001`.

## Development-only Seeds

- `000002_dev_only_s1_accounts.sql`

Development execution:

```bash
pnpm db:seed:dev
```

Execution scope:

- Runs `000001_s1_production_core.sql`.
- Creates local S1 smoke-test accounts:
  - `admin` / `Jinhu@123456`
  - `s1_user` / `Jinhu@123456`
- Assigns local roles and permissions for S1 e2e tests.
- Initializes S2-02 development test buildings: `JH-B01`, `JH-B02`, `JH-B03`.
- Initializes S2-03 development test floors: `JH-B01-F01`, `JH-B01-F02`, `JH-B01-F03`, `JH-B02-F01`, `JH-B02-F02`.
- Initializes S2-04 development test units: `JH-B01-F01-R0101`, `JH-B01-F01-R0102`, `JH-B01-F02-R0201`, `JH-B01-F03-R0301`, `JH-B02-F01-R0101`.

Do not run development-only seeds in shared, staging, or production environments.

`scripts/db-seed-dev.sh` now refuses to run when:

- `NODE_ENV=production`
- `APP_ENV=production`
- `APP_ENV=staging`
- `APP_ENV=shared`
- `DISABLE_DEV_SEED=yes`

To override that protection intentionally, you must set:

```bash
ALLOW_DEV_SEED=yes pnpm db:seed:dev
```

## Release Initialization Sequence

Recommended order for a clean release-ready environment:

1. Run migration

```bash
pnpm db:migrate
```

2. Run production seed

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
```

3. Run init baseline check

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
pnpm db:check:init
```

Expected result at this point:

```text
[FAIL] no bootstrap admin found
INIT BASELINE RESULT: FAIL
```

4. Bootstrap the first admin

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
ADMIN_USERNAME=<ADMIN_USERNAME> \
ADMIN_PASSWORD='<STRONG_PASSWORD>' \
ADMIN_NAME='<ADMIN_NAME>' \
ADMIN_EMAIL='<ADMIN_EMAIL>' \
ADMIN_PHONE='<ADMIN_PHONE>' \
ROLE_CODE=SUPER_ADMIN \
pnpm db:bootstrap:admin
```

5. Run init baseline check again

```bash
TENANT_ID=10000001 \
PARK_ID=20000001 \
FILE_STORAGE_LOCAL_ROOT=/var/lib/jinhu/files \
AUTH_SMS_CODE_VISIBLE=false \
AUTH_WECHAT_MOCK_ENABLED=false \
pnpm db:check:init
```

Expected result:

- `PASS`, or
- `WARN` when non-blocking items such as explicit file path settings are still pending

## bootstrap-admin Notes

`bootstrap-admin` only creates the first login-capable administrator. It does not create:

- tenants
- parks
- roles
- permissions
- module authorizations

Main environment variables:

- `ADMIN_USERNAME`, required
- `ADMIN_PASSWORD`, required
- `ADMIN_NAME`, required
- `ADMIN_EMAIL`, optional
- `ADMIN_PHONE`, optional
- `TENANT_ID`, defaults to `10000001`
- `PARK_ID`, defaults to `20000001`
- `ROLE_CODE`, defaults to `SUPER_ADMIN`
- `ALLOW_PASSWORD_RESET`, defaults to `no`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `COMPOSE_FILE`
- `ENV_FILE`
- `BCRYPT_SALT_ROUNDS`

Safety rules:

- never use weak passwords such as `Jinhu@123456`
- the script must not print plaintext passwords
- the script must not print password hashes
- repeated execution must not create duplicate users

## check-init-baseline Return Codes

- `0`: `PASS`
- `0`: `WARN`
- `2`: `FAIL`

When `STRICT=true`:

- `WARN` returns non-zero

## Common Failure Reasons

- migration has not completed
- production seed has not been applied
- bootstrap admin has not been created yet
- target tenant or park baseline does not exist
- target role is missing
- target role has no permission relations
- tenant module authorization baseline is missing
- dev seed contamination was detected
- `FILE_STORAGE_LOCAL_ROOT` is not explicitly set
- auth mock variables are not disabled

## Rollback Guidance

- prefer soft-deleting the bootstrap admin and unbinding its relations
- do not rollback the production seed baseline itself
- take a database backup before seeding shared, staging, or production environments

If the host network cannot reach the database or API ports directly, use the container-internal verification helper:

```bash
sh scripts/verify-api-login-dockerexec.sh
```

It runs the same bootstrap/login validation flow using `docker exec` inside the postgres and API containers.

Before seeding a real environment, replace the `tenant_id` and `park_id` values in each `seed_scope`.

## Smoke Data Cleanup

Local smoke/e2e tests create temporary users, roles, dictionaries, RBAC rules, field policies, attachments, and S2 smoke units. Clean them with:

```bash
pnpm smoke:cleanup
```

The cleanup script uses soft delete where tables support `is_deleted` and defaults to `tenant_id=10000001`, `park_id=20000001`.
