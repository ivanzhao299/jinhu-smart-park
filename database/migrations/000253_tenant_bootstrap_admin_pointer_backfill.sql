BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Forward-only production repair. The migration runner records the checksum,
-- executor, batch, and result; take the normal production backup before deploy.
-- Lock all participating tables so the preflight and deterministic selection
-- observe one stable relationship graph while an older API may still be live.
SELECT pg_advisory_xact_lock(hashtextextended('tenant-bootstrap-admin-pointer-backfill-v1', 0));
LOCK TABLE sys_tenant, sys_user, sys_role, rel_user_role IN SHARE ROW EXCLUSIVE MODE;

-- Fail closed only for structurally corrupt active TENANT_ADMIN bindings in the
-- pointer-less tenant population. TENANT_ADMIN is tenant-wide, so a valid
-- target-park binding may intentionally use a different park_id from the role row.
-- Multiple valid administrators are resolved deterministically below; tenants
-- with no candidate remain NULL.
DO $preflight$
DECLARE
  invalid_binding_count integer;
BEGIN
  SELECT count(*)
  INTO invalid_binding_count
  FROM rel_user_role link
  JOIN sys_user target_user
    ON target_user.id = link.user_id
  JOIN sys_role target_role
    ON target_role.id = link.role_id
   AND target_role.code = 'TENANT_ADMIN'
   AND target_role.role_scope = 'tenant'
  JOIN sys_tenant tenant
    ON tenant.tenant_id = target_user.tenant_id
   AND tenant.is_deleted = false
   AND tenant.contact_user_id IS NULL
  WHERE link.is_deleted = false
    AND (
      link.tenant_id <> target_user.tenant_id
      OR link.tenant_id <> target_role.tenant_id
    );

  IF invalid_binding_count > 0 THEN
    RAISE EXCEPTION
      'tenant-bootstrap-admin-pointer-preflight: % active TENANT_ADMIN bindings have inconsistent tenant scope',
      invalid_binding_count;
  END IF;
END
$preflight$;

CREATE TEMP TABLE tenant_bootstrap_admin_pointer_candidates ON COMMIT DROP AS
WITH eligible_users AS (
  SELECT DISTINCT
    tenant.id AS tenant_row_id,
    target_user.id AS user_id,
    target_user.create_time
  FROM sys_tenant tenant
  JOIN sys_user target_user
    ON target_user.tenant_id = tenant.tenant_id
   AND target_user.is_deleted = false
   AND target_user.is_enabled = true
   AND target_user.status = 'enabled'
  JOIN rel_user_role link
    ON link.user_id = target_user.id
   AND link.tenant_id = target_user.tenant_id
   AND link.is_deleted = false
  JOIN sys_role target_role
    ON target_role.id = link.role_id
   AND target_role.tenant_id = link.tenant_id
   AND target_role.code = 'TENANT_ADMIN'
   AND target_role.role_scope = 'tenant'
   AND target_role.is_deleted = false
   AND target_role.is_enabled = true
   AND target_role.status = 'enabled'
  WHERE tenant.is_deleted = false
    AND tenant.contact_user_id IS NULL
),
ranked AS (
  SELECT
    tenant_row_id,
    user_id,
    row_number() OVER (
      PARTITION BY tenant_row_id
      ORDER BY create_time ASC, user_id ASC
    ) AS candidate_rank
  FROM eligible_users
)
SELECT tenant_row_id, user_id
FROM ranked
WHERE candidate_rank = 1;

UPDATE sys_tenant tenant
SET contact_user_id = candidate.user_id,
    update_time = now(),
    version = tenant.version + 1
FROM tenant_bootstrap_admin_pointer_candidates candidate
WHERE tenant.id = candidate.tenant_row_id
  AND tenant.is_deleted = false
  AND tenant.contact_user_id IS NULL;

-- The affected-row count is retained in deployment logs by the migration runner.
-- Zero-candidate tenants intentionally remain NULL, so the identity contract is
-- disabled for them until an explicit authoritative pointer is assigned.
DO $audit$
DECLARE
  remaining_without_pointer integer;
BEGIN
  SELECT count(*)
  INTO remaining_without_pointer
  FROM sys_tenant
  WHERE is_deleted = false
    AND contact_user_id IS NULL;

  RAISE NOTICE
    'tenant-bootstrap-admin-pointer-backfill: % active tenants remain without an authoritative pointer',
    remaining_without_pointer;
END
$audit$;

COMMIT;
