-- Compatibility arbiter required by the historical
-- 000190_admin_issue_runner_repair.sql migration.
--
-- The canonical role identity remains tenant-wide through
-- uq_sys_role_tenant_code_active. This redundant, narrower index exists only
-- so PostgreSQL can infer the historical migration's explicit
-- (tenant_id, park_id, code) partial ON CONFLICT target. It creates no role,
-- permission, user, credential, assignment, or business data.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_role_scope_code_active
  ON sys_role (tenant_id, park_id, code)
  WHERE is_deleted = false;

COMMIT;
