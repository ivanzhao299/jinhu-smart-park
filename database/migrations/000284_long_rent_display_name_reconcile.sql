BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- LEA-003 / 000284 is a display-name reconcile only. Stable module, menu, page and API
-- permission codes remain the authorization identity; role bindings are untouched.
LOCK TABLE sys_module, sys_module_registry, sys_permission IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE long_rent_permission_name (
  code varchar(128) PRIMARY KEY,
  expected_name varchar(100) NOT NULL
) ON COMMIT DROP;

INSERT INTO long_rent_permission_name (code, expected_name) VALUES
  ('housing_rental', '长租经营'),
  ('housing_rental:operations', '长租运营'),
  ('housing:dashboard:page', '长租经营看板'),
  ('housing:tasks:page', '长租经营任务'),
  ('housing:tenants:page', '长租租客'),
  ('housing:leases:page', '长租租约'),
  ('housing:handovers:page', '长租交割'),
  ('housing:billing:page', '长租账单'),
  ('housing:finance:page', '长租财务'),
  ('housing:repairs:page', '长租报修'),
  ('housing:purchases:page', '长租采购'),
  ('housing:dashboard:read', '长租经营看板读取'),
  ('housing:task:read', '长租经营任务读取'),
  ('housing:tenant:read', '长租租客读取'),
  ('housing:tenant:manage', '长租租客管理'),
  ('housing:lease:read', '长租租约读取'),
  ('housing:lease:create', '长租租约创建'),
  ('housing:lease:approve', '长租租约审批'),
  ('housing:lease:sign', '长租租约签署登记'),
  ('housing:lease:activate', '长租租约生效'),
  ('housing:lease:checkout', '长租退租结算'),
  ('housing:handover:read', '长租交割读取'),
  ('housing:handover:manage', '长租交割管理'),
  ('housing:billing:read', '长租账单读取'),
  ('housing:billing:generate', '长租周期账单生成'),
  ('housing:finance:read', '长租财务读取'),
  ('housing:finance:register', '长租收退款登记'),
  ('housing:finance:waive', '长租费用减免'),
  ('housing:repair:read', '长租报修读取'),
  ('housing:repair:manage', '长租报修代录'),
  ('housing:purchase:read', '长租采购读取'),
  ('housing:purchase:manage', '长租采购管理'),
  ('housing:purchase:transfer', '长租采购转收费');

DO $$
DECLARE
  active_module_count integer;
  permission_cardinality_drift text;
  registry_cardinality_drift text;
BEGIN
  SELECT count(*)::integer INTO active_module_count
  FROM sys_module
  WHERE module_code = 'housing_rental' AND is_deleted = false;

  IF active_module_count <> 1 THEN
    RAISE EXCEPTION 'long-rent-module-cardinality-drift expected=1 actual=%', active_module_count
      USING ERRCODE = '23514';
  END IF;

  WITH affected_tenants AS (
    SELECT DISTINCT permission.tenant_id
    FROM sys_permission permission
    JOIN long_rent_permission_name definition ON definition.code = permission.code
    WHERE permission.is_deleted = false
  ), permission_counts AS (
    SELECT tenant.tenant_id, definition.code, count(permission.id)::integer AS row_count
    FROM affected_tenants tenant
    CROSS JOIN long_rent_permission_name definition
    LEFT JOIN sys_permission permission
      ON permission.tenant_id = tenant.tenant_id
     AND permission.code = definition.code
     AND permission.is_deleted = false
    GROUP BY tenant.tenant_id, definition.code
  )
  SELECT string_agg(
    tenant_id || ':' || code || ':count=' || row_count::text,
    ', ' ORDER BY tenant_id, code
  ) INTO permission_cardinality_drift
  FROM permission_counts
  WHERE row_count <> 1;

  IF permission_cardinality_drift IS NOT NULL THEN
    RAISE EXCEPTION 'long-rent-permission-cardinality-drift targets=%', permission_cardinality_drift
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(
    tenant_id || ':' || park_id || ':count=' || row_count::text,
    ', ' ORDER BY tenant_id, park_id
  ) INTO registry_cardinality_drift
  FROM (
    SELECT tenant_id, park_id, count(*)::integer AS row_count
    FROM sys_module_registry
    WHERE module_code = 'housing_rental' AND is_deleted = false
    GROUP BY tenant_id, park_id
    HAVING count(*) <> 1
  ) registry_counts;

  IF registry_cardinality_drift IS NOT NULL THEN
    RAISE EXCEPTION 'long-rent-registry-cardinality-drift targets=%', registry_cardinality_drift
      USING ERRCODE = '23514';
  END IF;
END $$;

UPDATE sys_module
SET module_name = '长租经营', update_time = now()
WHERE module_code = 'housing_rental'
  AND is_deleted = false
  AND module_name IS DISTINCT FROM '长租经营';

UPDATE sys_module_registry
SET module_name = '长租经营', update_time = now()
WHERE module_code = 'housing_rental'
  AND is_deleted = false
  AND module_name IS DISTINCT FROM '长租经营';

UPDATE sys_permission permission
SET name = definition.expected_name, update_time = now()
FROM long_rent_permission_name definition
WHERE permission.code = definition.code
  AND permission.is_deleted = false
  AND permission.name IS DISTINCT FROM definition.expected_name;

DO $$
DECLARE
  unresolved_permissions text;
  unresolved_registry text;
  unresolved_module_count integer;
BEGIN
  SELECT count(*)::integer INTO unresolved_module_count
  FROM sys_module
  WHERE module_code = 'housing_rental'
    AND is_deleted = false
    AND module_name = '长租经营';

  IF unresolved_module_count <> 1 THEN
    RAISE EXCEPTION 'long-rent-module-name-reconcile-failed expected=1 actual=%', unresolved_module_count
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(tenant_id || ':' || park_id, ', ' ORDER BY tenant_id, park_id)
  INTO unresolved_registry
  FROM sys_module_registry
  WHERE module_code = 'housing_rental'
    AND is_deleted = false
    AND module_name IS DISTINCT FROM '长租经营';

  IF unresolved_registry IS NOT NULL THEN
    RAISE EXCEPTION 'long-rent-registry-name-reconcile-failed targets=%', unresolved_registry
      USING ERRCODE = '23514';
  END IF;

  WITH affected_permissions AS (
    SELECT permission.tenant_id, permission.code, permission.name, definition.expected_name
    FROM sys_permission permission
    JOIN long_rent_permission_name definition ON definition.code = permission.code
    WHERE permission.is_deleted = false
  )
  SELECT string_agg(
    tenant_id || ':' || code || ':actual=' || name || ':expected=' || expected_name,
    ', ' ORDER BY tenant_id, code
  ) INTO unresolved_permissions
  FROM affected_permissions
  WHERE name IS DISTINCT FROM expected_name;

  IF unresolved_permissions IS NOT NULL THEN
    RAISE EXCEPTION 'long-rent-permission-name-reconcile-failed targets=%', unresolved_permissions
      USING ERRCODE = '23514';
  END IF;
END $$;

COMMIT;
