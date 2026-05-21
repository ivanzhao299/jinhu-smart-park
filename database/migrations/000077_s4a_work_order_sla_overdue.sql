CREATE TABLE IF NOT EXISTS biz_work_order_sla_rule (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id varchar(64) NOT NULL,
  park_id varchar(64) NOT NULL,
  wo_type varchar(64) NOT NULL,
  urgency varchar(32) NOT NULL,
  priority varchar(32) NOT NULL,
  dispatch_sla_min integer NOT NULL DEFAULT 30,
  finish_sla_min integer NOT NULL DEFAULT 240,
  escalate_role_code varchar(64),
  status varchar(32) NOT NULL DEFAULT 'enabled',
  create_by uuid,
  create_time timestamptz NOT NULL DEFAULT now(),
  update_by uuid,
  update_time timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  remark varchar(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_biz_work_order_sla_rule_match_active
  ON biz_work_order_sla_rule (tenant_id, park_id, wo_type, urgency, priority)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_biz_work_order_sla_rule_scope_deleted
  ON biz_work_order_sla_rule (tenant_id, park_id, is_deleted);

CREATE INDEX IF NOT EXISTS idx_biz_work_order_sla_rule_match
  ON biz_work_order_sla_rule (tenant_id, park_id, wo_type, urgency, priority, status, is_deleted);

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
permissions(code, name, resource, action, api_method, api_path, frontend_route) AS (
  VALUES
    ('workorder_sla:read', '工单 SLA 规则读取', 'biz.work_order_sla_rule', 'read', 'GET', '/api/v1/work-orders/sla-rules', '/workorders/sla-rules'),
    ('workorder_sla:create', '新增工单 SLA 规则', 'biz.work_order_sla_rule', 'create', 'POST', '/api/v1/work-orders/sla-rules', NULL),
    ('workorder_sla:update', '编辑工单 SLA 规则', 'biz.work_order_sla_rule', 'update', 'PUT', '/api/v1/work-orders/sla-rules/:id', NULL),
    ('workorder_sla:delete', '删除工单 SLA 规则', 'biz.work_order_sla_rule', 'delete', 'DELETE', '/api/v1/work-orders/sla-rules/:id', NULL),
    ('workorder:recalculate_overdue', '重算工单超时', 'biz.work_order', 'recalculate_overdue', 'POST', '/api/v1/work-orders/recalculate-overdue', NULL),
    ('workorder:overdue', '超时工单读取', 'biz.work_order', 'overdue', 'GET', '/api/v1/work-orders/overdue', '/workorders/overdue')
)
INSERT INTO sys_permission (
  tenant_id,
  park_id,
  code,
  name,
  resource,
  action,
  permission_type,
  perm_type,
  api_method,
  api_path,
  frontend_route,
  status,
  is_system,
  is_builtin,
  visible
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  permissions.code,
  permissions.name,
  permissions.resource,
  permissions.action,
  'api',
  40,
  permissions.api_method,
  permissions.api_path,
  permissions.frontend_route,
  'enabled',
  true,
  true,
  true
FROM permissions
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  permission_type = EXCLUDED.permission_type,
  perm_type = EXCLUDED.perm_type,
  api_method = EXCLUDED.api_method,
  api_path = EXCLUDED.api_path,
  frontend_route = EXCLUDED.frontend_route,
  status = 'enabled',
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
role_permissions(role_code, permission_code) AS (
  VALUES
    ('OPERATIONS_OWNER', 'workorder_sla:read'),
    ('OPERATIONS_OWNER', 'workorder_sla:create'),
    ('OPERATIONS_OWNER', 'workorder_sla:update'),
    ('OPERATIONS_OWNER', 'workorder_sla:delete'),
    ('OPERATIONS_OWNER', 'workorder:recalculate_overdue'),
    ('OPERATIONS_OWNER', 'workorder:overdue'),
    ('PROPERTY_MANAGER', 'workorder_sla:read'),
    ('PROPERTY_MANAGER', 'workorder_sla:create'),
    ('PROPERTY_MANAGER', 'workorder_sla:update'),
    ('PROPERTY_MANAGER', 'workorder_sla:delete'),
    ('PROPERTY_MANAGER', 'workorder:recalculate_overdue'),
    ('PROPERTY_MANAGER', 'workorder:overdue')
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_time, update_time, is_deleted, version)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  role.id,
  permission.id,
  now(),
  now(),
  false,
  1
FROM role_permissions
JOIN seed_scope ON true
JOIN sys_role role
  ON role.tenant_id = seed_scope.tenant_id
 AND role.park_id = seed_scope.park_id
 AND role.code = role_permissions.role_code
 AND role.is_deleted = false
JOIN sys_permission permission
  ON permission.tenant_id = seed_scope.tenant_id
 AND permission.park_id = seed_scope.park_id
 AND permission.code = role_permissions.permission_code
 AND permission.is_deleted = false
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  update_time = now(),
  is_deleted = false;

WITH seed_scope AS (
  SELECT '10000001' AS tenant_id, '20000001' AS park_id
),
default_rules(wo_type, urgency, priority, dispatch_sla_min, finish_sla_min, escalate_role_code, remark) AS (
  VALUES
    ('repair', 'normal', '20', 30, 240, 'PROPERTY_MANAGER', '默认报修 SLA'),
    ('repair', 'urgent', '30', 15, 120, 'PROPERTY_MANAGER', '紧急报修 SLA'),
    ('repair', 'critical', '40', 5, 60, 'OPERATIONS_OWNER', '特急报修 SLA'),
    ('complaint', 'urgent', '30', 20, 180, 'PROPERTY_MANAGER', '投诉处理 SLA'),
    ('service', 'normal', '20', 60, 480, 'PROPERTY_MANAGER', '服务申请 SLA')
)
INSERT INTO biz_work_order_sla_rule (
  tenant_id,
  park_id,
  wo_type,
  urgency,
  priority,
  dispatch_sla_min,
  finish_sla_min,
  escalate_role_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  default_rules.wo_type,
  default_rules.urgency,
  default_rules.priority,
  default_rules.dispatch_sla_min,
  default_rules.finish_sla_min,
  default_rules.escalate_role_code,
  'enabled',
  default_rules.remark
FROM default_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, wo_type, urgency, priority) WHERE is_deleted = false DO UPDATE SET
  dispatch_sla_min = EXCLUDED.dispatch_sla_min,
  finish_sla_min = EXCLUDED.finish_sla_min,
  escalate_role_code = EXCLUDED.escalate_role_code,
  status = 'enabled',
  update_time = now();
