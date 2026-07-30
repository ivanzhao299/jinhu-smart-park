-- Minimal production-safe role templates required before the first historical
-- role-dependent permission grants and later by
-- 000175_2026_responsibility_user_role_queue.sql.
--
-- This prerequisite intentionally creates no users, credentials, permissions,
-- module grants, data-scope links, or business data. The production seed remains
-- authoritative for the complete baseline and may safely normalize these rows.

BEGIN;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
roles(id, code, name, role_type, role_scope, data_scope, sort_no, remark) AS (
  VALUES
    ('00000000-0000-4000-8000-000000002003'::uuid, 'SYSTEM_ADMIN', '系统管理员', 'system', 'platform', 'park', 20, 'Default system administration role template.'),
    ('00000000-0000-4000-8000-000000002004'::uuid, 'AUDITOR', '审计员', 'system', 'platform', 'park', 30, 'Default audit read-only role template.'),
    ('00000000-0000-4000-8000-000000002101'::uuid, 'OPERATIONS_OWNER', '运营负责人', 'park', 'park', 'park', 40, 'Default asset management role template.'),
    ('00000000-0000-4000-8000-000000002102'::uuid, 'EXECUTIVE', '高层', 'tenant', 'tenant', 'park', 50, 'Default asset read-only executive role template.'),
    ('00000000-0000-4000-8000-000000002103'::uuid, 'INVEST_MANAGER', '招商主管', 'park', 'park', 'self', 60, 'Default investment manager role template.'),
    ('00000000-0000-4000-8000-000000002107'::uuid, 'FINANCE_MANAGER', '财务主管', 'park', 'park', 'park', 100, 'Default finance manager role template.'),
    ('00000000-0000-4000-8000-000000002108'::uuid, 'FINANCE_SPECIALIST', '财务专员', 'park', 'park', 'park', 110, 'Default finance specialist role template.')
)
INSERT INTO sys_role (
  id, tenant_id, park_id, code, name, parent_id, role_path, role_level, level,
  sort_no, role_type, role_scope, data_scope, data_scope_config,
  is_template, is_system, is_builtin, is_super, editable, is_editable,
  is_deletable, is_enabled, status, remark
)
SELECT
  roles.id, seed_scope.tenant_id, seed_scope.park_id, roles.code, roles.name,
  NULL, roles.code, 1, 1, roles.sort_no, roles.role_type, roles.role_scope,
  roles.data_scope, '{}'::jsonb,
  true, false, false, false, true, true, true, true, 'enabled', roles.remark
FROM roles
CROSS JOIN seed_scope
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_role existing
  WHERE existing.tenant_id = seed_scope.tenant_id
    AND existing.code = roles.code
    AND existing.is_deleted = false
);

DO $$
DECLARE missing_roles text;
BEGIN
  WITH required(code) AS (
    VALUES
      ('SYSTEM_ADMIN'), ('AUDITOR'), ('OPERATIONS_OWNER'), ('EXECUTIVE'),
      ('INVEST_MANAGER'), ('FINANCE_MANAGER'), ('FINANCE_SPECIALIST')
  )
  SELECT string_agg(required.code, ', ' ORDER BY required.code) INTO missing_roles
  FROM required
  WHERE NOT EXISTS (
    SELECT 1
    FROM sys_role role
    WHERE role.tenant_id = '10000001'
      AND role.code = required.code
      AND role.is_deleted = false
  );

  IF missing_roles IS NOT NULL THEN
    RAISE EXCEPTION 'Missing prerequisite role codes after bootstrap: %', missing_roles;
  END IF;
END $$;

COMMIT;
