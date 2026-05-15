# Seeds

Place environment-specific seed scripts here. Do not commit real passwords or production secrets.

## Production-safe Seeds

- `000001_s1_production_core.sql`

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

Before seeding a real environment, replace the `tenant_id` and `park_id` values in each `seed_scope`.

## Smoke Data Cleanup

Local smoke/e2e tests create temporary users, roles, dictionaries, RBAC rules, field policies, attachments, and S2 smoke units. Clean them with:

```bash
pnpm smoke:cleanup
```

The cleanup script uses soft delete where tables support `is_deleted` and defaults to `tenant_id=10000001`, `park_id=20000001`.
