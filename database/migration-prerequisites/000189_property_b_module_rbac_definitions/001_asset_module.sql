-- Minimal production-safe catalog dependency required by
-- 000189_property_b_module_rbac_definitions.sql.
--
-- This prerequisite intentionally creates no tenant assignment, plan grant,
-- permission, role, user, credential, registry, or business data. The
-- production seed remains authoritative for the complete asset module baseline.

BEGIN;

INSERT INTO sys_module (
  module_code,
  module_name,
  module_group,
  description,
  route_prefix,
  icon,
  status,
  sort_no,
  remark
)
VALUES (
  'asset',
  '资产管理',
  'business',
  '园区、楼栋、楼层、房源、资产统计与状态看板',
  '/assets',
  'building-2',
  1,
  20,
  'Minimal asset module prerequisite for migration 000189'
)
ON CONFLICT (module_code) WHERE is_deleted = false
DO UPDATE SET status = 1;

DO $$
DECLARE active_asset_count integer;
BEGIN
  SELECT count(*) INTO active_asset_count
  FROM sys_module
  WHERE module_code = 'asset'
    AND status = 1
    AND is_deleted = false;

  IF active_asset_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active asset module after prerequisite, found %',
      active_asset_count;
  END IF;
END $$;

COMMIT;
