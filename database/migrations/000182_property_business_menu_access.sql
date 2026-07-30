BEGIN;

-- Menu permissions are tenant-wide (`uq_sys_permission_tenant_code_active`), while
-- role grants remain park-scoped. Pick one actively authorized park as the permission
-- row's storage scope, then bridge the menu nodes to eligible roles in every authorized park.
WITH module_tenants AS (
  SELECT DISTINCT ON (assignment.tenant_id, module.module_code)
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
  ORDER BY assignment.tenant_id, module.module_code, assignment.park_id
),
menu_definitions(module_code, code, name, resource, icon, sort_no) AS (
  VALUES
    ('homestay', 'homestay', '民宿管理', 'homestay', 'hotel', 69),
    ('housing_rental', 'housing_rental', '住房出租', 'housing_rental', 'house', 70)
),
definitions AS (
  SELECT module_tenants.tenant_id, module_tenants.park_id, menu_definitions.*
  FROM module_tenants
  JOIN menu_definitions USING (module_code)
)
UPDATE sys_permission permission
SET park_id = definitions.park_id,
    name = definitions.name,
    parent_id = NULL,
    resource = definitions.resource,
    action = 'menu',
    permission_path = definitions.code,
    perm_path = definitions.code,
    permission_level = 1,
    level = 1,
    sort_no = definitions.sort_no,
    permission_type = 'menu',
    perm_type = 10,
    api_method = NULL,
    api_path = NULL,
    frontend_route = NULL,
    component_key = NULL,
    icon = definitions.icon,
    field_key = NULL,
    data_dimension = NULL,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    keep_alive = true,
    always_show = true,
    is_enabled = true,
    status = 'enabled',
    is_deleted = false,
    remark = 'PR192 property business menu access',
    update_time = now()
FROM definitions
WHERE permission.tenant_id = definitions.tenant_id
  AND permission.code = definitions.code
  AND permission.is_deleted = false;

WITH module_tenants AS (
  SELECT DISTINCT ON (assignment.tenant_id, module.module_code)
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
  ORDER BY assignment.tenant_id, module.module_code, assignment.park_id
),
menu_definitions(module_code, code, name, resource, icon, sort_no) AS (
  VALUES
    ('homestay', 'homestay', '民宿管理', 'homestay', 'hotel', 69),
    ('housing_rental', 'housing_rental', '住房出租', 'housing_rental', 'house', 70)
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
  uuid_generate_v4(), module_tenants.tenant_id, module_tenants.park_id,
  menu_definitions.code, menu_definitions.name, NULL,
  menu_definitions.resource, 'menu',
  menu_definitions.code, menu_definitions.code, 1, 1, menu_definitions.sort_no,
  'menu', 10, NULL, NULL, NULL, NULL, menu_definitions.icon, NULL, NULL,
  true, true, false, true, true, true, true, 'enabled',
  now(), now(), false, 1, 'PR192 property business menu access'
FROM module_tenants
JOIN menu_definitions USING (module_code)
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission existing
  WHERE existing.tenant_id = module_tenants.tenant_id
    AND existing.code = menu_definitions.code
    AND existing.is_deleted = false
);

WITH module_tenants AS (
  SELECT DISTINCT ON (assignment.tenant_id, module.module_code)
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
  ORDER BY assignment.tenant_id, module.module_code, assignment.park_id
),
page_definitions(module_code, parent_code, code, name, resource, frontend_route, sort_no) AS (
  VALUES
    ('homestay', 'homestay', 'homestay:operations', '民宿运营', 'homestay.operations', '/homestay', 691),
    ('housing_rental', 'housing_rental', 'housing_rental:operations', '住房运营', 'housing_rental.operations', '/housing', 701)
),
definitions AS (
  SELECT
    module_tenants.tenant_id,
    module_tenants.park_id,
    page_definitions.*,
    parent.id AS parent_id
  FROM module_tenants
  JOIN page_definitions USING (module_code)
  JOIN sys_permission parent
    ON parent.tenant_id = module_tenants.tenant_id
   AND parent.code = page_definitions.parent_code
   AND parent.is_deleted = false
)
UPDATE sys_permission permission
SET park_id = definitions.park_id,
    name = definitions.name,
    parent_id = definitions.parent_id,
    resource = definitions.resource,
    action = 'page',
    permission_path = definitions.parent_code || '/' || definitions.code,
    perm_path = definitions.parent_code || '/' || definitions.code,
    permission_level = 2,
    level = 2,
    sort_no = definitions.sort_no,
    permission_type = 'page',
    perm_type = 20,
    api_method = NULL,
    api_path = NULL,
    frontend_route = definitions.frontend_route,
    component_key = NULL,
    icon = NULL,
    field_key = NULL,
    data_dimension = NULL,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    keep_alive = true,
    always_show = true,
    is_enabled = true,
    status = 'enabled',
    is_deleted = false,
    remark = 'PR192 property business page access',
    update_time = now()
FROM definitions
WHERE permission.tenant_id = definitions.tenant_id
  AND permission.code = definitions.code
  AND permission.is_deleted = false;

WITH module_tenants AS (
  SELECT DISTINCT ON (assignment.tenant_id, module.module_code)
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
  ORDER BY assignment.tenant_id, module.module_code, assignment.park_id
),
page_definitions(module_code, parent_code, code, name, resource, frontend_route, sort_no) AS (
  VALUES
    ('homestay', 'homestay', 'homestay:operations', '民宿运营', 'homestay.operations', '/homestay', 691),
    ('housing_rental', 'housing_rental', 'housing_rental:operations', '住房运营', 'housing_rental.operations', '/housing', 701)
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
  uuid_generate_v4(), module_tenants.tenant_id, module_tenants.park_id,
  page_definitions.code, page_definitions.name, parent.id,
  page_definitions.resource, 'page',
  page_definitions.parent_code || '/' || page_definitions.code,
  page_definitions.parent_code || '/' || page_definitions.code,
  2, 2, page_definitions.sort_no,
  'page', 20, NULL, NULL, page_definitions.frontend_route,
  NULL, NULL, NULL, NULL,
  true, true, false, true, true, true, true, 'enabled',
  now(), now(), false, 1, 'PR192 property business page access'
FROM module_tenants
JOIN page_definitions USING (module_code)
JOIN sys_permission parent
  ON parent.tenant_id = module_tenants.tenant_id
 AND parent.code = page_definitions.parent_code
 AND parent.is_deleted = false
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_permission existing
  WHERE existing.tenant_id = module_tenants.tenant_id
    AND existing.code = page_definitions.code
    AND existing.is_deleted = false
);

WITH enabled_modules AS (
  SELECT DISTINCT
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
eligible_roles AS (
  SELECT DISTINCT
    role_link.tenant_id,
    role_link.park_id,
    role_link.role_id,
    CASE
      WHEN api_permission.code LIKE 'homestay:%' THEN 'homestay'
      WHEN api_permission.code LIKE 'housing:%' THEN 'housing_rental'
    END AS module_code
  FROM rel_role_perm role_link
  JOIN sys_permission api_permission
    ON api_permission.id = role_link.permission_id
   AND api_permission.tenant_id = role_link.tenant_id
   AND api_permission.perm_type = 40
   AND api_permission.is_deleted = false
   AND api_permission.is_enabled = true
  JOIN sys_role role
    ON role.id = role_link.role_id
   AND role.tenant_id = role_link.tenant_id
   AND role.park_id = role_link.park_id
   AND role.is_deleted = false
  JOIN enabled_modules enabled_module
    ON enabled_module.tenant_id = role_link.tenant_id
   AND enabled_module.park_id = role_link.park_id
   AND enabled_module.module_code = CASE
     WHEN api_permission.code LIKE 'homestay:%' THEN 'homestay'
     WHEN api_permission.code LIKE 'housing:%' THEN 'housing_rental'
   END
  WHERE role_link.is_deleted = false
    AND (
      api_permission.code LIKE 'homestay:%'
      OR api_permission.code LIKE 'housing:%'
    )
),
menu_permissions(module_code, permission_code) AS (
  VALUES
    ('homestay', 'homestay'),
    ('homestay', 'homestay:operations'),
    ('housing_rental', 'housing_rental'),
    ('housing_rental', 'housing_rental:operations')
),
resolved AS (
  SELECT
    eligible_roles.tenant_id,
    eligible_roles.park_id,
    eligible_roles.role_id,
    permission.id AS permission_id
  FROM eligible_roles
  JOIN menu_permissions USING (module_code)
  JOIN sys_permission permission
    ON permission.tenant_id = eligible_roles.tenant_id
   AND permission.code = menu_permissions.permission_code
   AND permission.is_deleted = false
)
INSERT INTO rel_role_perm (
  tenant_id, park_id, role_id, permission_id,
  create_time, update_time, is_deleted, version, remark
)
SELECT
  resolved.tenant_id, resolved.park_id, resolved.role_id, resolved.permission_id,
  now(), now(), false, 1, 'PR192 property business menu access'
FROM resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM rel_role_perm existing
  WHERE existing.tenant_id = resolved.tenant_id
    AND existing.park_id = resolved.park_id
    AND existing.role_id = resolved.role_id
    AND existing.permission_id = resolved.permission_id
    AND existing.is_deleted = false
);

COMMIT;
