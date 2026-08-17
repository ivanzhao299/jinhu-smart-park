# Production Seeds

Production seeds must never create fixed-password accounts or demo business data.

Run them explicitly with:

```bash
ALLOW_PRODUCTION_SEED=yes pnpm db:seed:prod
```

Current production-safe seed files:

- `../000001_s1_production_core.sql`
- `000003_s1_production_asset_bootstrap.sql`
- `000004_core_role_permission_repair.sql`
- `000005_admin_issue_runner_baseline.sql`
- `000006_property_track_b_permission_reconcile.sql`
- `000007_asset_park_scope_reconcile.sql`
- `000008_property_runtime_control_scope_reconcile.sql`
- `000009_jh_leasing_lead_workorder_create_repair.sql`
- `000010_jh_engineering_project_manager_rbac_reconcile.sql`
- `000011_apartment_management_rbac.sql`
- `000012_wu_enguo_atomic_rbac.sql`
- `000013_apartment_document_defaults.sql`
- `000014_responsibility_system_admin_reconcile.sql`
- `000015_property_role_template_reconcile.sql`
- `000016_tenant_scope_dictionary_reconcile.sql`

This seed initializes:

- Default `sys_tenant`: `tenant_id=10000001`, `tenant_code=JH_DEFAULT`, `plan_code=GROUP`
- S1/S2 permissions as system built-in permission tree rows with `parent_id`, `perm_path`, and `level`
- SaaS placeholder permissions for module menus such as IoT, energy, robot, video, BIM, AI, workorder, leasing, and cockpit
- Built-in/template roles and role-permission bindings
- Data scope rules: `all_parks`, `current_park`, `self_only`, `org_and_children`
- Field policies for mobile, ID card, bank account, amount, contract amount, payment serial, and file URL fields
- `sys_module`, `sys_plan`, `rel_plan_module`, and `rel_tenant_module`
- Default organization metadata, dictionaries, and the S2-01 default `biz_park` record
- A missing default-scope `asset_park` projection, using same-scope canonical data first and the globally unique active `JH` legacy-scope baseline only as a bounded fallback
- Missing runtime controls for an asset scope created after migrations, initialized through the audited disabled v1 -> v2 -> v3 contract transition; partial or drifting states fail closed
- The reviewed leasing-lead role aliases `INVEST_MANAGER` and `JH_LEASING_LEAD` receive the least-privilege `workorder:create` grant required by protected go-live UAT; an absent optional alias remains a safe no-op
- The reviewed engineering project manager role is created when absent, converged to its explicit engineering permission set, and assigned exclusively to `shao_minghong` in place of the two documented broad legacy roles

It does not create fixed-password users or S2 demo房源数据.
The Admin Issue Runner seed provisions a disabled `studio_runner` machine identity with a non-login sentinel hash,
its tenant-wide role, minimum Runner permission, and park binding. Only the protected activation workflow may make
that account login-capable.

Compatibility note: S1-RBAC-STD-FIX unifies `tenant_id` and `park_id` scope columns as string SaaS isolation IDs. Production and development seeds use the default Jinhu scope `tenant_id=10000001` and `park_id=20000001`; UUID values remain only for primary keys such as `id`.

The development account seed `../000002_dev_only_s1_accounts.sql` is intentionally excluded.

The Track B reconciliation seed runs after the default tenant, park, module assignment,
asset parent permission, and built-in roles exist. It inserts the 25 frozen Track B
permission definitions only when absent, fails closed on definition drift, and grants
those permissions only to the default scope's built-in `SUPER_ADMIN`. It does not
create users, business demo data, module assignments, bundles, or grants for other roles.
