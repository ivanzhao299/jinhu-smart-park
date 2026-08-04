BEGIN;

INSERT INTO sys_tenant(
  tenant_id, park_id, tenant_code, tenant_name, tenant_type,
  status, max_users, max_parks, plan_code, remark
)
VALUES (
  '10000002', '0', 'B2C_R0_SECOND',
  'B2c R0 second qualifying tenant', 'park_operator',
  1, 0, 0, 'GROUP', 'multi-scope R0 fixture'
);

INSERT INTO asset_park(
  tenant_id, park_id, park_code, park_name, status,
  is_deleted, version, remark
)
VALUES
  (
    '10000001', '20000001', 'B2C_R0_GATE',
    'B2c R0 isolated park', 'enabled', false, 1,
    'first qualifying scope'
  ),
  (
    '10000002', '20000002', 'B2C_R0_GATE_2',
    'B2c R0 second park', 'enabled', false, 1,
    'second qualifying scope'
  );

INSERT INTO rel_tenant_module(
  tenant_id, park_id, tenant_code, module_id, status,
  enabled, is_deleted, version, remark
)
SELECT
  '10000002', '20000002', 'B2C_R0_SECOND', module.id,
  'enabled', true, false, 1, 'multi-scope asset assignment'
FROM sys_module module
WHERE module.module_code = 'asset'
  AND module.status = 1
  AND module.is_deleted = false
ORDER BY module.id
LIMIT 1;

CREATE TEMP TABLE b2c_r0_permission_fixture_map(
  source_id uuid PRIMARY KEY,
  fixture_id uuid NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO b2c_r0_permission_fixture_map(source_id, fixture_id)
SELECT permission.id, uuid_generate_v4()
FROM sys_permission permission
WHERE permission.tenant_id = '10000001'
  AND permission.is_enabled = true
  AND permission.status = 'enabled'
  AND permission.is_deleted = false;

INSERT INTO sys_permission(
  id, tenant_id, park_id, code, name, parent_id, resource, action,
  permission_path, perm_path, permission_level, level, sort_no,
  permission_type, perm_type, api_method, api_path, frontend_route,
  component_key, icon, keep_alive, always_show, field_key, data_dimension,
  is_system, is_builtin, is_tenant_custom, visible, is_enabled, status,
  create_by, create_time, update_by, update_time, is_deleted, version, remark
)
SELECT
  fixture.fixture_id, '10000002', '20000002', permission.code,
  permission.name, NULL, permission.resource, permission.action,
  permission.permission_path, permission.perm_path,
  permission.permission_level, permission.level, permission.sort_no,
  permission.permission_type, permission.perm_type, permission.api_method,
  permission.api_path, permission.frontend_route, permission.component_key,
  permission.icon, permission.keep_alive, permission.always_show,
  permission.field_key, permission.data_dimension, permission.is_system,
  permission.is_builtin, permission.is_tenant_custom, permission.visible,
  permission.is_enabled, permission.status, permission.create_by,
  permission.create_time, permission.update_by, permission.update_time,
  false, permission.version,
  'B2c R0 exact production permission subtree fixture'
FROM sys_permission permission
JOIN b2c_r0_permission_fixture_map fixture
  ON fixture.source_id = permission.id;

UPDATE sys_permission target
SET parent_id = parent_fixture.fixture_id
FROM b2c_r0_permission_fixture_map child_fixture
JOIN sys_permission source
  ON source.id = child_fixture.source_id
JOIN b2c_r0_permission_fixture_map parent_fixture
  ON parent_fixture.source_id = source.parent_id
WHERE target.id = child_fixture.fixture_id;

COMMIT;
