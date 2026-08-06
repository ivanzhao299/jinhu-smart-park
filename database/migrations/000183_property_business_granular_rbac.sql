BEGIN;

-- Track A materializes the shared property-business contract for every tenant
-- with an active property module. Permission definitions are tenant-wide; the
-- lowest active park is only their deterministic storage scope.
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
  module_code, code, name, parent_code, resource, action,
  permission_type, perm_type, api_method, api_path, frontend_route,
  sort_no, visible, keep_alive, always_show
) AS (
  VALUES
    -- PROPERTY_PERMISSION_DEFINITIONS_START
    ('homestay', 'homestay', '民宿管理', NULL, 'homestay', 'menu', 'menu', 10, NULL, NULL, NULL, 69, true, true, true),
    ('homestay', 'homestay:operations', '民宿运营（兼容入口）', 'homestay', 'homestay.operations', 'page', 'page', 20, NULL, NULL, '/homestay', 699, false, false, false),
    ('housing_rental', 'housing_rental', '住房出租', NULL, 'housing_rental', 'menu', 'menu', 10, NULL, NULL, NULL, 70, true, true, true),
    ('housing_rental', 'housing_rental:operations', '住房运营（兼容入口）', 'housing_rental', 'housing_rental.operations', 'page', 'page', 20, NULL, NULL, '/housing', 710, false, false, false),

    ('homestay', 'homestay:dashboard:page', '民宿运营看板', 'homestay', 'homestay.dashboard', 'page', 'page', 20, NULL, NULL, '/homestay/dashboard', 691, true, true, false),
    ('homestay', 'homestay:tasks:page', '民宿任务', 'homestay', 'homestay.tasks', 'page', 'page', 20, NULL, NULL, '/homestay/tasks', 692, true, true, false),
    ('homestay', 'homestay:availability:page', '民宿房态', 'homestay', 'homestay.availability', 'page', 'page', 20, NULL, NULL, '/homestay/availability', 693, true, true, false),
    ('homestay', 'homestay:rates:page', '民宿价格', 'homestay', 'homestay.rates', 'page', 'page', 20, NULL, NULL, '/homestay/rates', 694, true, true, false),
    ('homestay', 'homestay:bookings:page', '民宿订单', 'homestay', 'homestay.bookings', 'page', 'page', 20, NULL, NULL, '/homestay/bookings', 695, true, true, false),
    ('homestay', 'homestay:stays:page', '民宿入住', 'homestay', 'homestay.stays', 'page', 'page', 20, NULL, NULL, '/homestay/stays', 696, true, true, false),
    ('homestay', 'homestay:turnovers:page', '民宿周转', 'homestay', 'homestay.turnovers', 'page', 'page', 20, NULL, NULL, '/homestay/turnovers', 697, true, true, false),
    ('homestay', 'homestay:finance:page', '民宿财务', 'homestay', 'homestay.finance', 'page', 'page', 20, NULL, NULL, '/homestay/finance', 698, true, true, false),
    ('housing_rental', 'housing:dashboard:page', '住房出租看板', 'housing_rental', 'housing.dashboard', 'page', 'page', 20, NULL, NULL, '/housing/dashboard', 701, true, true, false),
    ('housing_rental', 'housing:tasks:page', '住房出租任务', 'housing_rental', 'housing.tasks', 'page', 'page', 20, NULL, NULL, '/housing/tasks', 702, true, true, false),
    ('housing_rental', 'housing:tenants:page', '住房租客', 'housing_rental', 'housing.tenants', 'page', 'page', 20, NULL, NULL, '/housing/tenants', 703, true, true, false),
    ('housing_rental', 'housing:leases:page', '住房租约', 'housing_rental', 'housing.leases', 'page', 'page', 20, NULL, NULL, '/housing/leases', 704, true, true, false),
    ('housing_rental', 'housing:handovers:page', '住房交割', 'housing_rental', 'housing.handovers', 'page', 'page', 20, NULL, NULL, '/housing/handovers', 705, true, true, false),
    ('housing_rental', 'housing:billing:page', '住房账单', 'housing_rental', 'housing.billing', 'page', 'page', 20, NULL, NULL, '/housing/billing', 706, true, true, false),
    ('housing_rental', 'housing:finance:page', '住房财务', 'housing_rental', 'housing.finance', 'page', 'page', 20, NULL, NULL, '/housing/finance', 707, true, true, false),
    ('housing_rental', 'housing:repairs:page', '住房报修', 'housing_rental', 'housing.repairs', 'page', 'page', 20, NULL, NULL, '/housing/repairs', 708, true, true, false),
    ('housing_rental', 'housing:purchases:page', '住房采购', 'housing_rental', 'housing.purchases', 'page', 'page', 20, NULL, NULL, '/housing/purchases', 709, true, true, false),

    ('property', 'property_operation:read', '房源经营配置读取', NULL, 'biz.property_operation_config', 'read', 'api', 40, 'GET', '/api/v1/property/units/:unitId/operation', '/assets/units', 1320, true, false, false),
    ('property', 'property_operation:update', '房源经营配置修改', NULL, 'biz.property_operation_config', 'update', 'api', 40, 'PUT', '/api/v1/property/units/:unitId/operation', '/assets/units', 1321, true, false, false),
    ('property', 'property_operation:transition_mode', '房源经营模式切换', NULL, 'biz.property_operation_config', 'transition_mode', 'api', 40, 'POST', '/api/v1/property/units/:unitId/mode-transitions', '/assets/units', 1322, true, false, false),
    ('property', 'property_occupancy:read', '房源占用读取', NULL, 'biz.property_occupancy', 'read', 'api', 40, 'GET', '/api/v1/property/occupancies', '/assets/units', 1323, true, false, false),
    ('property', 'property_occupancy:create', '房源占用创建', NULL, 'biz.property_occupancy', 'create', 'api', 40, 'POST', '/api/v1/property/occupancies', '/assets/units', 1324, true, false, false),
    ('property', 'property_occupancy:activate', '房源占用生效', NULL, 'biz.property_occupancy', 'activate', 'api', 40, 'POST', '/api/v1/property/occupancies/:id/activate', '/assets/units', 1325, true, false, false),
    ('property', 'property_occupancy:release', '房源占用释放', NULL, 'biz.property_occupancy', 'release', 'api', 40, 'POST', '/api/v1/property/occupancies/:id/release', '/assets/units', 1326, true, false, false),
    ('property', 'property_occupancy:force_release', '房源占用强制释放', NULL, 'biz.property_occupancy', 'force_release', 'api', 40, 'POST', '/api/v1/property/occupancies/:id/release', '/assets/units', 1327, true, false, false),
    ('property', 'party:read', '业务相对方读取', NULL, 'biz.party', 'read', 'api', 40, 'GET', '/api/v1/property/parties', '/assets/parties', 1328, true, false, false),
    ('property', 'party:create', '业务相对方新增', NULL, 'biz.party', 'create', 'api', 40, 'POST', '/api/v1/property/parties', '/assets/parties', 1329, true, false, false),
    ('property', 'party:update', '业务相对方修改', NULL, 'biz.party', 'update', 'api', 40, 'PUT', '/api/v1/property/parties/:id', '/assets/parties', 1330, true, false, false),
    ('property', 'party:sensitive_read', '业务相对方敏感信息读取', NULL, 'biz.party', 'sensitive_read', 'api', 40, 'GET', '/api/v1/property/parties/:id', '/assets/parties', 1331, true, false, false),
    ('property', 'party_role:manage', '业务相对方角色管理', NULL, 'rel.party_role', 'manage', 'api', 40, 'POST', '/api/v1/property/parties/roles', '/assets/parties', 1332, true, false, false),

    ('homestay', 'homestay:dashboard:read', '民宿运营看板读取', NULL, 'biz.homestay_dashboard', 'read', 'api', 40, 'GET', '/api/v1/homestay/dashboard', '/homestay/dashboard', 6901, true, false, false),
    ('homestay', 'homestay:rate:read', '民宿价格读取', NULL, 'biz.homestay_rate', 'read', 'api', 40, 'GET', '/api/v1/homestay/rates', '/homestay/rates', 6902, true, false, false),
    ('homestay', 'homestay:rate:manage', '民宿价格管理', NULL, 'biz.homestay_rate', 'manage', 'api', 40, 'PUT', '/api/v1/homestay/rates/:unitId', '/homestay/rates', 6903, true, false, false),
    ('homestay', 'homestay:booking:read', '民宿订单读取', NULL, 'biz.homestay_booking', 'read', 'api', 40, 'GET', '/api/v1/homestay/bookings', '/homestay/bookings', 6904, true, false, false),
    ('homestay', 'homestay:booking:create', '民宿订单创建', NULL, 'biz.homestay_booking', 'create', 'api', 40, 'POST', '/api/v1/homestay/bookings', '/homestay/bookings', 6905, true, false, false),
    ('homestay', 'homestay:booking:confirm', '民宿订单确认', NULL, 'biz.homestay_booking', 'confirm', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/confirm', '/homestay/bookings', 6906, true, false, false),
    ('homestay', 'homestay:booking:cancel', '民宿订单取消', NULL, 'biz.homestay_booking', 'cancel', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/cancel', '/homestay/bookings', 6907, true, false, false),
    ('homestay', 'homestay:booking:reschedule', '民宿订单改期', NULL, 'biz.homestay_booking', 'reschedule', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/reschedule', '/homestay/bookings', 6908, true, false, false),
    ('homestay', 'homestay:stay:manage', '民宿入住退房管理', NULL, 'biz.homestay_stay', 'manage', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/check-in', '/homestay/stays', 6909, true, false, false),
    ('homestay', 'homestay:finance:read', '民宿财务读取', NULL, 'biz.homestay_ledger', 'read', 'api', 40, 'GET', '/api/v1/homestay/bookings/:id/ledger', '/homestay/finance', 6910, true, false, false),
    ('homestay', 'homestay:finance:register', '民宿收退款登记', NULL, 'biz.homestay_ledger', 'register', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/ledger', '/homestay/finance', 6911, true, false, false),
    ('homestay', 'homestay:finance:waive', '民宿费用减免', NULL, 'biz.homestay_ledger', 'waive', 'api', 40, 'POST', '/api/v1/homestay/bookings/:id/ledger', '/homestay/finance', 6912, true, false, false),
    ('homestay', 'homestay:turnover:read', '民宿周转任务读取', NULL, 'biz.homestay_turnover', 'read', 'api', 40, 'GET', '/api/v1/homestay/turnovers', '/homestay/turnovers', 6913, true, false, false),
    ('homestay', 'homestay:turnover:execute', '民宿周转任务执行', NULL, 'biz.homestay_turnover', 'execute', 'api', 40, 'POST', '/api/v1/homestay/turnovers/:id/actions/:action', '/homestay/turnovers', 6914, true, false, false),

    ('housing_rental', 'housing:dashboard:read', '住房出租看板读取', NULL, 'biz.housing_dashboard', 'read', 'api', 40, 'GET', '/api/v1/housing/dashboard', '/housing/dashboard', 7001, true, false, false),
    ('housing_rental', 'housing:tenant:manage', '住房租客管理', NULL, 'biz.party', 'manage', 'api', 40, 'POST', '/api/v1/housing/tenants', '/housing/tenants', 7002, true, false, false),
    ('housing_rental', 'housing:lease:read', '住房租约读取', NULL, 'biz.housing_lease', 'read', 'api', 40, 'GET', '/api/v1/housing/leases', '/housing/leases', 7003, true, false, false),
    ('housing_rental', 'housing:lease:create', '住房租约创建', NULL, 'biz.housing_lease', 'create', 'api', 40, 'POST', '/api/v1/housing/leases', '/housing/leases', 7004, true, false, false),
    ('housing_rental', 'housing:lease:approve', '住房租约审批', NULL, 'biz.housing_lease', 'approve', 'api', 40, 'POST', '/api/v1/housing/leases/:id/approve', '/housing/leases', 7005, true, false, false),
    ('housing_rental', 'housing:lease:sign', '住房租约签署登记', NULL, 'biz.housing_lease', 'sign', 'api', 40, 'POST', '/api/v1/housing/leases/:id/sign', '/housing/leases', 7006, true, false, false),
    ('housing_rental', 'housing:lease:activate', '住房租约生效', NULL, 'biz.housing_lease', 'activate', 'api', 40, 'POST', '/api/v1/housing/leases/:id/activate', '/housing/leases', 7007, true, false, false),
    ('housing_rental', 'housing:lease:checkout', '住房退租结算', NULL, 'biz.housing_lease', 'checkout', 'api', 40, 'POST', '/api/v1/housing/leases/:id/checkout', '/housing/leases', 7008, true, false, false),
    ('housing_rental', 'housing:handover:manage', '住房交割管理', NULL, 'biz.housing_handover', 'manage', 'api', 40, 'POST', '/api/v1/housing/leases/:id/handovers', '/housing/handovers', 7009, true, false, false),
    ('housing_rental', 'housing:repair:manage', '住房报修代录', NULL, 'biz.work_order', 'manage', 'api', 40, 'POST', '/api/v1/housing/leases/:id/repairs', '/housing/repairs', 7010, true, false, false),
    ('housing_rental', 'housing:finance:read', '住房财务读取', NULL, 'biz.housing_ledger', 'read', 'api', 40, 'GET', '/api/v1/housing/leases/:id', '/housing/finance', 7011, true, false, false),
    ('housing_rental', 'housing:finance:register', '住房收退款登记', NULL, 'biz.housing_ledger', 'register', 'api', 40, 'POST', '/api/v1/housing/leases/:id/ledger', '/housing/finance', 7012, true, false, false),
    ('housing_rental', 'housing:finance:waive', '住房费用减免', NULL, 'biz.housing_ledger', 'waive', 'api', 40, 'POST', '/api/v1/housing/leases/:id/ledger', '/housing/finance', 7013, true, false, false),
    ('housing_rental', 'housing:billing:generate', '住房周期账单生成', NULL, 'biz.housing_receivable', 'generate', 'api', 40, 'POST', '/api/v1/housing/leases/:id/generate-bills', '/housing/billing', 7014, true, false, false),
    ('housing_rental', 'housing:purchase:read', '住房采购读取', NULL, 'biz.housing_purchase', 'read', 'api', 40, 'GET', '/api/v1/housing/purchases', '/housing/purchases', 7015, true, false, false),
    ('housing_rental', 'housing:purchase:manage', '住房采购管理', NULL, 'biz.housing_purchase', 'manage', 'api', 40, 'POST', '/api/v1/housing/purchases', '/housing/purchases', 7016, true, false, false),
    ('housing_rental', 'housing:purchase:transfer', '住房采购转收费', NULL, 'biz.housing_purchase', 'transfer', 'api', 40, 'POST', '/api/v1/housing/purchases/:id/transfer', '/housing/purchases', 7017, true, false, false)
    -- PROPERTY_PERMISSION_DEFINITIONS_END
),
scoped_definitions AS (
  SELECT DISTINCT ON (active.tenant_id, definition.code)
    active.tenant_id,
    active.park_id,
    definition.*
  FROM active_property_modules active
  JOIN permission_definitions definition
    ON definition.module_code = active.module_code
    OR definition.module_code = 'property'
  ORDER BY active.tenant_id, definition.code, active.park_id
),
resolved_definitions AS (
  SELECT
    scoped.*,
    parent.id AS parent_id,
    CASE
      WHEN scoped.parent_code IS NULL THEN scoped.code
      ELSE scoped.parent_code || '/' || scoped.code
    END AS permission_path,
    CASE scoped.perm_type
      WHEN 10 THEN 1
      WHEN 20 THEN 2
      ELSE 3
    END AS permission_level
  FROM scoped_definitions scoped
  LEFT JOIN sys_permission parent
    ON parent.tenant_id = scoped.tenant_id
   AND parent.code = scoped.parent_code
   AND parent.is_deleted = false
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
  uuid_generate_v4(), resolved.tenant_id, resolved.park_id,
  resolved.code, resolved.name, resolved.parent_id, resolved.resource, resolved.action,
  resolved.permission_path, resolved.permission_path,
  resolved.permission_level, resolved.permission_level, resolved.sort_no,
  resolved.permission_type, resolved.perm_type,
  resolved.api_method, resolved.api_path, resolved.frontend_route,
  NULL, CASE resolved.code WHEN 'homestay' THEN 'hotel' WHEN 'housing_rental' THEN 'house' ELSE NULL END,
  NULL, NULL,
  true, true, false, resolved.visible, resolved.keep_alive, resolved.always_show,
  true, 'enabled', now(), now(), false, 1,
  'PR192 Track A granular property RBAC'
FROM resolved_definitions resolved
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

-- A tenant newly added to the fixture has no 000182 rows at statement start, so
-- repair every page parent after the menu roots have been materialized.
WITH page_parents(child_code, parent_code) AS (
  VALUES
    ('homestay:operations', 'homestay'),
    ('homestay:dashboard:page', 'homestay'),
    ('homestay:tasks:page', 'homestay'),
    ('homestay:availability:page', 'homestay'),
    ('homestay:rates:page', 'homestay'),
    ('homestay:bookings:page', 'homestay'),
    ('homestay:stays:page', 'homestay'),
    ('homestay:turnovers:page', 'homestay'),
    ('homestay:finance:page', 'homestay'),
    ('housing_rental:operations', 'housing_rental'),
    ('housing:dashboard:page', 'housing_rental'),
    ('housing:tasks:page', 'housing_rental'),
    ('housing:tenants:page', 'housing_rental'),
    ('housing:leases:page', 'housing_rental'),
    ('housing:handovers:page', 'housing_rental'),
    ('housing:billing:page', 'housing_rental'),
    ('housing:finance:page', 'housing_rental'),
    ('housing:repairs:page', 'housing_rental'),
    ('housing:purchases:page', 'housing_rental')
)
UPDATE sys_permission child
SET parent_id = parent.id,
    permission_path = parent.code || '/' || child.code,
    perm_path = parent.code || '/' || child.code,
    update_time = now()
FROM page_parents link
JOIN sys_permission parent
  ON parent.code = link.parent_code
 AND parent.is_deleted = false
WHERE child.tenant_id = parent.tenant_id
  AND child.code = link.child_code
  AND child.is_deleted = false
  AND ROW(child.parent_id, child.permission_path, child.perm_path)
      IS DISTINCT FROM
      ROW(parent.id, parent.code || '/' || child.code, parent.code || '/' || child.code);

-- Bundle membership is literal and mirrors PROPERTY_PERMISSION_BUNDLES. Legacy
-- operations pages, wildcard permissions and inferred domain prefixes are not
-- authorization sources.
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
    -- PROPERTY_BUNDLE_PERMISSIONS_START
    ('property-bundle:homestay-overview', 'homestay:dashboard:page'),
    ('property-bundle:homestay-overview', 'homestay:tasks:page'),
    ('property-bundle:homestay-overview', 'homestay:availability:page'),
    ('property-bundle:homestay-overview', 'homestay:dashboard:read'),
    ('property-bundle:homestay-overview', 'homestay:booking:read'),
    ('property-bundle:homestay-rates', 'homestay:rates:page'),
    ('property-bundle:homestay-rates', 'homestay:rate:read'),
    ('property-bundle:homestay-rates', 'homestay:rate:manage'),
    ('property-bundle:homestay-bookings', 'homestay:bookings:page'),
    ('property-bundle:homestay-bookings', 'homestay:booking:read'),
    ('property-bundle:homestay-bookings', 'homestay:booking:create'),
    ('property-bundle:homestay-bookings', 'homestay:booking:confirm'),
    ('property-bundle:homestay-bookings', 'homestay:booking:cancel'),
    ('property-bundle:homestay-bookings', 'homestay:booking:reschedule'),
    ('property-bundle:homestay-stays', 'homestay:stays:page'),
    ('property-bundle:homestay-stays', 'homestay:booking:read'),
    ('property-bundle:homestay-stays', 'homestay:stay:manage'),
    ('property-bundle:homestay-turnovers', 'homestay:turnovers:page'),
    ('property-bundle:homestay-turnovers', 'homestay:turnover:read'),
    ('property-bundle:homestay-turnovers', 'homestay:turnover:execute'),
    ('property-bundle:homestay-finance', 'homestay:finance:page'),
    ('property-bundle:homestay-finance', 'homestay:booking:read'),
    ('property-bundle:homestay-finance', 'homestay:finance:read'),
    ('property-bundle:homestay-finance', 'homestay:finance:register'),
    ('property-bundle:homestay-finance', 'homestay:finance:waive'),
    ('property-bundle:housing-overview', 'housing:dashboard:page'),
    ('property-bundle:housing-overview', 'housing:tasks:page'),
    ('property-bundle:housing-overview', 'housing:dashboard:read'),
    ('property-bundle:housing-tenants', 'housing:tenants:page'),
    ('property-bundle:housing-tenants', 'housing:tenant:manage'),
    ('property-bundle:housing-leases', 'housing:leases:page'),
    ('property-bundle:housing-leases', 'housing:lease:read'),
    ('property-bundle:housing-leases', 'housing:lease:create'),
    ('property-bundle:housing-leases', 'housing:lease:approve'),
    ('property-bundle:housing-leases', 'housing:lease:sign'),
    ('property-bundle:housing-leases', 'housing:lease:activate'),
    ('property-bundle:housing-leases', 'housing:lease:checkout'),
    ('property-bundle:housing-handovers', 'housing:handovers:page'),
    ('property-bundle:housing-handovers', 'housing:handover:manage'),
    ('property-bundle:housing-billing', 'housing:billing:page'),
    ('property-bundle:housing-billing', 'housing:lease:read'),
    ('property-bundle:housing-billing', 'housing:billing:generate'),
    ('property-bundle:housing-finance', 'housing:finance:page'),
    ('property-bundle:housing-finance', 'housing:finance:read'),
    ('property-bundle:housing-finance', 'housing:finance:register'),
    ('property-bundle:housing-finance', 'housing:finance:waive'),
    ('property-bundle:housing-repairs', 'housing:repairs:page'),
    ('property-bundle:housing-repairs', 'housing:repair:manage'),
    ('property-bundle:housing-purchases', 'housing:purchases:page'),
    ('property-bundle:housing-purchases', 'housing:purchase:read'),
    ('property-bundle:housing-purchases', 'housing:purchase:manage'),
    ('property-bundle:housing-purchases', 'housing:purchase:transfer')
    -- PROPERTY_BUNDLE_PERMISSIONS_END
),
role_bundles(role_code, module_code, bundle_code) AS (
  VALUES
    -- PROPERTY_ROLE_BUNDLES_START
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-overview'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-rates'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-bookings'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-stays'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-turnovers'),
    ('SUPER_ADMIN', 'homestay', 'property-bundle:homestay-finance'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-overview'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-tenants'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-leases'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-handovers'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-billing'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-finance'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-repairs'),
    ('SUPER_ADMIN', 'housing_rental', 'property-bundle:housing-purchases'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-overview'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-rates'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-bookings'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-stays'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-turnovers'),
    ('OPERATIONS_OWNER', 'homestay', 'property-bundle:homestay-finance'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-overview'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-tenants'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-leases'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-handovers'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-billing'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-finance'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-repairs'),
    ('OPERATIONS_OWNER', 'housing_rental', 'property-bundle:housing-purchases'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-overview'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-rates'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-bookings'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-stays'),
    ('PROPERTY_MANAGER', 'homestay', 'property-bundle:homestay-turnovers'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-overview'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-tenants'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-leases'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-handovers'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-billing'),
    ('PROPERTY_MANAGER', 'housing_rental', 'property-bundle:housing-repairs'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-overview'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-bookings'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-stays'),
    ('PROPERTY_STAFF', 'homestay', 'property-bundle:homestay-turnovers'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-overview'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-tenants'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-handovers'),
    ('PROPERTY_STAFF', 'housing_rental', 'property-bundle:housing-repairs'),
    ('FINANCE_MANAGER', 'homestay', 'property-bundle:homestay-finance'),
    ('FINANCE_MANAGER', 'housing_rental', 'property-bundle:housing-billing'),
    ('FINANCE_MANAGER', 'housing_rental', 'property-bundle:housing-finance'),
    ('FINANCE_MANAGER', 'housing_rental', 'property-bundle:housing-purchases'),
    ('AUDITOR', 'homestay', 'property-bundle:homestay-overview'),
    ('AUDITOR', 'housing_rental', 'property-bundle:housing-overview')
    -- PROPERTY_ROLE_BUNDLES_END
),
resolved_role_bundles AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    role_bundle.module_code,
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
grant_codes AS (
  SELECT
    resolved.tenant_id,
    resolved.park_id,
    resolved.role_id,
    bundle.permission_code
  FROM resolved_role_bundles resolved
  JOIN bundle_permissions bundle
    ON bundle.bundle_code = resolved.bundle_code
  UNION
  SELECT
    resolved.tenant_id,
    resolved.park_id,
    resolved.role_id,
    CASE resolved.module_code
      WHEN 'homestay' THEN 'homestay'
      WHEN 'housing_rental' THEN 'housing_rental'
    END AS permission_code
  FROM resolved_role_bundles resolved
),
resolved_grants AS (
  SELECT DISTINCT
    grant_code.tenant_id,
    grant_code.park_id,
    grant_code.role_id,
    permission.id AS permission_id
  FROM grant_codes grant_code
  JOIN sys_permission permission
    ON permission.tenant_id = grant_code.tenant_id
   AND permission.code = grant_code.permission_code
   AND permission.is_deleted = false
   AND permission.is_enabled = true
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  resolved.tenant_id, resolved.park_id, resolved.role_id, resolved.permission_id,
  now(), now(), false, 1, 'PR192 Track A explicit property bundle grant'
FROM resolved_grants resolved
ON CONFLICT (tenant_id, park_id, role_id, permission_id)
  WHERE is_deleted = false
DO NOTHING;

COMMIT;
