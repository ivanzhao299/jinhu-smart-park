-- Production-safe S1 core seed.
-- Initializes permissions, default park organization, base roles, and dictionaries.
-- This file must not create users, fixed passwords, test phone numbers, or test emails.
-- Replace tenant_id and park_id when seeding a real environment.
INSERT INTO sys_tenant (
  tenant_id,
  park_id,
  tenant_code,
  tenant_name,
  tenant_type,
  status,
  max_users,
  max_parks,
  plan_code,
  remark
)
VALUES (
  '10000001',
  '0',
  'JH_DEFAULT',
  '金湖科创产业园默认租户',
  'park_operator',
  1,
  0,
  0,
  'GROUP',
  'Production-safe default tenant seed for future SaaS isolation'
)
ON CONFLICT (tenant_id) WHERE is_deleted = false DO UPDATE SET
  tenant_code = EXCLUDED.tenant_code,
  tenant_name = EXCLUDED.tenant_name,
  tenant_type = EXCLUDED.tenant_type,
  status = EXCLUDED.status,
  max_users = EXCLUDED.max_users,
  max_parks = EXCLUDED.max_parks,
  plan_code = EXCLUDED.plan_code,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH RECURSIVE seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
leaf_permissions(code, name, resource, action) AS (
  VALUES
    ('system:org:list', '组织列表', 'system.org', 'list'),
    ('system:org:create', '新增组织', 'system.org', 'create'),
    ('system:org:detail', '组织详情', 'system.org', 'detail'),
    ('system:org:update', '编辑组织', 'system.org', 'update'),
    ('system:org:delete', '删除组织', 'system.org', 'delete'),
    ('system:user:list', '用户列表', 'system.user', 'list'),
    ('system:user:create', '新增用户', 'system.user', 'create'),
    ('system:user:detail', '用户详情', 'system.user', 'detail'),
    ('system:user:update', '编辑用户', 'system.user', 'update'),
    ('system:user:delete', '删除用户', 'system.user', 'delete'),
    ('system:user:reset-password', '重置密码', 'system.user', 'reset-password'),
    ('system:user:assign-roles', '分配角色', 'system.user', 'assign-roles'),
    ('system:user:me', '当前用户', 'system.user', 'me'),
    ('system:role:list', '角色列表', 'system.role', 'list'),
    ('system:role:create', '新增角色', 'system.role', 'create'),
    ('system:role:detail', '角色详情', 'system.role', 'detail'),
    ('system:role:update', '编辑角色', 'system.role', 'update'),
    ('system:role:delete', '删除角色', 'system.role', 'delete'),
    ('system:role:assign-permissions', '角色授权', 'system.role', 'assign-permissions'),
    ('role:read', '角色读取', 'system.role', 'read'),
    ('role:create', '新增开放角色', 'system.role', 'create'),
    ('role:update', '编辑开放角色', 'system.role', 'update'),
    ('role:copy', '复制模板角色', 'system.role', 'copy'),
    ('role:disable', '停用启用角色', 'system.role', 'disable'),
    ('role:delete', '删除开放角色', 'system.role', 'delete'),
    ('tenant:read', '租户读取', 'system.tenant', 'read'),
    ('tenant:manage', '租户管理', 'system.tenant', 'manage'),
    ('system:permission:list', '权限列表', 'system.permission', 'list'),
    ('system:permission:tree', '权限树', 'system.permission', 'tree'),
    ('system:permission:create', '新增权限', 'system.permission', 'create'),
    ('system:permission:update', '编辑权限', 'system.permission', 'update'),
    ('system:permission:delete', '删除权限', 'system.permission', 'delete'),
    ('permission:read', '权限读取', 'system.permission', 'read'),
    ('permission:create', '新增开放权限', 'system.permission', 'create'),
    ('permission:update', '编辑开放权限', 'system.permission', 'update'),
    ('permission:delete', '删除开放权限', 'system.permission', 'delete'),
    ('system:data-scope:read', '数据权限读取', 'system.data-scope', 'read'),
    ('system:data-scope:create', '新增数据权限', 'system.data-scope', 'create'),
    ('system:data-scope:update', '编辑数据权限', 'system.data-scope', 'update'),
    ('system:data-scope:delete', '删除数据权限', 'system.data-scope', 'delete'),
    ('system:data-scope:assign', '角色数据权限绑定', 'system.data-scope', 'assign'),
    ('data_scope:read', '开放数据权限读取', 'system.data-scope', 'read'),
    ('data_scope:create', '新增开放数据权限', 'system.data-scope', 'create'),
    ('data_scope:update', '编辑开放数据权限', 'system.data-scope', 'update'),
    ('data_scope:delete', '删除开放数据权限', 'system.data-scope', 'delete'),
    ('role:assign_data_scope', '角色绑定数据权限', 'system.role', 'assign-data-scope'),
    ('system:field-policy:read', '字段策略读取', 'system.field-policy', 'read'),
    ('system:field-policy:create', '新增字段策略', 'system.field-policy', 'create'),
    ('system:field-policy:update', '编辑字段策略', 'system.field-policy', 'update'),
    ('system:field-policy:delete', '删除字段策略', 'system.field-policy', 'delete'),
    ('system:field-policy:assign', '角色字段策略绑定', 'system.field-policy', 'assign'),
    ('field_policy:read', '开放字段策略读取', 'system.field-policy', 'read'),
    ('field_policy:create', '新增开放字段策略', 'system.field-policy', 'create'),
    ('field_policy:update', '编辑开放字段策略', 'system.field-policy', 'update'),
    ('field_policy:delete', '删除开放字段策略', 'system.field-policy', 'delete'),
    ('role:assign_field_policy', '角色绑定字段策略', 'system.role', 'assign-field-policy'),
    ('system:code-rule:read', '编码规则读取', 'system.code-rule', 'read'),
    ('system:code-rule:create', '新增编码规则', 'system.code-rule', 'create'),
    ('system:code-rule:update', '编辑编码规则', 'system.code-rule', 'update'),
    ('system:code-rule:delete', '删除编码规则', 'system.code-rule', 'delete'),
    ('system:code-rule:generate', '生成业务编码', 'system.code-rule', 'generate'),
    ('code_rule:read', '开放编码规则读取', 'system.code-rule', 'read'),
    ('code_rule:create', '新增开放编码规则', 'system.code-rule', 'create'),
    ('code_rule:update', '编辑开放编码规则', 'system.code-rule', 'update'),
    ('code_rule:generate', '开放编码生成', 'system.code-rule', 'generate'),
    ('system:module:read', '模块读取', 'system.module', 'read'),
    ('system:module:create', '新增模块', 'system.module', 'create'),
    ('system:module:update', '编辑模块', 'system.module', 'update'),
    ('system:plan:read', '套餐读取', 'system.plan', 'read'),
    ('system:plan:create', '新增套餐', 'system.plan', 'create'),
    ('system:plan:update', '编辑套餐', 'system.plan', 'update'),
    ('system:tenant-module:read', '租户模块授权读取', 'system.tenant-module', 'read'),
    ('system:tenant-module:assign', '租户模块授权', 'system.tenant-module', 'assign'),
    ('module:read', '开放模块读取', 'system.module', 'read'),
    ('module:manage', '开放模块管理', 'system.module', 'manage'),
    ('plan:read', '开放套餐读取', 'system.plan', 'read'),
    ('plan:manage', '开放套餐管理', 'system.plan', 'manage'),
    ('tenant_module:read', '开放租户模块读取', 'system.tenant-module', 'read'),
    ('tenant_module:manage', '开放租户模块管理', 'system.tenant-module', 'manage'),
    ('system:dict-type:list', '字典类型列表', 'system.dict-type', 'list'),
    ('system:dict-type:create', '新增字典类型', 'system.dict-type', 'create'),
    ('system:dict-type:detail', '字典类型详情', 'system.dict-type', 'detail'),
    ('system:dict-type:update', '编辑字典类型', 'system.dict-type', 'update'),
    ('system:dict-type:delete', '删除字典类型', 'system.dict-type', 'delete'),
    ('system:dict-item:list', '字典项列表', 'system.dict-item', 'list'),
    ('system:dict-item:create', '新增字典项', 'system.dict-item', 'create'),
    ('system:dict-item:detail', '字典项详情', 'system.dict-item', 'detail'),
    ('system:dict-item:update', '编辑字典项', 'system.dict-item', 'update'),
    ('system:dict-item:delete', '删除字典项', 'system.dict-item', 'delete'),
    ('system:attachment:list', '附件列表', 'system.attachment', 'list'),
    ('system:attachment:create', '新增附件', 'system.attachment', 'create'),
    ('system:attachment:detail', '附件详情', 'system.attachment', 'detail'),
    ('system:attachment:delete', '删除附件', 'system.attachment', 'delete'),
    ('file:read', '文件读取', 'system.file', 'read'),
    ('file:upload', '文件上传', 'system.file', 'upload'),
    ('file:download', '文件下载', 'system.file', 'download'),
    ('file:delete', '文件删除', 'system.file', 'delete'),
    ('audit:read', '审计读取', 'system.audit', 'read'),
    ('audit:export', '审计导出', 'system.audit', 'export'),
    ('system:audit:login-log:list', '登录日志列表', 'system.audit', 'login-log:list'),
    ('system:audit:op-log:list', '操作日志列表', 'system.audit', 'op-log:list'),
    ('park:read', '园区读取', 'biz.park', 'read'),
    ('park:create', '新增园区', 'biz.park', 'create'),
    ('park:update', '编辑园区', 'biz.park', 'update'),
    ('park:delete', '删除园区', 'biz.park', 'delete'),
    ('building:read', '楼栋读取', 'biz.building', 'read'),
    ('building:create', '新增楼栋', 'biz.building', 'create'),
    ('building:update', '编辑楼栋', 'biz.building', 'update'),
    ('building:delete', '删除楼栋', 'biz.building', 'delete'),
    ('floor:read', '楼层读取', 'biz.floor', 'read'),
    ('floor:create', '新增楼层', 'biz.floor', 'create'),
    ('floor:update', '编辑楼层', 'biz.floor', 'update'),
    ('floor:delete', '删除楼层', 'biz.floor', 'delete'),
    ('floor:upload_layout', '上传楼层平面图', 'biz.floor', 'upload_layout'),
    ('unit:read', '房源读取', 'biz.unit', 'read'),
    ('unit:create', '新增房源', 'biz.unit', 'create'),
    ('unit:update', '编辑房源', 'biz.unit', 'update'),
    ('unit:delete', '删除房源', 'biz.unit', 'delete'),
    ('unit:transition_status', '房源状态流转', 'biz.unit', 'transition_status'),
    ('unit:change_status', '房源状态变更', 'biz.unit', 'change_status'),
    ('unit:force_change_status', '强制调整房源状态', 'biz.unit', 'force_change_status'),
    ('unit:status_log', '房源状态日志', 'biz.unit', 'status_log'),
    ('unit:import', '房源导入', 'biz.unit', 'import'),
    ('unit:import_template', '房源导入模板', 'biz.unit', 'import_template'),
    ('unit:export', '房源导出', 'biz.unit', 'export'),
    ('asset:read', '资产读取', 'biz.asset', 'read'),
    ('asset:status_board', '房源状态看板', 'biz.asset', 'status_board'),
    ('asset:statistics', '资产统计', 'biz.asset', 'statistics'),
    ('asset:statistics:read', '资产统计读取', 'biz.asset', 'statistics:read'),
    ('asset:park:list', '园区列表', 'asset.park', 'list'),
    ('asset:park:create', '新增园区', 'asset.park', 'create'),
    ('asset:park:detail', '园区详情', 'asset.park', 'detail'),
    ('asset:park:update', '编辑园区', 'asset.park', 'update'),
    ('asset:park:delete', '删除园区', 'asset.park', 'delete'),
    ('asset:building:list', '楼栋列表', 'asset.building', 'list'),
    ('asset:building:create', '新增楼栋', 'asset.building', 'create'),
    ('asset:building:detail', '楼栋详情', 'asset.building', 'detail'),
    ('asset:building:update', '编辑楼栋', 'asset.building', 'update'),
    ('asset:building:delete', '删除楼栋', 'asset.building', 'delete'),
    ('asset:floor:list', '楼层列表', 'asset.floor', 'list'),
    ('asset:floor:create', '新增楼层', 'asset.floor', 'create'),
    ('asset:floor:detail', '楼层详情', 'asset.floor', 'detail'),
    ('asset:floor:update', '编辑楼层', 'asset.floor', 'update'),
    ('asset:floor:delete', '删除楼层', 'asset.floor', 'delete'),
    ('asset:unit:list', '房源列表', 'asset.unit', 'list'),
    ('asset:unit:create', '新增房源', 'asset.unit', 'create'),
    ('asset:unit:detail', '房源详情', 'asset.unit', 'detail'),
    ('asset:unit:update', '编辑房源', 'asset.unit', 'update'),
    ('asset:unit:delete', '删除房源', 'asset.unit', 'delete'),
    ('invest:read', '招商租赁读取', 'leasing', 'read'),
    ('contract:read', '合同读取', 'leasing.contract', 'read'),
    ('ar:read', '应收读取', 'leasing.receivable', 'read'),
    ('wo:read', '工单读取', 'workorder', 'read'),
    ('iot:read', 'IoT 平台读取', 'iot', 'read'),
    ('energy:read', '能耗读取', 'energy', 'read'),
    ('robot:read', '机器人运营读取', 'robot', 'read'),
    ('video:read', '视频安防读取', 'video', 'read'),
    ('bim:read', '数字孪生读取', 'bim', 'read'),
    ('ai:read', 'AI 助手读取', 'ai', 'read'),
    ('cockpit:read', '经营驾驶舱读取', 'cockpit', 'read')
),
permission_groups(code, name, parent_code, resource, action, permission_type, perm_type, sort_no) AS (
  VALUES
    ('system', '系统管理', NULL, 'system', 'menu', 'menu', 10, 10),
    ('system:org', '组织管理', 'system', 'system.org', 'page', 'page', 20, 10),
    ('system:user', '用户管理', 'system', 'system.user', 'page', 'page', 20, 20),
    ('system:role', '角色管理', 'system', 'system.role', 'page', 'page', 20, 30),
    ('system:permission', '权限管理', 'system', 'system.permission', 'page', 'page', 20, 40),
    ('system:data-scope', '数据权限', 'system', 'system.data-scope', 'page', 'page', 20, 50),
    ('system:field-policy', '字段权限', 'system', 'system.field-policy', 'page', 'page', 20, 60),
    ('system:code-rule', '编码规则', 'system', 'system.code-rule', 'page', 'page', 20, 70),
    ('system:module', '模块授权', 'system', 'system.module', 'page', 'page', 20, 80),
    ('system:dict-type', '字典管理', 'system', 'system.dict-type', 'page', 'page', 20, 90),
    ('system:dict-item', '字典项', 'system:dict-type', 'system.dict-item', 'page', 'page', 20, 100),
    ('system:file', '附件中心', 'system', 'system.file', 'page', 'page', 20, 110),
    ('system:audit', '审计日志', 'system', 'system.audit', 'page', 'page', 20, 120),
    ('asset', '资产经营', NULL, 'asset', 'menu', 'menu', 10, 20),
    ('asset:park', '园区管理', 'asset', 'asset.park', 'page', 'page', 20, 10),
    ('asset:building', '楼栋管理', 'asset', 'asset.building', 'page', 'page', 20, 20),
    ('asset:floor', '楼层管理', 'asset', 'asset.floor', 'page', 'page', 20, 30),
    ('asset:unit', '房源管理', 'asset', 'asset.unit', 'page', 'page', 20, 40),
    ('asset:dashboard', '资产统计与看板', 'asset', 'asset.dashboard', 'page', 'page', 20, 50),
    ('leasing', '招商租赁', NULL, 'leasing', 'menu', 'menu', 10, 30),
    ('leasing:invest', '招商运营', 'leasing', 'leasing.invest', 'page', 'page', 20, 10),
    ('leasing:contract', '合同管理', 'leasing', 'leasing.contract', 'page', 'page', 20, 20),
    ('leasing:receivable', '应收账单', 'leasing', 'leasing.receivable', 'page', 'page', 20, 30),
    ('workorder', '工单管理', NULL, 'workorder', 'menu', 'menu', 10, 40),
    ('workorder:center', '工单中心', 'workorder', 'workorder.center', 'page', 'page', 20, 10),
    ('iot', 'IoT 平台', NULL, 'iot', 'menu', 'menu', 10, 50),
    ('iot:overview', 'IoT 总览', 'iot', 'iot.overview', 'page', 'page', 20, 10),
    ('energy', '能耗管理', NULL, 'energy', 'menu', 'menu', 10, 60),
    ('energy:overview', '能耗总览', 'energy', 'energy.overview', 'page', 'page', 20, 10),
    ('robot', '机器人运营', NULL, 'robot', 'menu', 'menu', 10, 70),
    ('robot:overview', '机器人总览', 'robot', 'robot.overview', 'page', 'page', 20, 10),
    ('video', '视频安防', NULL, 'video', 'menu', 'menu', 10, 80),
    ('video:overview', '视频总览', 'video', 'video.overview', 'page', 'page', 20, 10),
    ('bim', '数字孪生', NULL, 'bim', 'menu', 'menu', 10, 90),
    ('bim:overview', 'BIM 总览', 'bim', 'bim.overview', 'page', 'page', 20, 10),
    ('ai', 'AI 助手', NULL, 'ai', 'menu', 'menu', 10, 100),
    ('ai:assistant', 'AI 助手', 'ai', 'ai.assistant', 'page', 'page', 20, 10),
    ('cockpit', '经营驾驶舱', NULL, 'cockpit', 'menu', 'menu', 10, 110)
),
permission_nodes(code, name, parent_code, resource, action, permission_type, perm_type, sort_no) AS (
  SELECT code, name, parent_code, resource, action, permission_type, perm_type, sort_no
  FROM permission_groups
  UNION ALL
  SELECT
    leaf_permissions.code,
    leaf_permissions.name,
    CASE
      WHEN leaf_permissions.code LIKE 'system:org:%' THEN 'system:org'
      WHEN leaf_permissions.code LIKE 'system:user:%' THEN 'system:user'
      WHEN leaf_permissions.code LIKE 'system:role:%' THEN 'system:role'
      WHEN leaf_permissions.code LIKE 'role:%' THEN 'system:role'
      WHEN leaf_permissions.code LIKE 'tenant:%' THEN 'system'
      WHEN leaf_permissions.code LIKE 'system:permission:%' THEN 'system:permission'
      WHEN leaf_permissions.code LIKE 'permission:%' THEN 'system:permission'
      WHEN leaf_permissions.code LIKE 'system:data-scope:%' THEN 'system:data-scope'
      WHEN leaf_permissions.code LIKE 'data_scope:%' THEN 'system:data-scope'
      WHEN leaf_permissions.code LIKE 'system:field-policy:%' THEN 'system:field-policy'
      WHEN leaf_permissions.code LIKE 'field_policy:%' THEN 'system:field-policy'
      WHEN leaf_permissions.code LIKE 'system:code-rule:%' THEN 'system:code-rule'
      WHEN leaf_permissions.code LIKE 'code_rule:%' THEN 'system:code-rule'
      WHEN leaf_permissions.code LIKE 'system:module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:plan:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:tenant-module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'plan:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'tenant_module:%' THEN 'system:module'
      WHEN leaf_permissions.code LIKE 'system:dict-type:%' THEN 'system:dict-type'
      WHEN leaf_permissions.code LIKE 'system:dict-item:%' THEN 'system:dict-item'
      WHEN leaf_permissions.code LIKE 'system:attachment:%' THEN 'system:file'
      WHEN leaf_permissions.code LIKE 'system:audit:%' THEN 'system:audit'
      WHEN leaf_permissions.code LIKE 'file:%' THEN 'system:file'
      WHEN leaf_permissions.code LIKE 'audit:%' THEN 'system:audit'
      WHEN leaf_permissions.code LIKE 'park:%' THEN 'asset:park'
      WHEN leaf_permissions.code LIKE 'asset:park:%' THEN 'asset:park'
      WHEN leaf_permissions.code LIKE 'building:%' THEN 'asset:building'
      WHEN leaf_permissions.code LIKE 'asset:building:%' THEN 'asset:building'
      WHEN leaf_permissions.code LIKE 'floor:%' THEN 'asset:floor'
      WHEN leaf_permissions.code LIKE 'asset:floor:%' THEN 'asset:floor'
      WHEN leaf_permissions.code LIKE 'unit:%' THEN 'asset:unit'
      WHEN leaf_permissions.code LIKE 'asset:unit:%' THEN 'asset:unit'
      WHEN leaf_permissions.code IN ('asset:read', 'asset:status_board', 'asset:statistics', 'asset:statistics:read') THEN 'asset:dashboard'
      WHEN leaf_permissions.code = 'invest:read' THEN 'leasing:invest'
      WHEN leaf_permissions.code = 'contract:read' THEN 'leasing:contract'
      WHEN leaf_permissions.code = 'ar:read' THEN 'leasing:receivable'
      WHEN leaf_permissions.code = 'wo:read' THEN 'workorder:center'
      WHEN leaf_permissions.code = 'iot:read' THEN 'iot:overview'
      WHEN leaf_permissions.code = 'energy:read' THEN 'energy:overview'
      WHEN leaf_permissions.code = 'robot:read' THEN 'robot:overview'
      WHEN leaf_permissions.code = 'video:read' THEN 'video:overview'
      WHEN leaf_permissions.code = 'bim:read' THEN 'bim:overview'
      WHEN leaf_permissions.code = 'ai:read' THEN 'ai:assistant'
      WHEN leaf_permissions.code = 'cockpit:read' THEN 'cockpit'
      ELSE NULL
    END,
    leaf_permissions.resource,
    leaf_permissions.action,
    'api',
    40,
    100
  FROM leaf_permissions
),
permission_tree(code, name, parent_code, resource, action, permission_type, perm_type, sort_no, perm_path, level) AS (
  SELECT
    permission_nodes.code,
    permission_nodes.name,
    permission_nodes.parent_code,
    permission_nodes.resource,
    permission_nodes.action,
    permission_nodes.permission_type,
    permission_nodes.perm_type,
    permission_nodes.sort_no,
    permission_nodes.code::varchar(500),
    1
  FROM permission_nodes
  WHERE permission_nodes.parent_code IS NULL
  UNION ALL
  SELECT
    child.code,
    child.name,
    child.parent_code,
    child.resource,
    child.action,
    child.permission_type,
    child.perm_type,
    child.sort_no,
    (parent.perm_path || '/' || child.code)::varchar(500),
    parent.level + 1
  FROM permission_nodes child
  JOIN permission_tree parent ON parent.code = child.parent_code
),
upsert_permissions AS (
  INSERT INTO sys_permission (
    tenant_id,
    park_id,
    code,
    name,
    parent_id,
    resource,
    action,
    permission_path,
    perm_path,
    permission_level,
    level,
    sort_no,
    permission_type,
    perm_type,
    api_method,
    api_path,
    frontend_route,
    component_key,
    field_key,
    data_dimension,
    is_system,
    is_builtin,
    is_tenant_custom,
    visible,
    is_enabled,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    permission_tree.code,
    permission_tree.name,
    NULL,
    permission_tree.resource,
    permission_tree.action,
    permission_tree.perm_path,
    permission_tree.perm_path,
    permission_tree.level,
    permission_tree.level,
    permission_tree.sort_no,
    permission_tree.permission_type,
    permission_tree.perm_type,
    NULL,
    NULL,
    CASE permission_tree.code
      WHEN 'system' THEN NULL
      WHEN 'system:org' THEN '/system/orgs'
      WHEN 'system:user' THEN '/system/users'
      WHEN 'system:role' THEN '/system/roles'
      WHEN 'system:permission' THEN '/system/permissions'
      WHEN 'system:data-scope' THEN '/system/roles'
      WHEN 'system:field-policy' THEN '/system/roles'
      WHEN 'system:code-rule' THEN '/system/code-rules'
      WHEN 'system:module' THEN '/system/modules'
      WHEN 'system:dict-type' THEN '/system/dicts'
      WHEN 'system:dict-item' THEN '/system/dicts'
      WHEN 'system:file' THEN '/system/files'
      WHEN 'system:audit' THEN '/system/audit/op-logs'
      WHEN 'asset' THEN NULL
      WHEN 'asset:park' THEN '/assets/parks'
      WHEN 'asset:building' THEN '/assets/buildings'
      WHEN 'asset:floor' THEN '/assets/floors'
      WHEN 'asset:unit' THEN '/assets/units'
      WHEN 'asset:dashboard' THEN '/assets/statistics'
      WHEN 'leasing:invest' THEN '/invest/leads'
      WHEN 'leasing:contract' THEN '/contracts'
      WHEN 'leasing:receivable' THEN '/finance/receivables'
      WHEN 'workorder:center' THEN '/workorders'
      WHEN 'iot:overview' THEN '/iot/overview'
      WHEN 'energy:overview' THEN '/energy/overview'
      WHEN 'robot:overview' THEN '/robots/overview'
      WHEN 'video:overview' THEN '/video/overview'
      WHEN 'bim:overview' THEN '/bim/overview'
      WHEN 'ai:assistant' THEN '/ai/assistant'
      ELSE NULL
    END,
    NULL,
    NULL,
    NULL,
    true,
    true,
    false,
    true,
    true,
    'enabled',
    'System built-in permission seed'
  FROM permission_tree
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
    name = EXCLUDED.name,
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
    field_key = EXCLUDED.field_key,
    data_dimension = EXCLUDED.data_dimension,
    is_system = true,
    is_builtin = true,
    is_tenant_custom = false,
    visible = true,
    is_enabled = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, code
)
UPDATE sys_permission child
SET parent_id = parent_permission.id,
    permission_path = permission_tree.perm_path,
    perm_path = permission_tree.perm_path,
    permission_level = permission_tree.level,
    level = permission_tree.level,
    update_time = now()
FROM permission_tree
JOIN upsert_permissions current_permission
  ON current_permission.code = permission_tree.code
LEFT JOIN upsert_permissions parent_permission
  ON parent_permission.code = permission_tree.parent_code
WHERE child.id = current_permission.id;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
permission_parent_map AS (
  SELECT
    child.id AS child_id,
    parent.id AS parent_id
  FROM sys_permission child
  JOIN seed_scope
    ON seed_scope.tenant_id = child.tenant_id
   AND seed_scope.park_id = child.park_id
  LEFT JOIN sys_permission parent
    ON parent.tenant_id = child.tenant_id
   AND parent.park_id = child.park_id
   AND parent.is_deleted = false
   AND parent.code = CASE
      WHEN child.code IN ('system', 'asset', 'leasing', 'workorder', 'iot', 'energy', 'robot', 'video', 'bim', 'ai', 'cockpit') THEN NULL
      WHEN child.code IN ('system:org', 'system:user', 'system:role', 'system:permission', 'system:data-scope', 'system:field-policy', 'system:code-rule', 'system:module', 'system:dict-type', 'system:file', 'system:audit') THEN 'system'
      WHEN child.code = 'system:dict-item' THEN 'system:dict-type'
      WHEN child.code IN ('asset:park', 'asset:building', 'asset:floor', 'asset:unit', 'asset:dashboard') THEN 'asset'
      WHEN child.code IN ('leasing:invest', 'leasing:contract', 'leasing:receivable') THEN 'leasing'
      WHEN child.code = 'workorder:center' THEN 'workorder'
      WHEN child.code = 'iot:overview' THEN 'iot'
      WHEN child.code = 'energy:overview' THEN 'energy'
      WHEN child.code = 'robot:overview' THEN 'robot'
      WHEN child.code = 'video:overview' THEN 'video'
      WHEN child.code = 'bim:overview' THEN 'bim'
      WHEN child.code = 'ai:assistant' THEN 'ai'
      WHEN child.code LIKE 'system:org:%' THEN 'system:org'
      WHEN child.code LIKE 'system:user:%' THEN 'system:user'
      WHEN child.code LIKE 'system:role:%' THEN 'system:role'
      WHEN child.code LIKE 'role:%' THEN 'system:role'
      WHEN child.code LIKE 'tenant:%' THEN 'system'
      WHEN child.code LIKE 'system:permission:%' THEN 'system:permission'
      WHEN child.code LIKE 'permission:%' THEN 'system:permission'
      WHEN child.code LIKE 'system:data-scope:%' THEN 'system:data-scope'
      WHEN child.code LIKE 'data_scope:%' THEN 'system:data-scope'
      WHEN child.code LIKE 'system:field-policy:%' THEN 'system:field-policy'
      WHEN child.code LIKE 'field_policy:%' THEN 'system:field-policy'
      WHEN child.code LIKE 'system:code-rule:%' THEN 'system:code-rule'
      WHEN child.code LIKE 'code_rule:%' THEN 'system:code-rule'
      WHEN child.code LIKE 'system:module:%' THEN 'system:module'
      WHEN child.code LIKE 'system:plan:%' THEN 'system:module'
      WHEN child.code LIKE 'system:tenant-module:%' THEN 'system:module'
      WHEN child.code LIKE 'module:%' THEN 'system:module'
      WHEN child.code LIKE 'plan:%' THEN 'system:module'
      WHEN child.code LIKE 'tenant_module:%' THEN 'system:module'
      WHEN child.code LIKE 'system:dict-type:%' THEN 'system:dict-type'
      WHEN child.code LIKE 'system:dict-item:%' THEN 'system:dict-item'
      WHEN child.code LIKE 'system:attachment:%' THEN 'system:file'
      WHEN child.code LIKE 'system:audit:%' THEN 'system:audit'
      WHEN child.code LIKE 'file:%' THEN 'system:file'
      WHEN child.code LIKE 'audit:%' THEN 'system:audit'
      WHEN child.code LIKE 'park:%' THEN 'asset:park'
      WHEN child.code LIKE 'asset:park:%' THEN 'asset:park'
      WHEN child.code LIKE 'building:%' THEN 'asset:building'
      WHEN child.code LIKE 'asset:building:%' THEN 'asset:building'
      WHEN child.code LIKE 'floor:%' THEN 'asset:floor'
      WHEN child.code LIKE 'asset:floor:%' THEN 'asset:floor'
      WHEN child.code LIKE 'unit:%' THEN 'asset:unit'
      WHEN child.code LIKE 'asset:unit:%' THEN 'asset:unit'
      WHEN child.code IN ('asset:read', 'asset:status_board', 'asset:statistics', 'asset:statistics:read') THEN 'asset:dashboard'
      WHEN child.code = 'invest:read' THEN 'leasing:invest'
      WHEN child.code = 'contract:read' THEN 'leasing:contract'
      WHEN child.code = 'ar:read' THEN 'leasing:receivable'
      WHEN child.code = 'wo:read' THEN 'workorder:center'
      WHEN child.code = 'iot:read' THEN 'iot:overview'
      WHEN child.code = 'energy:read' THEN 'energy:overview'
      WHEN child.code = 'robot:read' THEN 'robot:overview'
      WHEN child.code = 'video:read' THEN 'video:overview'
      WHEN child.code = 'bim:read' THEN 'bim:overview'
      WHEN child.code = 'ai:read' THEN 'ai:assistant'
      WHEN child.code = 'cockpit:read' THEN 'cockpit'
      ELSE NULL
    END
  WHERE child.is_deleted = false
)
UPDATE sys_permission permission
SET parent_id = permission_parent_map.parent_id,
    update_time = now()
FROM permission_parent_map
WHERE permission.id = permission_parent_map.child_id;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
data_scope_rules(rule_code, rule_name, dimension, scope_type, scope_config, remark) AS (
  VALUES
    ('all_parks', '全部园区', 'park', 'all', '{}'::jsonb, 'Production-safe data scope rule for all parks'),
    ('current_park', '当前园区', 'park', 'park', '{}'::jsonb, 'Production-safe data scope rule for current park'),
    ('self_only', '仅本人', 'customer_owner', 'self', '{}'::jsonb, 'Production-safe data scope rule for self-owned data'),
    ('org_and_children', '本部门及下级', 'org', 'org_and_children', '{}'::jsonb, 'Production-safe data scope rule for organization tree')
)
INSERT INTO sys_data_scope_rule (
  tenant_id,
  park_id,
  rule_code,
  rule_name,
  dimension,
  scope_type,
  scope_config,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  data_scope_rules.rule_code,
  data_scope_rules.rule_name,
  data_scope_rules.dimension,
  data_scope_rules.scope_type,
  data_scope_rules.scope_config,
  'enabled',
  data_scope_rules.remark
FROM data_scope_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  dimension = EXCLUDED.dimension,
  scope_type = EXCLUDED.scope_type,
  scope_config = EXCLUDED.scope_config,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
field_policies(module, entity, field_key, field_name, policy_type, mask_rule, remark) AS (
  VALUES
    ('system', 'user', 'mobile', '手机号', 'masked', 'mobile', 'Sensitive mobile number default policy'),
    ('system', 'user', 'id_card_no', '身份证号', 'masked', 'id_card', 'Sensitive identity number default policy'),
    ('finance', 'bank_account', 'bank_account_no', '银行账号', 'masked', 'bank_account', 'Sensitive bank account default policy'),
    ('contract', 'contract', 'contract_amount', '合同金额', 'masked', 'amount', 'Sensitive contract amount default policy'),
    ('finance', 'receivable', 'amount', '应收金额', 'masked', 'amount', 'Receivable amount default masked policy'),
    ('finance', 'payment', 'amount', '收款金额', 'hidden', 'amount', 'Payment amount default hidden policy'),
    ('finance', 'bank_account', 'bank_account', '银行账号', 'masked', 'bank_account', 'Generic bank account default policy'),
    ('system', 'person', 'id_card', '身份证号', 'masked', 'id_card', 'Generic ID card default policy'),
    ('contract', 'attachment', 'contract_attachment', '合同附件', 'visible', 'file_name', 'Contract attachment default policy'),
    ('system', 'sys_user', 'mobile', '用户手机号', 'masked', 'mobile', 'sys_user.mobile default field policy'),
    ('tenant', 'biz_tenant', 'contact_mobile', '租户联系人手机号', 'masked', 'mobile', 'biz_tenant.contact_mobile default field policy'),
    ('tenant', 'biz_tenant', 'legal_person_id', '法人身份证号', 'masked', 'id_card', 'biz_tenant.legal_person_id default field policy'),
    ('contract', 'biz_contract', 'total_amount', '合同总金额', 'masked', 'amount', 'biz_contract.total_amount default field policy'),
    ('payment', 'biz_payment', 'bank_serial', '银行流水号', 'masked', 'bank_account', 'biz_payment.bank_serial default field policy'),
    ('system', 'sys_file', 'file_url', '文件访问地址', 'masked', 'custom', 'sys_file.file_url default field policy'),
    ('asset', 'unit', 'refPrice', '房源参考租金', 'masked', 'amount', 'asset unit reference price default field policy'),
    ('asset', 'unit', 'floorplanUrl', '房源平面图地址', 'masked', 'custom', 'asset unit floorplan url default field policy'),
    ('asset', 'floor', 'layoutUrl', '楼层平面图地址', 'masked', 'custom', 'asset floor layout url default field policy')
)
INSERT INTO sys_field_policy (
  tenant_id,
  park_id,
  module,
  entity,
  field_key,
  field_name,
  policy_type,
  mask_rule,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  field_policies.module,
  field_policies.entity,
  field_policies.field_key,
  field_policies.field_name,
  field_policies.policy_type,
  field_policies.mask_rule,
  'enabled',
  field_policies.remark
FROM field_policies
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, module, entity, field_key) WHERE is_deleted = false DO UPDATE SET
  field_name = EXCLUDED.field_name,
  policy_type = EXCLUDED.policy_type,
  mask_rule = EXCLUDED.mask_rule,
  status = EXCLUDED.status,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id,
    '00000000-0000-4000-8000-000000000201'::uuid AS org_id,
    '00000000-0000-4000-8000-000000002001'::uuid AS super_admin_role_id,
    '00000000-0000-4000-8000-000000002003'::uuid AS system_admin_role_id,
    '00000000-0000-4000-8000-000000002004'::uuid AS auditor_role_id,
    '00000000-0000-4000-8000-000000002101'::uuid AS operations_owner_role_id,
    '00000000-0000-4000-8000-000000002102'::uuid AS executive_role_id,
    '00000000-0000-4000-8000-000000002103'::uuid AS invest_manager_role_id,
    '00000000-0000-4000-8000-000000002104'::uuid AS invest_specialist_role_id
),
default_park AS (
  INSERT INTO sys_org (
    id,
    tenant_id,
    park_id,
    org_code,
    org_name,
    org_type,
    sort_order,
    status,
    remark
  )
  SELECT
    org_id,
    tenant_id,
    park_id,
    'JH_ROOT',
    '金湖科创产业园',
    'park',
    0,
    'enabled',
    'Production-safe default park organization'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false DO UPDATE SET
    org_name = EXCLUDED.org_name,
    org_type = EXCLUDED.org_type,
    sort_order = EXCLUDED.sort_order,
    status = 'enabled',
    is_deleted = false,
    update_time = now()
  RETURNING id
),
roles(id, code, name, role_type, role_scope, data_scope, is_super, sort_no, remark) AS (
  SELECT super_admin_role_id, 'SUPER_ADMIN', '超级管理员', 'system', 'platform', 'all', true, 10, 'Built-in super administrator role template. Assign to a real user after secure account provisioning.'
  FROM seed_scope
  UNION ALL
  SELECT system_admin_role_id, 'SYSTEM_ADMIN', '系统管理员', 'system', 'platform', 'park', false, 20, 'Default system administration role template.'
  FROM seed_scope
  UNION ALL
  SELECT auditor_role_id, 'AUDITOR', '审计员', 'system', 'platform', 'park', false, 30, 'Default audit read-only role template.'
  FROM seed_scope
  UNION ALL
  SELECT operations_owner_role_id, 'OPERATIONS_OWNER', '运营负责人', 'park', 'park', 'park', false, 40, 'Default asset management role template.'
  FROM seed_scope
  UNION ALL
  SELECT executive_role_id, 'EXECUTIVE', '高层', 'tenant', 'tenant', 'park', false, 50, 'Default asset read-only executive role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_manager_role_id, 'INVEST_MANAGER', '招商主管', 'park', 'park', 'self', false, 60, 'Default investment manager role template.'
  FROM seed_scope
  UNION ALL
  SELECT invest_specialist_role_id, 'INVEST_SPECIALIST', '招商专员', 'park', 'park', 'self', false, 70, 'Default investment specialist role template.'
  FROM seed_scope
)
INSERT INTO sys_role (
  id,
  tenant_id,
  park_id,
  code,
  name,
  parent_id,
  role_path,
  role_level,
  level,
  sort_no,
  role_type,
  role_scope,
  data_scope,
  data_scope_config,
  is_template,
  is_system,
  is_builtin,
  is_super,
  editable,
  is_editable,
  is_deletable,
  is_enabled,
  status,
  remark
)
SELECT
  roles.id,
  seed_scope.tenant_id,
  seed_scope.park_id,
  roles.code,
  roles.name,
  NULL,
  roles.code,
  1,
  1,
  roles.sort_no,
  roles.role_type,
  roles.role_scope,
  roles.data_scope,
  '{}'::jsonb,
  true,
  roles.code = 'SUPER_ADMIN',
  roles.code = 'SUPER_ADMIN',
  roles.is_super,
  true,
  true,
  roles.code <> 'SUPER_ADMIN',
  true,
  'enabled',
  roles.remark
FROM roles
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, code) WHERE is_deleted = false DO UPDATE SET
  name = EXCLUDED.name,
  role_path = EXCLUDED.role_path,
  role_level = EXCLUDED.role_level,
  level = EXCLUDED.level,
  sort_no = EXCLUDED.sort_no,
  role_type = EXCLUDED.role_type,
  role_scope = EXCLUDED.role_scope,
  data_scope = EXCLUDED.data_scope,
  is_template = EXCLUDED.is_template,
  is_system = EXCLUDED.is_system,
  is_builtin = EXCLUDED.is_builtin,
  is_super = EXCLUDED.is_super,
  editable = true,
  is_editable = true,
  is_deletable = EXCLUDED.is_deletable,
  is_enabled = true,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
role_rule_codes(role_code, rule_code) AS (
  VALUES
    ('SUPER_ADMIN', 'all_parks'),
    ('SYSTEM_ADMIN', 'current_park'),
    ('AUDITOR', 'current_park'),
    ('OPERATIONS_OWNER', 'current_park'),
    ('EXECUTIVE', 'current_park'),
    ('INVEST_MANAGER', 'self_only'),
    ('INVEST_SPECIALIST', 'self_only')
),
role_data_scope_links AS (
  SELECT
    role.tenant_id,
    role.park_id,
    role.id AS role_id,
    data_scope_rule.id AS rule_id
  FROM role_rule_codes
  JOIN seed_scope ON true
  JOIN sys_role role
    ON role.tenant_id = seed_scope.tenant_id
   AND role.park_id = seed_scope.park_id
   AND role.code = role_rule_codes.role_code
   AND role.is_deleted = false
  JOIN sys_data_scope_rule data_scope_rule
    ON data_scope_rule.tenant_id = seed_scope.tenant_id
   AND data_scope_rule.park_id = seed_scope.park_id
   AND data_scope_rule.rule_code = role_rule_codes.rule_code
   AND data_scope_rule.is_deleted = false
)
INSERT INTO rel_role_data_scope (
  tenant_id,
  park_id,
  role_id,
  rule_id,
  remark
)
SELECT
  tenant_id,
  park_id,
  role_id,
  rule_id,
  'Production-safe built-in role data scope seed'
FROM role_data_scope_links
ON CONFLICT (tenant_id, role_id, rule_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  remark = EXCLUDED.remark,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
asset_seed_roles AS (
  SELECT role.id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code IN ('EXECUTIVE', 'OPERATIONS_OWNER', 'INVEST_MANAGER', 'INVEST_SPECIALIST')
    AND role.is_deleted = false
),
asset_seed_permissions AS (
  SELECT permission.id, permission.tenant_id, permission.park_id
  FROM sys_permission permission
  JOIN seed_scope
    ON seed_scope.tenant_id = permission.tenant_id
   AND seed_scope.park_id = permission.park_id
  WHERE permission.is_deleted = false
    AND (
      permission.code LIKE 'park:%'
      OR permission.code LIKE 'building:%'
      OR permission.code LIKE 'floor:%'
      OR permission.code LIKE 'unit:%'
      OR permission.code IN ('asset:read', 'asset:status_board', 'asset:statistics', 'asset:statistics:read')
    )
)
UPDATE rel_role_perm relation
SET is_deleted = true,
    update_time = now()
FROM asset_seed_roles role,
     asset_seed_permissions permission
WHERE relation.tenant_id = role.tenant_id
  AND relation.park_id = role.park_id
  AND relation.role_id = role.id
  AND relation.permission_id = permission.id
  AND relation.is_deleted = false;

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
role_permissions AS (
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SUPER_ADMIN'
    AND role.is_deleted = false
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'SYSTEM_ADMIN'
    AND role.is_deleted = false
    AND (
      permission.code LIKE 'system:%'
      OR permission.code LIKE 'asset:%'
      OR permission.code LIKE 'park:%'
      OR permission.code LIKE 'building:%'
      OR permission.code LIKE 'floor:%'
      OR permission.code LIKE 'unit:%'
      OR permission.code IN ('file:read', 'file:upload', 'file:download', 'file:delete')
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'AUDITOR'
    AND role.is_deleted = false
    AND permission.code IN ('system:user:me', 'audit:read', 'system:audit:login-log:list', 'system:audit:op-log:list')
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'OPERATIONS_OWNER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'file:read',
      'file:upload',
      'file:download',
      'file:delete',
      'park:read',
      'building:read',
      'building:create',
      'building:update',
      'floor:read',
      'floor:create',
      'floor:update',
      'unit:read',
      'unit:create',
      'unit:update',
      'unit:change_status',
      'unit:force_change_status',
      'unit:status_log',
      'unit:import',
      'unit:import_template',
      'unit:export',
      'asset:read',
      'asset:status_board',
      'asset:statistics'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'EXECUTIVE'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'asset:read',
      'asset:status_board',
      'asset:statistics',
      'unit:read',
      'unit:status_log'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'INVEST_MANAGER'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'unit:read',
      'unit:change_status',
      'unit:status_log',
      'asset:read',
      'asset:statistics',
      'asset:status_board'
    )
  UNION ALL
  SELECT role.id AS role_id, permission.id AS permission_id, role.tenant_id, role.park_id
  FROM sys_role role
  JOIN sys_permission permission
    ON permission.tenant_id = role.tenant_id
   AND permission.park_id = role.park_id
   AND permission.is_deleted = false
  JOIN seed_scope
    ON seed_scope.tenant_id = role.tenant_id
   AND seed_scope.park_id = role.park_id
  WHERE role.code = 'INVEST_SPECIALIST'
    AND role.is_deleted = false
    AND permission.code IN (
      'system:user:me',
      'system:dict-type:list',
      'system:dict-item:list',
      'asset:status_board',
      'unit:read'
    )
)
INSERT INTO rel_role_perm (
  tenant_id,
  park_id,
  role_id,
  permission_id,
  remark
)
SELECT
  role_permissions.tenant_id,
  role_permissions.park_id,
  role_permissions.role_id,
  role_permissions.permission_id,
  'Production-safe built-in role permission seed'
FROM role_permissions
ON CONFLICT (tenant_id, park_id, role_id, permission_id) WHERE is_deleted = false DO UPDATE SET
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
code_rules(entity_type, rule_code, rule_name, target_module, target_entity, prefix, pattern, date_pattern, sequence_length, reset_policy, separator, example_code, sort_remark) AS (
  VALUES
    ('park', 'PARK_CODE', '园区编码规则', 'asset', 'park', 'PK-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'PK-001', 'SaaS park code rule seed'),
    ('building', 'BUILDING_CODE', '楼栋编码规则', 'asset', 'building', 'BD-', '{PREFIX}{SEQ:2}', NULL, 2, 'none', '', 'BD-01', 'SaaS building code rule seed'),
    ('floor', 'FLOOR_CODE', '楼层编码规则', 'asset', 'floor', 'FL-', '{PREFIX}{SEQ:2}', NULL, 2, 'none', '', 'FL-03', 'SaaS floor code rule seed'),
    ('room', 'ROOM_CODE', '房间编码规则', 'asset', 'room', 'ROOM-', '{PREFIX}{SEQ:4}', NULL, 4, 'none', '', 'ROOM-0301', 'SaaS room code rule seed'),
    ('unit', 'UNIT_CODE', '房源编码规则', 'asset', 'unit', 'UNIT-', '{PREFIX}{SEQ:4}', NULL, 4, 'none', '', 'UNIT-0301', 'SaaS unit code rule seed'),
    ('zone', 'ZONE_CODE', '分区编码规则', 'asset', 'zone', 'ZONE-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'ZONE-001', 'SaaS zone code rule seed'),
    ('asset', 'ASSET_CODE', '资产编码规则', 'asset', 'asset', 'AST-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'AST-000001', 'SaaS asset code rule seed'),
    ('device', 'DEVICE_CODE', '设备编码规则', 'iot', 'device', 'EQ-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'EQ-000001', 'SaaS device code rule seed'),
    ('camera', 'CAMERA_CODE', '摄像头编码规则', 'video', 'camera', 'CAM-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'CAM-001', 'SaaS camera code rule seed'),
    ('iot_point', 'IOT_POINT_CODE', 'IoT 点位编码规则', 'iot', 'iot_point', 'IOT-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'IOT-001', 'SaaS IoT point code rule seed'),
    ('robot', 'ROBOT_CODE', '机器人编码规则', 'robot', 'robot', 'RB-', '{PREFIX}{SEQ:6}', NULL, 6, 'none', '', 'RB-000001', 'SaaS robot code rule seed'),
    ('cleaning_robot', 'CLEANING_ROBOT_CODE', '清洁机器人编码规则', 'robot', 'cleaning_robot', 'CLN-RB-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'CLN-RB-001', 'SaaS cleaning robot code rule seed'),
    ('inspection_robot', 'INSPECTION_ROBOT_CODE', '巡检机器人编码规则', 'robot', 'inspection_robot', 'INS-RB-', '{PREFIX}{SEQ:3}', NULL, 3, 'none', '', 'INS-RB-001', 'SaaS inspection robot code rule seed'),
    ('workorder', 'WORKORDER_CODE', '工单编码规则', 'workorder', 'workorder', 'WO-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'daily', '', 'WO-20260515000001', 'SaaS workorder code rule seed'),
    ('contract', 'CONTRACT_CODE', '合同编码规则', 'contract', 'contract', 'CT-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'daily', '', 'CT-20260515000001', 'SaaS contract code rule seed'),
    ('bill', 'BILL_CODE', '账单编码规则', 'finance', 'bill', 'BILL-', '{PREFIX}{DATE:yyyyMMdd}{SEQ:6}', 'yyyyMMdd', 6, 'monthly', '', 'BILL-20260515000001', 'SaaS bill code rule seed')
)
INSERT INTO sys_code_rule (
  tenant_id,
  park_id,
  entity_type,
  rule_code,
  rule_name,
  target_module,
  target_entity,
  prefix,
  pattern,
  date_pattern,
  sequence_length,
  current_seq,
  current_sequence,
  reset_policy,
  reset_strategy,
  separator,
  example_code,
  sample_code,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  code_rules.entity_type,
  code_rules.rule_code,
  code_rules.rule_name,
  code_rules.target_module,
  code_rules.target_entity,
  code_rules.prefix,
  code_rules.pattern,
  code_rules.date_pattern,
  code_rules.sequence_length,
  0,
  0,
  code_rules.reset_policy,
  code_rules.reset_policy,
  code_rules.separator,
  code_rules.example_code,
  code_rules.example_code,
  'enabled',
  code_rules.sort_remark
FROM code_rules
CROSS JOIN seed_scope
ON CONFLICT (tenant_id, park_id, rule_code) WHERE is_deleted = false DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  entity_type = EXCLUDED.entity_type,
  target_module = EXCLUDED.target_module,
  target_entity = EXCLUDED.target_entity,
  prefix = EXCLUDED.prefix,
  pattern = EXCLUDED.pattern,
  date_pattern = EXCLUDED.date_pattern,
  sequence_length = EXCLUDED.sequence_length,
  reset_policy = EXCLUDED.reset_policy,
  reset_strategy = EXCLUDED.reset_strategy,
  separator = EXCLUDED.separator,
  example_code = EXCLUDED.example_code,
  sample_code = EXCLUDED.sample_code,
  status = 'enabled',
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
modules(module_code, module_name, module_group, module_version, route_path, permission_code, icon_key, sort_no, remark) AS (
  VALUES
    ('SYSTEM_FOUNDATION', '系统基础', 'system', '1.0.0', '/system/users', 'system:read', 'shield-check', 10, 'SaaS baseline system module'),
    ('RBAC_CENTER', '权限中心', 'system', '1.0.0', '/system/roles', 'role:read', 'shield-check', 20, 'SaaS RBAC module'),
    ('CODE_RULE_CENTER', '编码规则', 'system', '1.0.0', '/system/code-rules', 'system:code-rule:read', 'binary', 30, 'SaaS code rule module'),
    ('MODULE_AUTH_CENTER', '模块授权', 'system', '1.0.0', '/system/modules', 'system:module:read', 'boxes', 40, 'SaaS module authorization module'),
    ('ASSET_FOUNDATION', '资产主数据', 'asset', '1.0.0', '/assets/parks', 'asset:read', 'building-2', 100, 'S2-A asset foundation module')
),
upsert_modules AS (
  INSERT INTO sys_module_registry (
    tenant_id,
    park_id,
    module_code,
    module_name,
    module_group,
    module_version,
    route_path,
    permission_code,
    icon_key,
    sort_no,
    is_builtin,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    modules.module_code,
    modules.module_name,
    modules.module_group,
    modules.module_version,
    modules.route_path,
    modules.permission_code,
    modules.icon_key,
    modules.sort_no,
    true,
    'enabled',
    modules.remark
  FROM modules
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, module_code) WHERE is_deleted = false DO UPDATE SET
    module_name = EXCLUDED.module_name,
    module_group = EXCLUDED.module_group,
    module_version = EXCLUDED.module_version,
    route_path = EXCLUDED.route_path,
    permission_code = EXCLUDED.permission_code,
    icon_key = EXCLUDED.icon_key,
    sort_no = EXCLUDED.sort_no,
    is_builtin = true,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, module_code
),
upsert_plan AS (
  INSERT INTO sys_plan (
    tenant_id,
    park_id,
    plan_code,
    plan_name,
    plan_type,
    module_codes,
    max_users,
    max_parks,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    'BASELINE',
    '基础版',
    'standard',
    '["SYSTEM_FOUNDATION","RBAC_CENTER","CODE_RULE_CENTER","MODULE_AUTH_CENTER","ASSET_FOUNDATION"]'::jsonb,
    0,
    0,
    'enabled',
    'SaaS baseline plan seed'
  FROM seed_scope
  ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    plan_type = EXCLUDED.plan_type,
    module_codes = EXCLUDED.module_codes,
    max_users = EXCLUDED.max_users,
    max_parks = EXCLUDED.max_parks,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id
)
INSERT INTO rel_tenant_module (
  tenant_id,
  park_id,
  tenant_code,
  module_id,
  plan_id,
  feature_config,
  status,
  remark
)
SELECT
  module.tenant_id,
  module.park_id,
  'JH_DEFAULT',
  module.id,
  plan.id,
  '{}'::jsonb,
  'enabled',
  'Default tenant module authorization seed'
FROM upsert_modules module
JOIN upsert_plan plan
  ON plan.tenant_id = module.tenant_id
 AND plan.park_id = module.park_id
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  tenant_code = EXCLUDED.tenant_code,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH saas_modules(module_code, module_name, module_group, description, route_prefix, icon, sort_no) AS (
  VALUES
    ('system', '系统管理', 'foundation', '用户、组织、角色、权限、字典、附件、审计等系统基础能力', '/system', 'shield-check', 10),
    ('asset', '资产管理', 'business', '园区、楼栋、楼层、房源、资产统计与状态看板', '/assets', 'building-2', 20),
    ('leasing', '招商租赁', 'business', '招商线索、租赁、合同与财务协同预留模块', '/invest', 'gauge', 30),
    ('workorder', '工单管理', 'business', '物业服务工单与服务统计预留模块', '/workorders', 'wrench', 40),
    ('iot', 'IoT平台', 'extension', '物联网点位、设备接入与监测预留模块', '/iot', 'radio', 50),
    ('energy', '能耗管理', 'extension', '能耗采集、分析与报表预留模块', '/energy', 'zap', 60),
    ('robot', '机器人运营', 'extension', '清洁、巡检等机器人运营预留模块', '/robots', 'bot', 70),
    ('video', '视频安防', 'extension', '摄像头、视频流与安防联动预留模块', '/video', 'video', 80),
    ('bim', '数字孪生', 'extension', 'BIM、CAD/SVG 空间数字化预留模块', '/bim', 'box', 90),
    ('ai', 'AI助手', 'extension', 'AI 运维助手与智能分析预留模块', '/ai', 'sparkles', 100)
)
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
SELECT
  module_code,
  module_name,
  module_group,
  description,
  route_prefix,
  icon,
  1,
  sort_no,
  'Production-safe SaaS module seed'
FROM saas_modules
ON CONFLICT (module_code) WHERE is_deleted = false DO UPDATE SET
  module_name = EXCLUDED.module_name,
  module_group = EXCLUDED.module_group,
  description = EXCLUDED.description,
  route_prefix = EXCLUDED.route_prefix,
  icon = EXCLUDED.icon,
  status = 1,
  sort_no = EXCLUDED.sort_no,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
plans(plan_code, plan_name, description, sort_no, module_codes) AS (
  VALUES
    ('BASIC', '基础版', '基础系统、资产与工单能力', 10, ARRAY['system','asset','workorder']),
    ('PROFESSIONAL', '专业版', '专业园区运营、IoT、能耗、机器人与视频能力', 20, ARRAY['system','asset','workorder','iot','energy','robot','video']),
    ('ENTERPRISE', '企业版', '企业级园区运营、数字孪生与 AI 能力', 30, ARRAY['system','asset','workorder','iot','energy','robot','video','bim','ai']),
    ('GROUP', '集团版', '集团多园区全模块能力', 40, ARRAY['system','asset','leasing','workorder','iot','energy','robot','video','bim','ai'])
),
upsert_plans AS (
  INSERT INTO sys_plan (
    tenant_id,
    park_id,
    plan_code,
    plan_name,
    description,
    plan_type,
    module_codes,
    max_users,
    max_parks,
    sort_no,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    plans.plan_code,
    plans.plan_name,
    plans.description,
    'standard',
    to_jsonb(plans.module_codes),
    0,
    0,
    plans.sort_no,
    'enabled',
    'Production-safe SaaS plan seed'
  FROM plans
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, plan_code) WHERE is_deleted = false DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    plan_type = EXCLUDED.plan_type,
    module_codes = EXCLUDED.module_codes,
    max_users = EXCLUDED.max_users,
    max_parks = EXCLUDED.max_parks,
    sort_no = EXCLUDED.sort_no,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, plan_code
),
plan_modules AS (
  SELECT
    upsert_plans.id AS plan_id,
    module.id AS module_id
  FROM upsert_plans
  JOIN plans ON plans.plan_code = upsert_plans.plan_code
  JOIN LATERAL unnest(plans.module_codes) AS plan_module(module_code) ON true
  JOIN sys_module module
    ON module.module_code = plan_module.module_code
   AND module.is_deleted = false
)
INSERT INTO rel_plan_module (
  plan_id,
  module_id,
  status,
  remark
)
SELECT
  plan_id,
  module_id,
  1,
  'Production-safe SaaS plan-module seed'
FROM plan_modules
ON CONFLICT (plan_id, module_id) WHERE is_deleted = false DO UPDATE SET
  status = 1,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
group_plan AS (
  SELECT plan.id
  FROM sys_plan plan
  JOIN seed_scope
    ON seed_scope.tenant_id = plan.tenant_id
   AND seed_scope.park_id = plan.park_id
  WHERE plan.plan_code = 'GROUP'
    AND plan.is_deleted = false
  LIMIT 1
)
INSERT INTO rel_tenant_module (
  tenant_id,
  park_id,
  tenant_code,
  module_id,
  plan_id,
  enabled,
  feature_config,
  status,
  remark
)
SELECT
  seed_scope.tenant_id,
  seed_scope.park_id,
  'JH_DEFAULT',
  module.id,
  group_plan.id,
  true,
  '{}'::jsonb,
  'enabled',
  'Default Jinhu tenant GROUP module authorization seed'
FROM sys_module module
CROSS JOIN seed_scope
CROSS JOIN group_plan
WHERE module.module_code IN ('system','asset','leasing','workorder','iot','energy','robot','video','bim','ai')
  AND module.is_deleted = false
ON CONFLICT (tenant_id, park_id, module_id) WHERE is_deleted = false DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  tenant_code = EXCLUDED.tenant_code,
  enabled = true,
  status = 'enabled',
  feature_config = EXCLUDED.feature_config,
  remark = EXCLUDED.remark,
  is_deleted = false,
  update_time = now();

UPDATE sys_plan
SET is_deleted = true,
    status = 'disabled',
    remark = 'Legacy baseline plan retired by production SaaS plan seed',
    update_time = now()
WHERE plan_code = 'BASELINE'
  AND is_deleted = false;

INSERT INTO biz_park (
  tenant_id,
  park_id,
  park_code,
  park_name,
  status,
  remark
)
VALUES (
  '10000001',
  '20000001',
  'JH',
  '金湖科创产业园',
  1,
  'S2-01 production-safe default park seed'
)
ON CONFLICT (park_code) WHERE is_deleted = false DO UPDATE SET
  park_name = EXCLUDED.park_name,
  status = EXCLUDED.status,
  is_deleted = false,
  update_time = now();

WITH seed_scope AS (
  SELECT
    '10000001' AS tenant_id,
    '20000001' AS park_id
),
dict_types(dict_code, dict_name, remark) AS (
  VALUES
    ('common_status', '通用状态', 'Production-safe common status dictionary'),
    ('org_type', '组织类型', 'Production-safe organization type dictionary'),
    ('file_storage_type', '文件存储类型', 'Production-safe file storage type dictionary'),
    ('file_biz_type', '附件业务类型', 'Production-safe attachment business type dictionary'),
    ('audit_result', '审计结果', 'Production-safe audit result dictionary'),
    ('unit_usage_type', '房源用途', 'Production-safe unit usage type dictionary'),
    ('unit_rental_status', '房源出租状态', 'Production-safe unit rental status dictionary'),
    ('unit_fitting_status', '房源装修状态', 'Production-safe unit fitting status dictionary')
),
upsert_types AS (
  INSERT INTO sys_dict_type (
    tenant_id,
    park_id,
    dict_code,
    dict_name,
    status,
    remark
  )
  SELECT
    seed_scope.tenant_id,
    seed_scope.park_id,
    dict_types.dict_code,
    dict_types.dict_name,
    'enabled',
    dict_types.remark
  FROM dict_types
  CROSS JOIN seed_scope
  ON CONFLICT (tenant_id, park_id, dict_code) WHERE is_deleted = false DO UPDATE SET
    dict_name = EXCLUDED.dict_name,
    status = 'enabled',
    remark = EXCLUDED.remark,
    is_deleted = false,
    update_time = now()
  RETURNING id, tenant_id, park_id, dict_code
),
dict_items(dict_code, item_label, item_value, sort_order, tag_type) AS (
  VALUES
    ('common_status', '启用', 'enabled', 10, 'success'),
    ('common_status', '停用', 'disabled', 20, 'danger'),
    ('org_type', '园区', 'park', 10, 'primary'),
    ('org_type', '部门', 'department', 20, 'default'),
    ('file_storage_type', '本地存储', 'local', 10, 'default'),
    ('file_storage_type', 'MinIO', 'minio', 20, 'default'),
    ('file_storage_type', '对象存储', 'oss', 30, 'default'),
    ('file_biz_type', '合同', 'contract', 10, 'default'),
    ('file_biz_type', '工单', 'workorder', 20, 'default'),
    ('file_biz_type', '隐患整改', 'hazard', 30, 'default'),
    ('file_biz_type', '租户资质', 'tenant_qualification', 40, 'default'),
    ('file_biz_type', '房源照片', 'unit_photo', 50, 'default'),
    ('file_biz_type', '楼层平面图', 'floorplan', 60, 'default'),
    ('file_biz_type', '房源平面图', 'unit_floorplan', 70, 'default'),
    ('file_biz_type', '作业许可', 'permit', 80, 'default'),
    ('file_biz_type', '应急事件', 'emergency', 90, 'default'),
    ('audit_result', '成功', 'success', 10, 'success'),
    ('audit_result', '失败', 'fail', 20, 'danger'),
    ('unit_usage_type', '办公', '10', 10, 'primary'),
    ('unit_usage_type', '厂房', '20', 20, 'default'),
    ('unit_usage_type', '仓储', '30', 30, 'default'),
    ('unit_usage_type', '商业', '40', 40, 'warning'),
    ('unit_usage_type', '展厅', '50', 50, 'primary'),
    ('unit_usage_type', '会议室', '60', 60, 'default'),
    ('unit_rental_status', '可招商', '10', 10, 'success'),
    ('unit_rental_status', '锁定', '20', 20, 'warning'),
    ('unit_rental_status', '已出租', '30', 30, 'primary'),
    ('unit_rental_status', '即将到期', '40', 40, 'warning'),
    ('unit_rental_status', '维修中', '50', 50, 'danger'),
    ('unit_rental_status', '自用', '60', 60, 'default'),
    ('unit_fitting_status', '毛坯', '10', 10, 'default'),
    ('unit_fitting_status', '简装', '20', 20, 'primary'),
    ('unit_fitting_status', '精装', '30', 30, 'success')
)
INSERT INTO sys_dict_item (
  tenant_id,
  park_id,
  dict_type_id,
  item_label,
  item_value,
  sort_order,
  status,
  tag_type,
  remark
)
SELECT
  upsert_types.tenant_id,
  upsert_types.park_id,
  upsert_types.id,
  dict_items.item_label,
  dict_items.item_value,
  dict_items.sort_order,
  'enabled',
  dict_items.tag_type,
  'Production-safe dictionary item seed'
FROM dict_items
JOIN upsert_types ON upsert_types.dict_code = dict_items.dict_code
WHERE NOT EXISTS (
  SELECT 1
  FROM sys_dict_item existing
  WHERE existing.tenant_id = upsert_types.tenant_id
    AND existing.park_id = upsert_types.park_id
    AND existing.dict_type_id = upsert_types.id
    AND existing.item_value = dict_items.item_value
    AND existing.is_deleted = false
);
