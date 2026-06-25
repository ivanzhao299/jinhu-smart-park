# Smart Park Phase 1 Productization Execution Plan

## Scope

Phase 1 focuses on turning the existing safety and operations baseline into a production-verifiable operating loop:

1. Safety Gate-2 validates hazard assignment, rectification evidence, recheck, closure, and audit logs through the real API.
2. The real park role pack adds daily operating roles for park management, customer service, security, safety inspection, IoT operations, and tenant users.
3. The next UI/UX pass will prioritize high-frequency safety, work order, tenant, and operations screens after the production Gate-2 result is known.

## Implemented In This Batch

- `database/migrations/000147_role_pack_real_park_operations.sql`
  - Normalizes `sys_file.tenant_id` and `sys_file.park_id` to `varchar(64)`.
  - Adds role templates:
    - 园区总经理
    - 园区运营专员
    - 客服专员
    - 安保主管
    - 安保巡检员
    - 安全巡检员
    - 设备物联管理员
    - 租户管理员
    - 租户员工
  - Grants production-operating permissions using existing permission codes only.
- `scripts/production-safety-hazard-gate2.sh`
  - Creates a controlled production hazard through API.
  - Assigns rectification to an enabled production user.
  - Inserts controlled file metadata as rectification evidence.
  - Submits rectification through API.
  - Rechecks and closes the hazard through API.
  - Verifies status logs and action logs.
- `.github/workflows/production-safety-hazard-gate.yml`
  - Runs Gate-2 on the production host and uploads evidence artifacts.

## Safety Boundaries

- No direct business status mutation bypasses the application API.
- Gate data is clearly marked with the `gate2-safety-hazard-*` run id.
- The production script uses a temporary controlled file metadata row only for rectification evidence.
- No production secrets are written to the repository.
- Database migrations are limited to role/template permission readiness and `sys_file` type compatibility.

## Validation Plan

1. Run local checks:
   - `pnpm typecheck`
   - `pnpm lint`
   - `sh -n scripts/production-safety-hazard-gate2.sh`
   - `git diff --check`
2. Deploy API/migrations using the production deploy workflow.
3. Run Production Safety Hazard Gate-2.
4. Commit the Gate-2 evidence report only after the production workflow passes.

## Next Batch

After Gate-2 passes:

1. Production Gate-3: work order lifecycle from create to assign, accept, start, finish, confirm, evaluate, and close.
2. UI/UX Sprint-1: inspection task execution, hazard rectification drawer, work order creation, and tenant 360 surfaces.
3. RBAC Sprint-2: verify role visibility in the admin UI and add user assignment evidence.
