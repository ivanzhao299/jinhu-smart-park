BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  invalid_tenant_count integer;
BEGIN
  WITH eligible_tenant AS (
    SELECT DISTINCT permission.tenant_id
    FROM sys_permission permission
    WHERE permission.code = 'asset'
      AND permission.is_enabled = true
      AND permission.status = 'enabled'
      AND permission.is_deleted = false
    UNION
    SELECT DISTINCT assignment.tenant_id
    FROM rel_tenant_module assignment
    JOIN sys_module module
      ON module.id = assignment.module_id
     AND module.module_code = 'asset'
     AND module.status = 1
     AND module.is_deleted = false
    WHERE assignment.enabled = true
      AND assignment.status = 'enabled'
      AND assignment.is_deleted = false
  ), parent_counts AS (
    SELECT eligible.tenant_id, count(parent.id) AS parent_count
    FROM eligible_tenant eligible
    LEFT JOIN sys_permission parent
      ON parent.tenant_id = eligible.tenant_id
     AND parent.code = 'asset'
     AND parent.is_enabled = true
     AND parent.status = 'enabled'
     AND parent.is_deleted = false
    GROUP BY eligible.tenant_id
  )
  SELECT count(*) INTO invalid_tenant_count
  FROM parent_counts
  WHERE parent_count <> 1;

  IF invalid_tenant_count <> 0 THEN
    RAISE EXCEPTION 'party-identity-reveal-asset-parent-preflight-failed: tenant_count=%',
      invalid_tenant_count
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Add the reveal atom once per tenant. The API permission is tenant-wide and
-- deliberately has no parent, matching the production seed reconciliation.
WITH tenant_parent AS (
  SELECT DISTINCT ON (permission.tenant_id)
    permission.tenant_id,
    permission.park_id,
    permission.id AS parent_id
  FROM sys_permission permission
  WHERE permission.code = 'asset'
    AND permission.is_enabled = true
    AND permission.status = 'enabled'
    AND permission.is_deleted = false
  ORDER BY permission.tenant_id, permission.park_id, permission.id
)
INSERT INTO sys_permission (
  id, tenant_id, park_id, code, name, parent_id, resource, action,
  permission_path, perm_path, permission_level, level, sort_no,
  permission_type, perm_type, api_method, api_path, frontend_route,
  component_key, icon, field_key, data_dimension,
  is_system, is_builtin, is_tenant_custom, visible, keep_alive, always_show,
  is_enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  uuid_generate_v4(), parent.tenant_id, parent.park_id,
  'party:identity_reveal', '身份明文受控查看', NULL,
  'biz.party_identity', 'reveal', 'party:identity_reveal', 'party:identity_reveal',
  3, 3, 8100, 'api', 40, 'POST',
  '/api/v1/property/parties/:partyId/identity-reveal', '/assets/parties',
  NULL, NULL, NULL, NULL,
  true, true, false, false, false, false,
  true, 'enabled', clock_timestamp(), clock_timestamp(), false, 1,
  'PR192 Track B frozen permission definition'
FROM tenant_parent parent
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO NOTHING;

DO $$
DECLARE
  drift_count integer;
BEGIN
  SELECT count(*) INTO drift_count
  FROM sys_permission permission
  WHERE permission.code = 'party:identity_reveal'
    AND permission.is_deleted = false
    AND (
      permission.resource IS DISTINCT FROM 'biz.party_identity'
      OR permission.parent_id IS NOT NULL
      OR permission.action IS DISTINCT FROM 'reveal'
      OR permission.permission_type IS DISTINCT FROM 'api'
      OR permission.perm_type IS DISTINCT FROM 40
      OR permission.api_method IS DISTINCT FROM 'POST'
      OR permission.api_path IS DISTINCT FROM '/api/v1/property/parties/:partyId/identity-reveal'
      OR permission.is_enabled IS DISTINCT FROM true
      OR permission.status IS DISTINCT FROM 'enabled'
      OR permission.remark IS DISTINCT FROM 'PR192 Track B frozen permission definition'
    );
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'party-identity-reveal-permission-definition-drift'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Existing built-in super roles retain wildcard-equivalent explicit catalog coverage.
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  role.tenant_id, role.park_id, role.id, permission.id,
  clock_timestamp(), clock_timestamp(), false, 1,
  'IDY-F04 controlled plaintext reveal grant'
FROM sys_role role
JOIN sys_permission permission
  ON permission.tenant_id = role.tenant_id
 AND permission.code = 'party:identity_reveal'
 AND permission.is_enabled = true
 AND permission.status = 'enabled'
 AND permission.is_deleted = false
WHERE role.is_super = true
  AND role.is_system = true
  AND role.is_builtin = true
  AND role.is_enabled = true
  AND role.status = 'enabled'
  AND role.is_deleted = false
  AND NOT EXISTS (
    SELECT 1 FROM rel_role_perm existing
    WHERE existing.tenant_id = role.tenant_id
      AND existing.park_id = role.park_id
      AND existing.role_id = role.id
      AND existing.permission_id = permission.id
      AND existing.is_deleted = false
  );

COMMIT;
