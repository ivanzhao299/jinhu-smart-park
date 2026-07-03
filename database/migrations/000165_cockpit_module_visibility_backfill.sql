WITH cockpit_module AS (
  INSERT INTO sys_module (
    module_code, module_name, module_group, description, route_prefix, icon, status, sort_no, remark
  )
  VALUES (
    'cockpit',
    '经营驾驶舱',
    'extension',
    '经营总览、资产经营与多模块汇总驾驶舱',
    '/cockpit',
    'layout-dashboard',
    1,
    110,
    'Cockpit module global backfill'
  )
  ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    description = EXCLUDED.description,
    route_prefix = EXCLUDED.route_prefix,
    icon = EXCLUDED.icon,
    status = EXCLUDED.status,
    sort_no = EXCLUDED.sort_no,
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id
),
module_row AS (
  SELECT id FROM cockpit_module
  UNION
  SELECT id FROM sys_module WHERE module_code = 'cockpit' AND is_deleted = false LIMIT 1
)
UPDATE sys_plan plan
SET module_codes = CASE
                     WHEN COALESCE(plan.module_codes, '[]'::jsonb) @> '["cockpit"]'::jsonb THEN COALESCE(plan.module_codes, '[]'::jsonb)
                     ELSE COALESCE(plan.module_codes, '[]'::jsonb) || '["cockpit"]'::jsonb
                   END,
    update_time = now()
WHERE plan.plan_code IN ('ENTERPRISE', 'GROUP')
  AND plan.is_deleted = false;

WITH module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'cockpit' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_plan_module (
  plan_id, module_id, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  plan.id,
  module_row.id,
  1,
  now(),
  now(),
  false,
  1,
  'Cockpit plan-module visibility backfill'
FROM sys_plan plan
CROSS JOIN module_row
WHERE plan.plan_code IN ('ENTERPRISE', 'GROUP')
  AND plan.is_deleted = false
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH entitlement_candidates AS (
  SELECT
    tenant_module.tenant_id,
    tenant_module.park_id,
    tenant_module.tenant_code,
    tenant_module.plan_id,
    plan.plan_code,
    row_number() OVER (
      PARTITION BY tenant_module.tenant_id, tenant_module.park_id
      ORDER BY CASE plan.plan_code
        WHEN 'GROUP' THEN 1
        WHEN 'ENTERPRISE' THEN 2
        ELSE 9
      END,
      tenant_module.create_time ASC,
      tenant_module.id ASC
    ) AS scope_rank
  FROM rel_tenant_module tenant_module
  JOIN sys_plan plan
    ON plan.id = tenant_module.plan_id
   AND plan.is_deleted = false
  WHERE tenant_module.is_deleted = false
    AND tenant_module.enabled = true
    AND tenant_module.status = 'enabled'
    AND plan.plan_code IN ('ENTERPRISE', 'GROUP')
),
entitled_scopes AS (
  SELECT tenant_id, park_id, tenant_code, plan_id
  FROM entitlement_candidates
  WHERE scope_rank = 1
),
module_row AS (
  SELECT id FROM sys_module WHERE module_code = 'cockpit' AND is_deleted = false LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id, park_id, tenant_code, module_id, plan_id, enabled, status, create_time, update_time, is_deleted, version, remark
)
SELECT
  entitled_scopes.tenant_id,
  entitled_scopes.park_id,
  entitled_scopes.tenant_code,
  module_row.id,
  entitled_scopes.plan_id,
  true,
  'enabled',
  now(),
  now(),
  false,
  1,
  'Cockpit tenant-module visibility backfill'
FROM entitled_scopes
CROSS JOIN module_row
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  tenant_code = EXCLUDED.tenant_code,
  plan_id = EXCLUDED.plan_id,
  enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();
