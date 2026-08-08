BEGIN;

-- A-2.5 closes the workbench read contracts without changing the historical
-- 000183 migration. Permission definitions remain tenant-wide and use the
-- lowest active park for the owning module as deterministic storage scope.
WITH active_property_modules AS (
  SELECT
    assignment.tenant_id,
    assignment.park_id,
    module.module_code
  FROM rel_tenant_module assignment
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.status = 1
   AND module.is_deleted = false
  WHERE module.module_code IN ('homestay', 'housing_rental')
    AND assignment.enabled = true
    AND assignment.status = 'enabled'
    AND assignment.is_deleted = false
    AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
),
permission_definitions(
  module_code, code, name, resource, action,
  permission_type, perm_type, api_method, api_path, frontend_route,
  sort_no, visible, keep_alive, always_show
) AS (
  VALUES
    -- PROPERTY_WORKBENCH_READ_DEFINITIONS_START
    ('homestay', 'homestay:task:read', '民宿任务读取', 'biz.homestay_task', 'read', 'api', 40, 'GET', '/api/v1/homestay/tasks', '/homestay/tasks', 6915, true, false, false),
    ('homestay', 'homestay:stay:read', '民宿入住读取', 'biz.homestay_stay', 'read', 'api', 40, 'GET', '/api/v1/homestay/stays', '/homestay/stays', 6916, true, false, false),
    ('housing_rental', 'housing:task:read', '住房出租任务读取', 'biz.housing_task', 'read', 'api', 40, 'GET', '/api/v1/housing/tasks', '/housing/tasks', 7018, true, false, false),
    ('housing_rental', 'housing:tenant:read', '住房租客读取', 'biz.party', 'read', 'api', 40, 'GET', '/api/v1/housing/tenants', '/housing/tenants', 7019, true, false, false),
    ('housing_rental', 'housing:handover:read', '住房交割读取', 'biz.housing_handover', 'read', 'api', 40, 'GET', '/api/v1/housing/handovers', '/housing/handovers', 7020, true, false, false),
    ('housing_rental', 'housing:billing:read', '住房账单读取', 'biz.housing_billing', 'read', 'api', 40, 'GET', '/api/v1/housing/billing', '/housing/billing', 7021, true, false, false),
    ('housing_rental', 'housing:repair:read', '住房报修读取', 'biz.housing_repair', 'read', 'api', 40, 'GET', '/api/v1/housing/repairs', '/housing/repairs', 7022, true, false, false)
    -- PROPERTY_WORKBENCH_READ_DEFINITIONS_END
),
scoped_definitions AS (
  SELECT DISTINCT ON (active.tenant_id, definition.code)
    active.tenant_id,
    active.park_id,
    definition.*
  FROM active_property_modules active
  JOIN permission_definitions definition
    ON definition.module_code = active.module_code
  ORDER BY active.tenant_id, definition.code, active.park_id
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
  uuid_generate_v4(), scoped.tenant_id, scoped.park_id,
  scoped.code, scoped.name, NULL, scoped.resource, scoped.action,
  scoped.code, scoped.code, 3, 3, scoped.sort_no,
  scoped.permission_type, scoped.perm_type,
  scoped.api_method, scoped.api_path, scoped.frontend_route,
  NULL, NULL, NULL, NULL,
  true, true, false, scoped.visible, scoped.keep_alive, scoped.always_show,
  true, 'enabled', now(), now(), false, 1,
  'PR192 A-2.5 property workbench read permission'
FROM scoped_definitions scoped
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE
SET park_id = EXCLUDED.park_id,
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_path = EXCLUDED.permission_path,
    perm_path = EXCLUDED.perm_path,
    permission_level = EXCLUDED.permission_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    api_method = EXCLUDED.api_method,
    api_path = EXCLUDED.api_path,
    frontend_route = EXCLUDED.frontend_route,
    component_key = EXCLUDED.component_key,
    icon = EXCLUDED.icon,
    field_key = EXCLUDED.field_key,
    data_dimension = EXCLUDED.data_dimension,
    is_system = EXCLUDED.is_system,
    is_builtin = EXCLUDED.is_builtin,
    is_tenant_custom = EXCLUDED.is_tenant_custom,
    visible = EXCLUDED.visible,
    keep_alive = EXCLUDED.keep_alive,
    always_show = EXCLUDED.always_show,
    is_enabled = EXCLUDED.is_enabled,
    status = EXCLUDED.status,
    is_deleted = EXCLUDED.is_deleted,
    remark = EXCLUDED.remark,
    update_time = now()
WHERE ROW(
  sys_permission.park_id, sys_permission.name, sys_permission.parent_id,
  sys_permission.resource, sys_permission.action, sys_permission.permission_path,
  sys_permission.perm_path, sys_permission.permission_level, sys_permission.level,
  sys_permission.sort_no, sys_permission.permission_type, sys_permission.perm_type,
  sys_permission.api_method, sys_permission.api_path, sys_permission.frontend_route,
  sys_permission.component_key, sys_permission.icon, sys_permission.field_key,
  sys_permission.data_dimension, sys_permission.is_system, sys_permission.is_builtin,
  sys_permission.is_tenant_custom, sys_permission.visible, sys_permission.keep_alive,
  sys_permission.always_show, sys_permission.is_enabled, sys_permission.status,
  sys_permission.is_deleted, sys_permission.remark
) IS DISTINCT FROM ROW(
  EXCLUDED.park_id, EXCLUDED.name, EXCLUDED.parent_id,
  EXCLUDED.resource, EXCLUDED.action, EXCLUDED.permission_path,
  EXCLUDED.perm_path, EXCLUDED.permission_level, EXCLUDED.level,
  EXCLUDED.sort_no, EXCLUDED.permission_type, EXCLUDED.perm_type,
  EXCLUDED.api_method, EXCLUDED.api_path, EXCLUDED.frontend_route,
  EXCLUDED.component_key, EXCLUDED.icon, EXCLUDED.field_key,
  EXCLUDED.data_dimension, EXCLUDED.is_system, EXCLUDED.is_builtin,
  EXCLUDED.is_tenant_custom, EXCLUDED.visible, EXCLUDED.keep_alive,
  EXCLUDED.always_show, EXCLUDED.is_enabled, EXCLUDED.status,
  EXCLUDED.is_deleted, EXCLUDED.remark
);

-- The canonical Party target is an independent hidden asset page. It is not a
-- property-business permission or bundle member, and it receives no automatic
-- role grant. Missing/disabled/expired asset module assignment or a missing
-- active asset parent fails closed by producing no definition.
WITH active_asset_modules AS (
  SELECT
    assignment.tenant_id,
    assignment.park_id
  FROM rel_tenant_module assignment
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.module_code = 'asset'
   AND module.status = 1
   AND module.is_deleted = false
  WHERE assignment.enabled = true
    AND assignment.status = 'enabled'
    AND assignment.is_deleted = false
    AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
),
scoped_party_page AS (
  SELECT DISTINCT ON (active.tenant_id)
    active.tenant_id,
    active.park_id,
    parent.id AS parent_id
  FROM active_asset_modules active
  JOIN sys_permission parent
    ON parent.tenant_id = active.tenant_id
   AND parent.code = 'asset'
   AND parent.is_deleted = false
   AND parent.is_enabled = true
   AND parent.status = 'enabled'
  ORDER BY active.tenant_id, active.park_id
),
party_page_definition(
  code, name, resource, action, permission_type, perm_type,
  frontend_route, sort_no, visible, keep_alive, always_show
) AS (
  VALUES
    -- ASSET_PARTY_PAGE_DEFINITION_START
    ('asset:party', '业务相对方页面', 'asset.party', 'page', 'page', 20, '/assets/parties', 65, false, false, false)
    -- ASSET_PARTY_PAGE_DEFINITION_END
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
  uuid_generate_v4(), scoped.tenant_id, scoped.park_id,
  definition.code, definition.name, scoped.parent_id,
  definition.resource, definition.action,
  'asset/' || definition.code, 'asset/' || definition.code,
  2, 2, definition.sort_no,
  definition.permission_type, definition.perm_type,
  NULL, NULL, definition.frontend_route,
  NULL, NULL, NULL, NULL,
  true, true, false,
  definition.visible, definition.keep_alive, definition.always_show,
  true, 'enabled', now(), now(), false, 1,
  'PR192 A-2.5 hidden Party workbench target'
FROM scoped_party_page scoped
CROSS JOIN party_page_definition definition
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE
SET park_id = EXCLUDED.park_id,
    name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action,
    permission_path = EXCLUDED.permission_path,
    perm_path = EXCLUDED.perm_path,
    permission_level = EXCLUDED.permission_level,
    level = EXCLUDED.level,
    sort_no = EXCLUDED.sort_no,
    permission_type = EXCLUDED.permission_type,
    perm_type = EXCLUDED.perm_type,
    api_method = EXCLUDED.api_method,
    api_path = EXCLUDED.api_path,
    frontend_route = EXCLUDED.frontend_route,
    component_key = EXCLUDED.component_key,
    icon = EXCLUDED.icon,
    field_key = EXCLUDED.field_key,
    data_dimension = EXCLUDED.data_dimension,
    is_system = EXCLUDED.is_system,
    is_builtin = EXCLUDED.is_builtin,
    is_tenant_custom = EXCLUDED.is_tenant_custom,
    visible = EXCLUDED.visible,
    keep_alive = EXCLUDED.keep_alive,
    always_show = EXCLUDED.always_show,
    is_enabled = EXCLUDED.is_enabled,
    status = EXCLUDED.status,
    is_deleted = EXCLUDED.is_deleted,
    remark = EXCLUDED.remark,
    update_time = now()
WHERE ROW(
  sys_permission.park_id, sys_permission.name, sys_permission.parent_id,
  sys_permission.resource, sys_permission.action, sys_permission.permission_path,
  sys_permission.perm_path, sys_permission.permission_level, sys_permission.level,
  sys_permission.sort_no, sys_permission.permission_type, sys_permission.perm_type,
  sys_permission.api_method, sys_permission.api_path, sys_permission.frontend_route,
  sys_permission.component_key, sys_permission.icon, sys_permission.field_key,
  sys_permission.data_dimension, sys_permission.is_system, sys_permission.is_builtin,
  sys_permission.is_tenant_custom, sys_permission.visible, sys_permission.keep_alive,
  sys_permission.always_show, sys_permission.is_enabled, sys_permission.status,
  sys_permission.is_deleted, sys_permission.remark
) IS DISTINCT FROM ROW(
  EXCLUDED.park_id, EXCLUDED.name, EXCLUDED.parent_id,
  EXCLUDED.resource, EXCLUDED.action, EXCLUDED.permission_path,
  EXCLUDED.perm_path, EXCLUDED.permission_level, EXCLUDED.level,
  EXCLUDED.sort_no, EXCLUDED.permission_type, EXCLUDED.perm_type,
  EXCLUDED.api_method, EXCLUDED.api_path, EXCLUDED.frontend_route,
  EXCLUDED.component_key, EXCLUDED.icon, EXCLUDED.field_key,
  EXCLUDED.data_dimension, EXCLUDED.is_system, EXCLUDED.is_builtin,
  EXCLUDED.is_tenant_custom, EXCLUDED.visible, EXCLUDED.keep_alive,
  EXCLUDED.always_show, EXCLUDED.is_enabled, EXCLUDED.status,
  EXCLUDED.is_deleted, EXCLUDED.remark
);

-- Only the new read members of the frozen 14-bundle contract are materialized.
-- Built-in roles are enumerated literally; custom, legacy and wildcard grants
-- are never inferred from permission prefixes.
WITH active_property_modules AS (
  SELECT
    assignment.tenant_id,
    assignment.park_id,
    module.module_code
  FROM rel_tenant_module assignment
  JOIN sys_module module
    ON module.id = assignment.module_id
   AND module.status = 1
   AND module.is_deleted = false
  WHERE module.module_code IN ('homestay', 'housing_rental')
    AND assignment.enabled = true
    AND assignment.status = 'enabled'
    AND assignment.is_deleted = false
    AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
),
bundle_permissions(bundle_code, permission_code) AS (
  VALUES
    -- PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_START
    ('property-bundle:homestay-overview', 'homestay:task:read'),
    ('property-bundle:homestay-stays', 'homestay:stay:read'),
    ('property-bundle:housing-overview', 'housing:task:read'),
    ('property-bundle:housing-tenants', 'housing:tenant:read'),
    ('property-bundle:housing-handovers', 'housing:handover:read'),
    ('property-bundle:housing-billing', 'housing:billing:read'),
    ('property-bundle:housing-repairs', 'housing:repair:read')
    -- PROPERTY_WORKBENCH_READ_BUNDLE_PERMISSIONS_END
),
role_bundles(role_code, module_code, bundle_code) AS (
  VALUES
    -- PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_START
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-overview'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-stays'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-overview'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-tenants'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-handovers'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-billing'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-repairs'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-overview'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-stays'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-overview'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-tenants'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-handovers'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-billing'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-repairs'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-overview'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-stays'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-overview'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-tenants'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-handovers'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-billing'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-repairs'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-overview'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-stays'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-overview'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-tenants'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-handovers'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-repairs'),
    ('FINANCE_MANAGER', 'housing_rental', 'property-bundle:housing-billing'),
    ('AUDITOR', 'homestay', 'property-bundle:homestay-overview'),
    ('AUDITOR', 'housing_rental', 'property-bundle:housing-overview')
    -- PROPERTY_WORKBENCH_READ_ROLE_BUNDLES_END
),
resolved_role_bundles AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    role_bundle.bundle_code
  FROM role_bundles role_bundle
  JOIN sys_role role
    ON role.code = role_bundle.role_code
   AND role.is_deleted = false
   AND role.is_enabled = true
   AND role.status = 'enabled'
  JOIN active_property_modules active
    ON active.tenant_id = role.tenant_id
   AND active.park_id = role.park_id
   AND active.module_code = role_bundle.module_code
),
resolved_grants AS (
  SELECT DISTINCT
    resolved.tenant_id,
    resolved.park_id,
    resolved.role_id,
    permission.id AS permission_id
  FROM resolved_role_bundles resolved
  JOIN bundle_permissions bundle
    ON bundle.bundle_code = resolved.bundle_code
  JOIN sys_permission permission
    ON permission.tenant_id = resolved.tenant_id
   AND permission.code = bundle.permission_code
   AND permission.is_deleted = false
   AND permission.is_enabled = true
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  resolved.tenant_id, resolved.park_id, resolved.role_id, resolved.permission_id,
  now(), now(), false, 1, 'PR192 A-2.5 explicit property bundle grant'
FROM resolved_grants resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id)
  WHERE is_deleted = false
DO NOTHING;

COMMIT;
